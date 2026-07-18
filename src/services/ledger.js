// Opportunity Ledger
// Persists every entry that meets the "interesting plot" criteria to a durable
// ledger (data/ledger.json). For each entry it records:
//   - a snapshot of the plot (location, size, power, sector)
//   - the DC-suitability score + tier
//   - WHY it is interesting (human-readable reasons derived from the score + flags)
//   - the SOURCES that back it (data provider, listing URL, score-factor evidence)
//   - provenance (first_seen, last_seen, seen_count, search origin)
//
// The ledger is deduplicated by a stable key so repeated searches enrich the
// same record rather than creating duplicates.

const fs = require('fs');
const path = require('path');

const LEDGER_PATH = path.join(__dirname, '..', '..', 'data', 'ledger.json');

// ─── Persistence ───────────────────────────────────────────────
let ledger = null; // in-memory index: { key -> record }

function load() {
  if (ledger) return ledger;
  ledger = {};
  try {
    const raw = fs.readFileSync(LEDGER_PATH, 'utf-8');
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      for (const rec of arr) ledger[rec.key] = rec;
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[ledger] could not read ledger:', e.message);
  }
  return ledger;
}

let saveTimer = null;
function scheduleSave() {
  // Debounce writes so a burst of records from one search results in one flush.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}

function flush() {
  saveTimer = null;
  try {
    const arr = Object.values(ledger).sort(
      (a, b) => (b.score?.total_score || 0) - (a.score?.total_score || 0)
    );
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.error('[ledger] failed to write ledger:', e.message);
  }
}

// ─── Keying / dedupe ───────────────────────────────────────────
function makeKey(entry) {
  if (entry.id) return String(entry.id);
  // Fall back to a coarse geo hash (~11m precision) + name
  const lat = Number(entry.lat).toFixed(4);
  const lng = Number(entry.lng).toFixed(4);
  const name = (entry.name || 'site').toLowerCase().replace(/\s+/g, '-').slice(0, 40);
  return `geo-${lat}-${lng}-${name}`;
}

// ─── Qualification criteria ────────────────────────────────────
// An entry is written to the ledger when it is genuinely interesting:
//   - it reaches a top tier (prime/high), OR
//   - it is actionable right now (for sale), OR
//   - it scores at/above the interesting threshold.
const INTERESTING_SCORE = 60;

function qualifies(entry) {
  const s = entry.score || {};
  const tier = s.tier;
  if (tier === 'prime' || tier === 'high') return true;
  if (entry.for_sale === true) return true;
  if ((s.total_score || 0) >= INTERESTING_SCORE) return true;
  return false;
}

// ─── "Why is it interesting" reason builder ────────────────────
function buildReasons(entry) {
  const reasons = [];
  const s = entry.score || {};
  const b = s.breakdown || {};

  if (entry.manual) {
    reasons.push('📍 Manually added by admin — curated opportunity of interest.');
  }

  if (s.tier === 'prime') reasons.push('⭐ Prime-tier site — top-scoring DC candidate.');
  else if (s.tier === 'high') reasons.push('🟢 High-tier site — strong DC candidate.');

  if (entry.for_sale) {
    reasons.push(
      entry.price_eur
        ? `On the market for €${(entry.price_eur / 1e6).toFixed(1)}M — immediately actionable.`
        : 'Currently for sale — immediately actionable.'
    );
  }

  // Highlight the factors where the site is genuinely strong.
  const ix = b.ix_connectivity;
  if (ix && ix.score >= 14) reasons.push(`Excellent connectivity: ${ix.detail}.`);
  else if (ix && ix.score >= 8) reasons.push(`Good connectivity: ${ix.detail}.`);

  const power = b.power_potential;
  if (power && power.score >= 14) reasons.push(`High power potential: ${power.detail}.`);

  const grid = b.grid_future;
  if (grid && grid.score >= 5) reasons.push(`Forward-looking grid: ${grid.detail}.`);

  const eco = b.dc_ecosystem;
  if (eco && eco.score >= 7) reasons.push(`Established DC cluster nearby: ${eco.detail}.`);

  const climate = b.climate_cooling;
  if (climate && climate.score >= 8) reasons.push(`Favourable cooling: ${climate.detail}.`);

  const fiber = b.fiber_proximity;
  if (fiber && fiber.score >= 4) reasons.push(`Well-connected to fiber/cable: ${fiber.detail}.`);

  const size = b.site_size;
  if (size && size.score >= 8) reasons.push(`Large developable footprint: ${size.detail}.`);

  if (!reasons.length && entry.notes) reasons.push(entry.notes);
  return reasons;
}

// ─── Source builder ────────────────────────────────────────────
function buildSources(entry) {
  const sources = [];
  const b = entry.score?.breakdown || {};

  if (entry.data_source) {
    sources.push({ type: 'data', label: entry.data_source, url: entry.listing_url || null });
  }
  if (entry.listing_url) {
    sources.push({ type: 'listing', label: 'Property / registry listing', url: entry.listing_url });
  }
  if (b.ix_connectivity?.nearest_ix) {
    sources.push({
      type: 'ix',
      label: `PeeringDB — nearest IX: ${b.ix_connectivity.nearest_ix} (${b.ix_connectivity.distance_km}km)`,
      url: 'https://www.peeringdb.com'
    });
  }
  if (b.grid_future && b.grid_future.score > 0 && b.grid_future.detail && !/no grid/i.test(b.grid_future.detail)) {
    sources.push({ type: 'grid', label: `Grid/renewables: ${b.grid_future.detail}`, url: null });
  }
  if (b.dc_ecosystem && b.dc_ecosystem.score > 0) {
    sources.push({
      type: 'ecosystem',
      label: `OpenStreetMap/Overpass — ${b.dc_ecosystem.detail}`,
      url: 'https://www.openstreetmap.org'
    });
  }
  return sources;
}

// ─── Record ────────────────────────────────────────────────────
// Records a single scored entry if it qualifies. Returns true if written.
function record(entry, meta = {}) {
  if (!entry || entry.lat == null || entry.lng == null) return false;
  if (!meta.force && !qualifies(entry)) return false;

  load();
  const key = makeKey(entry);
  const now = new Date().toISOString();
  const existing = ledger[key];

  const snapshot = {
    key,
    id: entry.id || key,
    name: entry.name || 'Unnamed site',
    country: entry.country || null,
    city: entry.city || null,
    address: entry.address || null,
    lat: entry.lat,
    lng: entry.lng,
    area_m2: entry.area_m2 || null,
    estimated_power_mw: entry.estimated_power_mw || null,
    estimated_power_kw: entry.estimated_power_kw || null,
    sector: entry.sector || null,
    for_sale: entry.for_sale === true,
    price_eur: entry.price_eur || null,
    listing_url: entry.listing_url || null,
    notes: entry.notes || null,
    manual: entry.manual === true,
    data_source: entry.data_source || null,
    added_by: meta.added_by || entry.added_by || null,
    score: entry.score || null,
    reasons: buildReasons(entry),
    sources: buildSources(entry),
    origin: meta.origin || null // e.g. { profile, near, radius_km, country }
  };

  if (existing) {
    // Keep the best score seen; refresh evidence + provenance.
    const keepScore = (existing.score?.total_score || 0) >= (entry.score?.total_score || 0)
      ? existing.score : entry.score;
    ledger[key] = {
      ...existing,
      ...snapshot,
      score: keepScore,
      reasons: buildReasons({ ...entry, score: keepScore }),
      first_seen: existing.first_seen || now,
      last_seen: now,
      seen_count: (existing.seen_count || 1) + 1
    };
  } else {
    ledger[key] = {
      ...snapshot,
      first_seen: now,
      last_seen: now,
      seen_count: 1
    };
  }
  scheduleSave();
  return true;
}

// Records a batch; returns number of entries written/updated.
function recordBatch(entries, meta = {}) {
  let n = 0;
  for (const e of entries || []) {
    if (record(e, meta)) n++;
  }
  return n;
}

// ─── Query ─────────────────────────────────────────────────────
function getAll(filters = {}) {
  load();
  let items = Object.values(ledger);
  if (filters.country) items = items.filter(i => i.country === filters.country);
  if (filters.tier) items = items.filter(i => i.score?.tier === filters.tier);
  if (filters.for_sale === true) items = items.filter(i => i.for_sale === true);
  if (filters.manual === true) items = items.filter(i => i.manual === true);
  if (filters.min_score) items = items.filter(i => (i.score?.total_score || 0) >= Number(filters.min_score));
  items.sort((a, b) => (b.score?.total_score || 0) - (a.score?.total_score || 0));
  return items;
}

function clear() {
  load();
  ledger = {};
  scheduleSave();
}

function remove(key) {
  load();
  if (ledger[key]) {
    delete ledger[key];
    scheduleSave();
    return true;
  }
  return false;
}

// ─── CSV export ────────────────────────────────────────────────
function toCSV(filters = {}) {
  const rows = getAll(filters);
  const cols = [
    'id', 'name', 'country', 'city', 'lat', 'lng', 'area_m2',
    'estimated_power_mw', 'estimated_power_kw', 'sector', 'for_sale', 'price_eur',
    'score', 'tier', 'reasons', 'sources', 'listing_url', 'first_seen', 'last_seen', 'seen_count'
  ];
  const esc = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push([
      r.id, r.name, r.country, r.city, r.lat, r.lng, r.area_m2,
      r.estimated_power_mw, r.estimated_power_kw, r.sector, r.for_sale, r.price_eur,
      r.score?.total_score, r.score?.tier,
      (r.reasons || []).join(' | '),
      (r.sources || []).map(s => `${s.label}${s.url ? ' <' + s.url + '>' : ''}`).join(' | '),
      r.listing_url, r.first_seen, r.last_seen, r.seen_count
    ].map(esc).join(','));
  }
  return lines.join('\n');
}

function stats() {
  const all = getAll();
  const byTier = {};
  const byCountry = {};
  let forSale = 0;
  for (const r of all) {
    const t = r.score?.tier || 'unknown';
    byTier[t] = (byTier[t] || 0) + 1;
    if (r.country) byCountry[r.country] = (byCountry[r.country] || 0) + 1;
    if (r.for_sale) forSale++;
  }
  return { total: all.length, for_sale: forSale, by_tier: byTier, by_country: byCountry };
}

module.exports = {
  record,
  recordBatch,
  getAll,
  clear,
  remove,
  toCSV,
  stats,
  qualifies,
  INTERESTING_SCORE
};
