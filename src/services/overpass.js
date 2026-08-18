const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const datacentermap = require('./datacentermap');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days for Overpass data

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readCache(key, ignoreTtl = false) {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (!ignoreTtl && Date.now() - stat.mtimeMs > CACHE_TTL) return null;
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function writeCache(key, data) {
  ensureCacheDir();
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
}

const OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

async function queryOverpass(query) {
  const encoded = encodeURIComponent(query);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(`${endpoint}?data=${encoded}`, {
        headers: { 'Accept': 'application/json' },
        timeout: 12000
      });
      if (resp.ok) return await resp.json();
    } catch (e) { /* try next endpoint */ }
  }
  throw new Error('All Overpass endpoints failed');
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Merge two datacenter lists, de-duplicating by ~100m proximity. Entries earlier
// in the combined order win (used to prefer richer DataCenterMap metadata).
function dedupeByProximity(list) {
  const kept = [];
  for (const dc of list) {
    if (!Number.isFinite(dc.lat) || !Number.isFinite(dc.lng)) continue;
    const dup = kept.find(k => haversineM(k.lat, k.lng, dc.lat, dc.lng) < 120);
    if (!dup) kept.push(dc);
  }
  return kept;
}

async function getDatacenters(lat, lng, radiusMeters) {
  // Accumulate OSM datacenters per AREA (not per radius) so expanding the radius
  // never drops previously-found sites, and a timed-out large query falls back to
  // the accumulated superset instead of returning empty.
  const areaKey = `dc-area-${lat.toFixed(1)}-${lng.toFixed(1)}`;
  let superset = readCache(areaKey, true) || [];

  // Query multiple datacenter tags (including British spelling) for better coverage
  const query = [
    '[out:json][timeout:30];',
    '(',
    `node["telecom"="data_center"](around:${radiusMeters},${lat},${lng});`,
    `way["telecom"="data_center"](around:${radiusMeters},${lat},${lng});`,
    `node["building"="data_centre"](around:${radiusMeters},${lat},${lng});`,
    `way["building"="data_centre"](around:${radiusMeters},${lat},${lng});`,
    `node["building"="data_center"](around:${radiusMeters},${lat},${lng});`,
    `way["building"="data_center"](around:${radiusMeters},${lat},${lng});`,
    `node["man_made"="data_center"](around:${radiusMeters},${lat},${lng});`,
    `way["man_made"="data_center"](around:${radiusMeters},${lat},${lng});`,
    ');',
    'out body center;'
  ].join('');

  try {
    const json = await queryOverpass(query);
    const seen = new Set(superset.map(d => d.id));
    for (const el of json.elements) {
      const elLat = el.lat || (el.center && el.center.lat);
      const elLng = el.lon || (el.center && el.center.lon);
      if (!elLat || !elLng) continue;
      const id = `OSM-${el.type}-${el.id}`;
      if (seen.has(id)) continue;
      seen.add(id);
      superset.push({
        id,
        name: (el.tags && (el.tags.name || el.tags.operator)) || 'Unknown Datacenter',
        lat: elLat,
        lng: elLng,
        operator: (el.tags && el.tags.operator) || null,
        status: 'operational',
        upcoming: false,
        source: 'OpenStreetMap'
      });
    }
    writeCache(areaKey, superset);
  } catch (e) {
    // Upstream (public Overpass) unavailable — keep the accumulated superset so
    // the datacenter layer doesn't vanish (and DataCenterMap below still shows).
    console.warn(`Datacenters: Overpass unavailable (${e.message}); using cached OSM superset (${superset.length})`);
  }

  // OSM sites within the requested radius.
  const osmInRadius = superset.filter(d => haversineM(lat, lng, d.lat, d.lng) <= radiusMeters);

  // Merge the curated DataCenterMap source (current + upcoming). It's listed
  // first so its richer metadata (operator/status) wins on de-duplication.
  const dcm = datacentermap.getNearby(lat, lng, radiusMeters);
  return dedupeByProximity([...dcm, ...osmInRadius]);
}

module.exports = { getDatacenters };

