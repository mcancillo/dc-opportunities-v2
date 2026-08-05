// Self-optimization step: adjusts the agent's learned parameters based on the
// evaluation metrics and their recent trend. All changes are bounded and logged;
// the agent applies these params on the next run (discovery + acceptance).
import { PARAM_BOUNDS, clamp, round2 } from './params.mjs';
import { log } from './util.mjs';

const TARGET_CATEGORIES = [
  'grid-capacity', 'industrial-land', 'brownfield', 'permitting',
  'renewable', 'port-land', 'cadastral', 'connectivity'
];

export function optimizeParams(cfg, { metrics, history, params }) {
  const changes = [];
  const next = {
    ...params,
    countryEmphasis: { ...params.countryEmphasis },
    categoryEmphasis: { ...params.categoryEmphasis }
  };
  const b = PARAM_BOUNDS;
  const recent = [...(history.runs || []), metrics].slice(-3);

  // 1. Reachability -> pickiness. Only act on a meaningful sample.
  if (metrics.reachability != null && metrics.reachability_checked >= 5) {
    if (metrics.reachability < 0.6) {
      const v = clamp(round2(next.minConfidence + b.minConfidence.step), b.minConfidence.min, b.minConfidence.max);
      if (v !== next.minConfidence) { changes.push(`minConfidence ${next.minConfidence} -> ${v} (low reachability ${(metrics.reachability * 100).toFixed(0)}%)`); next.minConfidence = v; }
    } else if (metrics.reachability >= 0.9) {
      const v = clamp(round2(next.minConfidence - b.minConfidence.step / 2), b.minConfidence.min, b.minConfidence.max);
      if (v !== next.minConfidence) { changes.push(`minConfidence ${next.minConfidence} -> ${v} (high reachability, allow more flow)`); next.minConfidence = v; }
    }
  }

  // 2. Stagnation -> explore more. No promotions across the last 3 runs.
  const stagnant = recent.length >= 3 && recent.every(r => (r.counts?.promoted ?? 0) === 0);
  if (stagnant) {
    const mc = clamp(next.maxCandidatesPerCountry + b.maxCandidatesPerCountry.step, b.maxCandidatesPerCountry.min, b.maxCandidatesPerCountry.max);
    if (mc !== next.maxCandidatesPerCountry) { changes.push(`maxCandidatesPerCountry ${next.maxCandidatesPerCountry} -> ${mc} (3 runs without promotions)`); next.maxCandidatesPerCountry = mc; }
    const conf = clamp(round2(next.minConfidence - b.minConfidence.step), b.minConfidence.min, b.minConfidence.max);
    if (conf !== next.minConfidence) { changes.push(`minConfidence ${next.minConfidence} -> ${conf} (stagnation: broaden acceptance)`); next.minConfidence = conf; }
  }

  // 3. Country coverage -> emphasise under-covered countries, decay well-covered ones.
  const counts = metrics.country_counts || {};
  const codes = cfg.countries.map(c => c.code);
  const mean = codes.reduce((a, c) => a + (counts[c] || 0), 0) / (codes.length || 1);
  for (const c of codes) {
    const n = counts[c] || 0;
    const cur = next.countryEmphasis[c] ?? 1;
    let v = cur;
    if (n === 0) v = clamp(round2(Math.max(cur, 1.5)), b.emphasis.min, b.emphasis.max);
    else if (n > mean) v = clamp(round2(cur - 0.1), b.emphasis.min, 1);
    else v = clamp(round2(cur + (1 - cur) * 0.5), b.emphasis.min, b.emphasis.max); // decay toward 1
    if (v !== cur) { changes.push(`countryEmphasis.${c} ${cur} -> ${v} (coverage ${n}/${mean.toFixed(1)})`); next.countryEmphasis[c] = v; }
  }

  // 4. Category emphasis -> boost under-represented target categories.
  const cat = metrics.category_counts || {};
  const catMean = TARGET_CATEGORIES.reduce((a, k) => a + (cat[k] || 0), 0) / TARGET_CATEGORIES.length;
  for (const k of TARGET_CATEGORIES) {
    const n = cat[k] || 0;
    const cur = next.categoryEmphasis[k] ?? 1;
    const v = n < catMean ? clamp(1.3, b.emphasis.min, b.emphasis.max) : 1;
    if (v !== cur) { changes.push(`categoryEmphasis.${k} ${cur} -> ${v} (count ${n} vs mean ${catMean.toFixed(1)})`); next.categoryEmphasis[k] = v; }
  }

  next.updated_at = new Date().toISOString();
  next.notes = changes;
  if (changes.length) log(`tuning applied ${changes.length} change(s):`, changes.join(' | '));
  else log('tuning: no parameter changes this run');
  return { params: next, changes };
}
