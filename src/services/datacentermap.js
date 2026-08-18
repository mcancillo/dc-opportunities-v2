// DataCenterMap source — current + upcoming datacenters.
//
// DataCenterMap (https://www.datacentermap.com/) does not expose a public API
// (exports are commercial/on-request) and rate-limits scraping, so we ship a
// curated, attributed extract in data/datacenters-datacentermap.json and filter
// it by radius here. This dataset is stable, which also means the datacenter
// layer no longer disappears when the live Overpass query times out.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'datacenters-datacentermap.json');

let dataset = null;
function load() {
  if (dataset) return dataset;
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    dataset = Array.isArray(raw.datacenters) ? raw.datacenters : [];
  } catch (e) {
    console.warn('DataCenterMap dataset not loaded:', e.message);
    dataset = [];
  }
  return dataset;
}

function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Return DataCenterMap datacenters within radiusMeters of the point, normalized
// to the same shape as the OSM datacenters (plus status/upcoming flags).
function getNearby(lat, lng, radiusMeters) {
  return load()
    .filter(dc => Number.isFinite(dc.lat) && Number.isFinite(dc.lng))
    .map(dc => ({ ...dc, distance_m: haversineM(lat, lng, dc.lat, dc.lng) }))
    .filter(dc => dc.distance_m <= radiusMeters)
    .map(dc => ({
      id: `DCM-${dc.country}-${dc.name}`.replace(/\s+/g, '-'),
      name: dc.name,
      lat: dc.lat,
      lng: dc.lng,
      operator: dc.operator || null,
      status: dc.status || 'operational',
      upcoming: dc.status === 'under_construction' || dc.status === 'planned',
      source: 'DataCenterMap'
    }));
}

function getAll() {
  return load();
}

module.exports = { getNearby, getAll };
