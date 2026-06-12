const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days for Overpass data

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function readCache(key) {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (Date.now() - stat.mtimeMs > CACHE_TTL) return null;
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
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) return await resp.json();
    } catch (e) { /* try next endpoint */ }
  }
  throw new Error('All Overpass endpoints failed');
}

async function getDatacenters(lat, lng, radiusMeters) {
  const cacheKey = `dc-${lat.toFixed(2)}-${lng.toFixed(2)}-${radiusMeters}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

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

  const json = await queryOverpass(query);

  const seen = new Set();
  const datacenters = json.elements
    .map(el => {
      const elLat = el.lat || (el.center && el.center.lat);
      const elLng = el.lon || (el.center && el.center.lon);
      if (!elLat || !elLng) return null;

      const key = `${elLat.toFixed(4)},${elLng.toFixed(4)}`;
      if (seen.has(key)) return null;
      seen.add(key);

      return {
        id: el.id,
        name: (el.tags && (el.tags.name || el.tags.operator)) || 'Unknown Datacenter',
        lat: elLat,
        lng: elLng,
        operator: el.tags && el.tags.operator,
        source: 'OpenStreetMap'
      };
    })
    .filter(Boolean);

  writeCache(cacheKey, datacenters);
  return datacenters;
}

module.exports = { getDatacenters };
