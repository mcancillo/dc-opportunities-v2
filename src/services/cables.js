const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

const TARGET_COUNTRIES = ['Netherlands', 'Germany', 'Poland', 'Spain',
  'Canary Islands, Spain', 'Netherlands Antilles'];

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

async function queryOverpass(query) {
  const encoded = encodeURIComponent(query);
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(`${endpoint}?data=${encoded}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (resp.ok) return await resp.json();
    } catch (e) { /* try next */ }
  }
  throw new Error('All Overpass endpoints failed');
}

// Subsea cable landing points from TeleGeography dataset
function getLandingPoints() {
  const cached = readCache('landing-points');
  if (cached) return cached;

  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'landing-points.json'), 'utf-8'));

  const points = raw.features
    .filter(f => {
      const name = f.properties.name || '';
      return TARGET_COUNTRIES.some(c => name.includes(c));
    })
    .filter(f => {
      // Exclude overseas territories not in Europe
      const name = f.properties.name || '';
      if (name.includes('Canary Islands')) return false;
      if (name.includes('Netherlands Antilles')) return false;
      if (name.includes('Trinidad')) return false;
      return true;
    })
    .map(f => ({
      id: f.properties.id,
      name: f.properties.name,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0]
    }));

  writeCache('landing-points', points);
  return points;
}

// Subsea cable routes from TeleGeography dataset (filtered to Europe bbox)
function getSubseaCables() {
  const cached = readCache('subsea-cables');
  if (cached) return cached;

  const raw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'subsea-cables.json'), 'utf-8'));

  const euroBbox = { minLat: 34, maxLat: 58, minLng: -12, maxLng: 22 };
  const seen = new Set();

  const cables = raw.features
    .filter(f => {
      if (!f.geometry || !f.geometry.coordinates) return false;
      const coords = f.geometry.type === 'MultiLineString'
        ? f.geometry.coordinates.flat()
        : f.geometry.coordinates;
      // Check if any coordinate falls within European bbox
      return coords.some(c =>
        c[1] >= euroBbox.minLat && c[1] <= euroBbox.maxLat &&
        c[0] >= euroBbox.minLng && c[0] <= euroBbox.maxLng
      );
    })
    .map(f => {
      const key = f.properties.name || f.properties.id;
      if (seen.has(key)) return null;

      let coords;
      if (f.geometry.type === 'MultiLineString') {
        // Clip each line segment to Europe
        coords = f.geometry.coordinates
          .filter(line => line.some(c =>
            c[1] >= euroBbox.minLat && c[1] <= euroBbox.maxLat &&
            c[0] >= euroBbox.minLng && c[0] <= euroBbox.maxLng
          ))
          .map(line => line.map(c => [c[1], c[0]])); // flip to [lat,lng]
      } else {
        coords = [f.geometry.coordinates
          .filter(c =>
            c[1] >= euroBbox.minLat && c[1] <= euroBbox.maxLat &&
            c[0] >= euroBbox.minLng && c[0] <= euroBbox.maxLng
          )
          .map(c => [c[1], c[0]])];
      }

      // Skip cables with no European segments
      if (coords.every(line => line.length < 2)) return null;
      seen.add(key);

      return {
        name: f.properties.name,
        color: f.properties.color ? `#${f.properties.color}` : '#66aaff',
        segments: coords
      };
    })
    .filter(Boolean);

  writeCache('subsea-cables', cables);
  return cables;
}

// Fiber backbone routes from OSM (Europe coverage)
async function getFiberBackbone() {
  const cached = readCache('fiber-backbone');
  if (cached) return cached;

  // Query fiber/telecom lines in our target area
  // Split into sub-regions to avoid timeout
  const regions = [
    { name: 'NL-DE-North', bbox: '51,3,55,14' },
    { name: 'DE-PL', bbox: '49,8,55,22' },
    { name: 'ES', bbox: '35,-10,44,4' }
  ];

  const allFibers = [];

  for (const region of regions) {
    try {
      const query = [
        '[out:json][timeout:30];',
        `way["communication"="line"](${region.bbox});`,
        'out geom;'
      ].join('');

      const json = await queryOverpass(query);

      json.elements.forEach(el => {
        if (!el.geometry || el.geometry.length < 2) return;
        allFibers.push({
          name: (el.tags && el.tags.name) || 'Fiber backbone',
          operator: el.tags && el.tags.operator,
          coords: el.geometry.map(g => [g.lat, g.lon])
        });
      });
    } catch (e) {
      console.warn(`Fiber backbone query failed for ${region.name}:`, e.message);
    }
  }

  // Also get submarine cables from OSM
  try {
    const query = '[out:json][timeout:30];way["man_made"="submarine_cable"](35,-10,55,22);out geom;';
    const json = await queryOverpass(query);

    json.elements.forEach(el => {
      if (!el.geometry || el.geometry.length < 2) return;
      allFibers.push({
        name: (el.tags && el.tags.name) || 'Submarine cable',
        operator: el.tags && el.tags.operator,
        coords: el.geometry.map(g => [g.lat, g.lon]),
        submarine: true
      });
    });
  } catch (e) {
    console.warn('Submarine cable query failed:', e.message);
  }

  writeCache('fiber-backbone', allFibers);
  return allFibers;
}

module.exports = { getLandingPoints, getSubseaCables, getFiberBackbone };
