// Evaluation step: scores the quality of the agent's own output each run and
// tracks it over time, so the optimization (tune) step has a signal to act on.
import { readJson, writeJson, log } from './util.mjs';

const HISTORY_FILE = 'data/optimizer/metrics-history.json';

// Check a sample of URLs for reachability (bounded to respect the run budget).
// A source counts as "alive" if the server responds at all — including gated
// responses (401/403/429) and redirects — since those confirm the resource
// exists. Only real failures (DNS/TLS error, timeout, 404/410, 5xx) count dead.
async function checkReachability(urls, budget, cap = 15) {
  const sample = urls.slice(0, cap);
  const ALIVE = new Set([401, 403, 405, 429]);
  const isAlive = (s) => (s >= 200 && s < 400) || ALIVE.has(s);
  let ok = 0, checked = 0;
  const dead = [];
  for (const url of sample) {
    if (budget.expired) break;
    checked++;
    const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; DC-Opportunities-Optimizer/1.0)' };
    const attempt = async (method) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { method, redirect: 'follow', signal: ctrl.signal, headers });
        return res.status;
      } finally {
        clearTimeout(t);
      }
    };
    try {
      let status = await attempt('HEAD');
      if (!isAlive(status)) status = await attempt('GET'); // some servers reject/limit HEAD
      if (isAlive(status)) ok++;
      else dead.push({ url, status });
    } catch (e) {
      try {
        const status = await attempt('GET');
        if (isAlive(status)) { ok++; continue; }
        dead.push({ url, status });
      } catch (e2) {
        dead.push({ url, status: e2.name === 'AbortError' ? 'timeout' : 'error' });
      }
    }
  }
  return { checked, ok, dead, rate: checked ? ok / checked : null };
}

// Normalized Shannon entropy (0..1) over a distribution of counts.
function diversity(counts) {
  const vals = Object.values(counts).filter(v => v > 0);
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0 || vals.length <= 1) return vals.length <= 1 ? 0 : 0;
  const H = -vals.reduce((a, v) => { const p = v / total; return a + p * Math.log2(p); }, 0);
  return H / Math.log2(vals.length);
}

export function loadHistory() {
  return readJson(HISTORY_FILE, { runs: [] });
}

export async function evaluate(cfg, { sources, run, briefing, budget }) {
  const scope = cfg.countries.map(c => c.code);

  // Distribution of all emerging sources currently in the repo.
  const catCounts = {}, countryCounts = {};
  for (const code of scope) {
    const list = sources[code]?.emerging_data_sources || [];
    countryCounts[code] = list.length;
    for (const s of list) catCounts[s.category || 'other'] = (catCounts[s.category || 'other'] || 0) + 1;
  }

  const discovered = run.counts.discovered || 0;
  const promoted = run.counts.promoted || 0;
  const rejected = run.counts.rejected || 0;

  // Reachability of this run's newly promoted URLs (fall back to existing emerging if none new).
  const newUrls = (run.promoted || []).map(p => p.url);
  const existingUrls = scope.flatMap(c => (sources[c]?.emerging_data_sources || []).map(s => s.url));
  const reach = await checkReachability(newUrls.length ? newUrls : existingUrls, budget);

  const country_coverage = scope.filter(c => (countryCounts[c] || 0) > 0).length / scope.length;
  const category_diversity = diversity(catCounts);
  const promotion_rate = discovered ? promoted / discovered : 0;
  const duplicate_rate = discovered ? rejected / discovered : 0;
  const briefing_utilization = briefing.origin && briefing.origin !== 'none' ? 1 : 0;

  // Composite quality score (0-100). Reachability weighted most; only counts when sampled.
  const parts = [];
  if (reach.rate != null) parts.push({ w: 0.40, v: reach.rate });
  parts.push({ w: 0.20, v: country_coverage });
  parts.push({ w: 0.15, v: category_diversity });
  parts.push({ w: 0.15, v: briefing_utilization });
  parts.push({ w: 0.10, v: Math.min(1, promotion_rate * 2) }); // reward some flow, not runaway
  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const quality = Math.round((parts.reduce((a, p) => a + p.w * p.v, 0) / wsum) * 100);

  const metrics = {
    date: new Date().toISOString().slice(0, 10),
    run_at: run.run_at,
    quality_score: quality,
    reachability: reach.rate,
    reachability_checked: reach.checked,
    country_coverage: Number(country_coverage.toFixed(3)),
    category_diversity: Number(category_diversity.toFixed(3)),
    promotion_rate: Number(promotion_rate.toFixed(3)),
    duplicate_rate: Number(duplicate_rate.toFixed(3)),
    briefing_utilization,
    counts: run.counts,
    country_counts: countryCounts,
    category_counts: catCounts,
    dead_links: reach.dead
  };

  log(`evaluation: quality=${quality} reach=${reach.rate == null ? 'n/a' : (reach.rate * 100).toFixed(0) + '%'} coverage=${(country_coverage * 100).toFixed(0)}% diversity=${category_diversity.toFixed(2)}`);
  return metrics;
}

export function pushHistory(history, metrics) {
  history.runs.push(metrics);
  if (history.runs.length > 180) history.runs = history.runs.slice(-180); // keep ~6 months
  history.updated_at = new Date().toISOString();
  writeJson(HISTORY_FILE, history);
  return history;
}
