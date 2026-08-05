// Validate + dedupe discovered candidates against what the repo already knows.
import { domainOf } from './util.mjs';

// Collect every domain already referenced anywhere in sources.json.
export function knownDomains(sources) {
  const domains = new Set();
  const walk = (node) => {
    if (!node) return;
    if (typeof node === 'string') {
      if (/^https?:\/\//i.test(node)) domains.add(domainOf(node));
      return;
    }
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === 'object') return Object.values(node).forEach(walk);
  };
  walk(sources);
  return domains;
}

export function validateCandidates(candidates, { sources, backlog, cfg, minConfidence }) {
  const scope = new Set(cfg.countries.map(c => c.code));
  const known = knownDomains(sources);
  const threshold = typeof minConfidence === 'number' ? minConfidence : cfg.acceptance.minConfidence;
  const backlogDomains = new Set((backlog?.candidates || []).map(c => `${c.country}:${domainOf(c.url)}`));
  const seenThisRun = new Set();

  const accepted = [], newBacklog = [], rejected = [];

  for (const c of candidates) {
    const reason = [];
    if (!c || !c.country || !c.url || !c.name) reason.push('missing required field');
    if (c.country && !scope.has(c.country)) reason.push(`out-of-scope country ${c.country}`);
    if (cfg.acceptance.requireHttps && !/^https:\/\//i.test(c.url || '')) reason.push('not https');

    const dom = domainOf(c.url || '');
    const key = `${c.country}:${dom}`;
    if (!reason.length) {
      if (known.has(dom)) reason.push('already in sources.json');
      else if (backlogDomains.has(key)) reason.push('already in backlog');
      else if (seenThisRun.has(key)) reason.push('duplicate in this run');
    }

    if (reason.length) { rejected.push({ ...c, reason: reason.join('; ') }); continue; }

    seenThisRun.add(key);
    const entry = {
      country: c.country,
      name: c.name,
      url: c.url,
      category: c.category || 'other',
      angle: c.angle || '',
      rationale: c.rationale || '',
      confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : 0.5,
      source: c.source || 'unknown',
      discovered_at: new Date().toISOString().slice(0, 10)
    };
    if (entry.confidence >= threshold) accepted.push(entry);
    else newBacklog.push(entry);
  }

  return { accepted, newBacklog, rejected };
}
