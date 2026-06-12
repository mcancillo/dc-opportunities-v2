const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const SUPPORTED_COUNTRIES = ['NL', 'PL', 'DE', 'ES'];

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

async function getIXLocations() {
  const cached = readCache('ix-locations');
  if (cached) return cached;

  // Use depth=2 so fac_set includes facility coordinates
  const url = 'https://www.peeringdb.com/api/ix?depth=2';
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) throw new Error(`PeeringDB returned ${resp.status}`);
  const json = await resp.json();

  const filtered = json.data
    .filter(ix => SUPPORTED_COUNTRIES.includes(ix.country))
    .map(ix => {
      // IX records don't have lat/lng — resolve from the first facility
      let lat = ix.latitude || null;
      let lng = ix.longitude || null;
      if ((!lat || !lng) && ix.fac_set && ix.fac_set.length > 0) {
        const fac = ix.fac_set.find(f => f.latitude && f.longitude) || ix.fac_set[0];
        lat = fac.latitude;
        lng = fac.longitude;
      }
      return {
        id: ix.id,
        name: ix.name,
        name_long: ix.name_long,
        city: ix.city,
        country: ix.country,
        website: ix.website,
        lat: parseFloat(lat) || null,
        lng: parseFloat(lng) || null
      };
    })
    .filter(ix => ix.lat && ix.lng);

  writeCache('ix-locations', filtered);
  return filtered;
}

async function getIXFacilities(ixId) {
  const cacheKey = `ix-facilities-${ixId}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  // Get facilities linked to this IX via ixfac endpoint
  const url = `https://www.peeringdb.com/api/ixfac?ix_id=${ixId}&depth=2`;
  const resp = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  if (!resp.ok) throw new Error(`PeeringDB returned ${resp.status}`);
  const json = await resp.json();

  const facilities = [];
  for (const ixfac of json.data) {
    if (ixfac.fac_id) {
      const facResp = await fetch(
        `https://www.peeringdb.com/api/fac/${ixfac.fac_id}`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (facResp.ok) {
        const facJson = await facResp.json();
        const fac = facJson.data[0];
        if (fac && fac.latitude && fac.longitude) {
          facilities.push({
            id: fac.id,
            name: fac.name,
            city: fac.city,
            country: fac.country,
            lat: fac.latitude,
            lng: fac.longitude,
            address: [fac.address1, fac.address2].filter(Boolean).join(', '),
            website: fac.website
          });
        }
      }
    }
  }

  writeCache(cacheKey, facilities);
  return facilities;
}

module.exports = { getIXLocations, getIXFacilities };
