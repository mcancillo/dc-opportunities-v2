// Ingests the "DC Audio Briefing" (produced/managed by Cowork) and turns it into
// structured signals the discovery step can act on.
//
// Cowork does not expose a public API here, so the briefing is consumed as an
// EXPORT that Cowork drops somewhere the agent can read:
//   - DC_AUDIO_BRIEFING_URL  -> https URL to a .json / .txt / .md / .vtt export
//   - DC_AUDIO_BRIEFING_FILE -> local path (e.g. committed or uploaded artifact)
// If neither is set, the agent falls back to the last cached briefing (if any)
// and otherwise runs with empty signals (heuristic seeds only).
import fs from 'node:fs';
import { repoPath, readJson, writeJson, log } from './util.mjs';

const THEME_KEYWORDS = {
  power: ['power', 'megawatt', 'mw', 'grid', 'substation', 'connection queue', 'curtailment', 'energy', 'ppa'],
  land: ['land', 'plot', 'parcel', 'brownfield', 'greenfield', 'industrial zone', 'business park', 'rezoning', 'zoning'],
  permitting: ['permit', 'permitting', 'planning', 'environmental', 'moratorium', 'nitrogen', 'water usage'],
  connectivity: ['fiber', 'fibre', 'dark fiber', 'ix', 'peering', 'subsea', 'cable', 'landing'],
  cooling: ['cooling', 'water', 'district heating', 'heat reuse', 'climate'],
  market: ['hyperscaler', 'colocation', 'acquisition', 'land bank', 'pipeline', 'vacancy', 'pre-lease']
};

const COUNTRY_HINTS = {
  NL: ['netherlands', 'dutch', 'amsterdam', 'holland', 'groningen', 'eemshaven', 'rotterdam'],
  BE: ['belgium', 'belgian', 'brussels', 'flanders', 'wallonia', 'antwerp', 'ghent'],
  DE: ['germany', 'german', 'frankfurt', 'berlin', 'munich', 'hamburg', 'rhein'],
  PL: ['poland', 'polish', 'warsaw', 'warszawa', 'katowice', 'krakow', 'gdansk'],
  ES: ['spain', 'spanish', 'madrid', 'barcelona', 'aragon', 'zaragoza', 'bilbao']
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'DC-Opportunities-Optimizer/1.0' } });
  if (!res.ok) throw new Error(`briefing fetch ${res.status}`);
  return res.text();
}

// Strip WebVTT/SRT cue markup down to spoken text.
function vttToText(raw) {
  return raw
    .replace(/^WEBVTT.*$/gm, '')
    .replace(/^\d+$/gm, '')
    .replace(/^[\d:.]+\s+-->\s+[\d:.]+.*$/gm, '')
    .replace(/<[^>]+>/g, '')
    .split('\n').map(l => l.trim()).filter(Boolean).join(' ');
}

function toPlainText(raw, hint) {
  const trimmed = raw.trimStart();
  if (hint?.endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const j = JSON.parse(raw);
      return j.transcript || j.text || j.summary || j.body ||
        (Array.isArray(j.segments) ? j.segments.map(s => s.text || '').join(' ') : JSON.stringify(j));
    } catch { /* fall through */ }
  }
  if (hint?.endsWith('.vtt') || trimmed.startsWith('WEBVTT')) return vttToText(raw);
  return raw;
}

function deriveSignals(text) {
  const lc = text.toLowerCase();
  const themes = {};
  for (const [theme, words] of Object.entries(THEME_KEYWORDS)) {
    const hits = words.reduce((n, w) => n + (lc.includes(w) ? 1 : 0), 0);
    if (hits) themes[theme] = hits;
  }
  const countries = {};
  for (const [code, hints] of Object.entries(COUNTRY_HINTS)) {
    const hits = hints.reduce((n, w) => n + (lc.includes(w) ? 1 : 0), 0);
    if (hits) countries[code] = hits;
  }
  // Salient sentences: those mentioning a theme keyword, capped for the LLM prompt.
  const allThemeWords = Object.values(THEME_KEYWORDS).flat();
  const sentences = text.split(/(?<=[.!?])\s+/)
    .filter(s => allThemeWords.some(w => s.toLowerCase().includes(w)))
    .slice(0, 40);
  return { themes, countries, highlights: sentences };
}

export async function loadBriefing(cfg) {
  const url = process.env[cfg.briefing.urlEnv];
  const file = process.env[cfg.briefing.fileEnv];
  let raw = null, hint = null, origin = null;

  try {
    if (url) { raw = await fetchText(url); hint = url; origin = 'url'; }
    else if (file && fs.existsSync(file)) { raw = fs.readFileSync(file, 'utf8'); hint = file; origin = 'file'; }
  } catch (e) {
    log('briefing load failed:', e.message);
  }

  if (raw == null) {
    const cached = readJson(cfg.briefing.cacheFile);
    if (cached) { log('using cached briefing from', cached.fetchedAt); return { ...cached, origin: 'cache' }; }
    log('no DC Audio Briefing available — proceeding with heuristic seeds only');
    return { fetchedAt: new Date().toISOString(), origin: 'none', text: '', signals: { themes: {}, countries: {}, highlights: [] } };
  }

  const text = toPlainText(raw, hint);
  const briefing = {
    fetchedAt: new Date().toISOString(),
    origin,
    source: hint,
    length: text.length,
    text: text.slice(0, 20000),
    signals: deriveSignals(text)
  };
  writeJson(cfg.briefing.cacheFile, briefing);
  log(`briefing ingested (${text.length} chars) themes=${Object.keys(briefing.signals.themes).join(',') || 'none'}`);
  return briefing;
}
