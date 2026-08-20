// GÉANT pan-European backbone — REAL inter-city fibre links.
//
// Source: the GÉANT Connectivity Map data feed
// (https://map.geant.org/maps/nodes_and_edges). GÉANT is the pan-European
// research & education backbone; the feed publishes its POP cities (nodes) and
// the actual backbone fibre/spectrum links between them (edges). We resolve each
// European edge to its two endpoint city coordinates so the map plots real
// backbone landlines between exchanges instead of synthetic straight hops.
//
// Fetched live (7-day cache) with a checked-in snapshot fallback
// (data/geant-backbone.json) so the layer always renders offline.

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const FEED_URL = 'https://map.geant.org/maps/nodes_and_edges';
const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const SNAPSHOT = path.join(__dirname, '..', '..', 'data', 'geant-backbone.json');

// Broad European bounding box — drops intercontinental gateway edges so the
// overlay stays a clean European backbone.
const inEurope = p => p.lat >= 34 && p.lat <= 72 && p.lng >= -25 && p.lng <= 45;

function readCache(key, ignoreTtl = false) {
  const file = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (!ignoreTtl && Date.now() - stat.mtimeMs > CACHE_TTL) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}

function writeCache(key, data) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
}

function transform(feed) {
  const byId = new Map();
  for (const c of feed.cities || []) {
    const lat = parseFloat(c.lat), lng = parseFloat(c.long);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      byId.set(c.id, { name: c.name, lat, lng, cc: c.country_code, oe: c.open_exchange });
    }
  }

  const seen = new Set();
  const links = [];
  const euEdges = (feed.links && feed.links.europe) || [];
  for (const l of euEdges) {
    const a = byId.get(l.endpoint1_id), b = byId.get(l.endpoint2_id);
    if (!a || !b || !inEurope(a) || !inEurope(b)) continue;
    const key = [l.endpoint1_id, l.endpoint2_id].sort((x, y) => x - y).join('-');
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({
      name: `${a.name} \u2194 ${b.name}`,
      operator: 'GÉANT',
      from: a.name,
      to: b.name,
      capacity: l.capacity_norm || l.capacity || null,
      coords: [[a.lat, a.lng], [b.lat, b.lng]]
    });
  }

  const nodes = [...byId.values()].filter(inEurope).map(p => ({
    name: p.name, lat: p.lat, lng: p.lng, country: p.cc, open_exchange: !!p.oe
  }));

  return { source: FEED_URL, fetched: new Date().toISOString(), node_count: nodes.length, link_count: links.length, nodes, links };
}

function loadSnapshot() {
  try { return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf-8')); }
  catch (e) { return { nodes: [], links: [], node_count: 0, link_count: 0 }; }
}

// Real European backbone (nodes + inter-city links). Live feed → cache →
// checked-in snapshot, so the layer is always populated.
async function getBackboneLinks() {
  const cached = readCache('geant-backbone');
  if (cached) return cached;

  try {
    const resp = await fetch(FEED_URL, { headers: { Accept: 'application/json' }, timeout: 15000 });
    if (!resp.ok) throw new Error(`GÉANT feed HTTP ${resp.status}`);
    const feed = await resp.json();
    const data = transform(feed);
    if (data.links.length) {
      writeCache('geant-backbone', data);
      return data;
    }
    throw new Error('GÉANT feed returned no European links');
  } catch (e) {
    console.warn(`GÉANT backbone: live fetch failed (${e.message}); using snapshot`);
    const stale = readCache('geant-backbone', true);
    return stale || loadSnapshot();
  }
}

module.exports = { getBackboneLinks };
