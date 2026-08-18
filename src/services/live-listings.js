// Live Real Estate Listings — pulls from open data sources
// Sources: PDOK BAG (NL), Overpass/OSM (all), Spanish Cadastre (ES)
// Search portals: Funda, ImmobilienScout24, Idealista, Otodom (link generation)

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', '..', 'cache');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
}
function readCache(key, ignoreTtl = false) {
  ensureCacheDir();
  const file = path.join(CACHE_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (!ignoreTtl && Date.now() - stat.mtimeMs > CACHE_TTL) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return null; }
}
function writeCache(key, data) {
  ensureCacheDir();
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data));
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Overpass: large industrial/commercial buildings ────────────
const OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

async function queryOverpass(query) {
  const encoded = encodeURIComponent(query);
  for (const ep of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(`${ep}?data=${encoded}`, {
        headers: { 'Accept': 'application/json' },
        timeout: 12000
      });
      if (resp.ok) return await resp.json();
    } catch (e) { /* next */ }
  }
  throw new Error('Overpass query failed on all endpoints');
}

// Country ISO → area code for Overpass
const COUNTRY_AREAS = {
  NL: '"ISO3166-1"="NL"',
  DE: '"ISO3166-1"="DE"',
  PL: '"ISO3166-1"="PL"',
  ES: '"ISO3166-1"="ES"'
};

// Estimate area from way nodes (bounding box approximation)
function estimateAreaFromBounds(bounds) {
  if (!bounds || !bounds.minlat) return 0;
  const latDiff = bounds.maxlat - bounds.minlat;
  const lngDiff = bounds.maxlon - bounds.minlon;
  const latM = latDiff * 111320;
  const lngM = lngDiff * 111320 * Math.cos((bounds.minlat + bounds.maxlat) / 2 * Math.PI / 180);
  return Math.round(latM * lngM);
}

// Power estimation by use type
function estimatePowerMW(tags, area) {
  const industrial = tags.industrial || tags.man_made || '';
  const product = tags.product || '';
  const landuse = tags.landuse || '';
  // Heavy industry
  if (/steel|smelter|refinery|chemical/i.test(industrial + product)) return Math.max(50, Math.round(area / 5000));
  if (/cement|glass|paper/i.test(industrial + product)) return Math.max(20, Math.round(area / 8000));
  // Power infrastructure
  if (/power|energy|electricity/i.test(Object.values(tags).join(' '))) return Math.max(10, Math.round(area / 10000));
  // General industrial
  if (area > 50000) return Math.round(area / 15000);
  if (area > 10000) return Math.round(area / 20000);
  return Math.max(1, Math.round(area / 25000));
}

function estimatePowerKW(tags, area) {
  const use = (tags.building || tags.office || tags.shop || '').toLowerCase();
  if (/warehouse|factory|workshop/i.test(use)) return Math.max(50, Math.round(area * 0.08));
  if (/office|commercial/i.test(use)) return Math.max(30, Math.round(area * 0.05));
  if (/retail|supermarket/i.test(use)) return Math.max(40, Math.round(area * 0.06));
  return Math.max(10, Math.round(area * 0.04));
}

// Determine sector from OSM tags
function determineSector(tags) {
  const all = Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(' ').toLowerCase();
  if (/steel/i.test(all)) return 'Steel — Industrial';
  if (/alumini?um|smelter/i.test(all)) return 'Aluminium — Smelting';
  if (/refinery|petrochemical/i.test(all)) return 'Energy — Refinery';
  if (/cement|concrete/i.test(all)) return 'Cement — Manufacturing';
  if (/chemical/i.test(all)) return 'Chemical — Industrial';
  if (/glass/i.test(all)) return 'Glass — Manufacturing';
  if (/paper|pulp/i.test(all)) return 'Paper — Manufacturing';
  if (/warehouse|logistics/i.test(all)) return 'Logistics — Warehouse';
  if (/office/i.test(all)) return 'Office — Commercial';
  if (/retail|supermarket/i.test(all)) return 'Retail — Commercial';
  if (/factory|workshop|works/i.test(all)) return 'Manufacturing — General';
  if (/industrial/i.test(all)) return 'Industrial — General';
  return 'Commercial — General';
}

// Universal, always-working map link for a coordinate. Opens the exact plot in
// Google Maps (satellite/terrain + nearby infrastructure) — the most reliable
// way to inspect a candidate site and never 404s.
function getMapUrl(lat, lng) {
  return `https://www.google.com/maps/search/?api=1&query=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

// Portal deep-link to a geo-anchored listing search. Only returns a URL for
// portals that genuinely support a coordinate/radius search (verified working);
// otherwise null, so the UI never renders a broken link. Country-level portal
// browsing is offered separately via getPortalSearchLinks().
function getListingUrl(country, lat, lng, area) {
  const la = Number(lat).toFixed(5), ln = Number(lng).toFixed(5);
  switch (country) {
    case 'DE':
      // ImmobilienScout24 supports a real radius search around coordinates.
      return `https://www.immobilienscout24.de/Suche/radius/gewerbeflaeche-kaufen?geocoordinates=${la};${ln};10.0`;
    default:
      // NL/PL/ES portals do not support reliable coordinate deep-links; use the
      // universal map link instead of emitting a broken portal URL.
      return null;
  }
}

// ─── Accumulating per-area cache ───────────────────────────────
// Keep a growing superset of sites per area so expanding the search radius never
// drops previously-found results, and a timed-out larger query falls back to
// what we already have. Stored shape: { maxRadiusKm, sites: [...] }.
function mergeSites(existing, incoming) {
  const byId = new Map(existing.map(s => [s.id, s]));
  for (const s of incoming) byId.set(s.id, s);
  return [...byId.values()];
}

// ─── Industrial sites from Overpass (≥5000 m², high power) ─────
// Uses bbox around search center instead of country-wide query for performance
async function fetchIndustrialSites(country, lat, lng, radiusKm) {
  const areaKey = `live-industrial-${country}-${lat ? lat.toFixed(1) : 'all'}-${lng ? lng.toFixed(1) : 'all'}`;
  const fresh = readCache(areaKey);
  const store = fresh || readCache(areaKey, true) || { maxRadiusKm: 0, sites: [] };
  // Serve from cache only when fresh AND it already covers this radius.
  if (fresh && (fresh.maxRadiusKm || 0) >= (radiusKm || 0)) return fresh.sites;

  console.log(`[live] Fetching industrial sites for ${country} near ${lat},${lng} (${radiusKm}km)...`);

  // Use bbox around search center for performance (avoid country-wide queries)
  let bboxFilter;
  if (lat && lng && radiusKm) {
    const latDelta = (radiusKm || 100) / 111.32;
    const lngDelta = (radiusKm || 100) / (111.32 * Math.cos((lat || 50) * Math.PI / 180));
    bboxFilter = `(${(lat - latDelta).toFixed(3)},${(lng - lngDelta).toFixed(3)},${(lat + latDelta).toFixed(3)},${(lng + lngDelta).toFixed(3)})`;
  } else {
    // Fallback to country area
    const areaFilter = COUNTRY_AREAS[country];
    if (!areaFilter) return [];
    bboxFilter = null;
  }

  // Query named industrial BUILDINGS only (not landuse zones)
  const query = bboxFilter
    ? `[out:json][timeout:60];
(
  way["building"="industrial"]["name"]${bboxFilter};
  way["man_made"="works"]["name"]${bboxFilter};
  way["building"="warehouse"]["name"]["operator"]${bboxFilter};
  way["building"="factory"]["name"]${bboxFilter};
  relation["building"="industrial"]["name"]${bboxFilter};
);
out body bb;`
    : `[out:json][timeout:60];
area[${COUNTRY_AREAS[country]}]->.a;
(
  way["building"="industrial"]["name"](area.a);
  way["man_made"="works"]["name"](area.a);
  way["building"="warehouse"]["name"]["operator"](area.a);
  way["building"="factory"]["name"](area.a);
  relation["building"="industrial"]["name"](area.a);
);
out body bb;`;

  try {
    const json = await queryOverpass(query);
    const seen = new Set();
    const results = [];

    for (const el of json.elements) {
      if (!el.tags || !el.tags.name) continue;
      const bounds = el.bounds;
      if (!bounds) continue;

      const lat = (bounds.minlat + bounds.maxlat) / 2;
      const lng = (bounds.minlon + bounds.maxlon) / 2;
      const area = estimateAreaFromBounds(bounds);
      if (area < 5000 || area > 500000) continue; // Cap at 500k m² — larger = zone not building

      const key = `${el.tags.name}-${lat.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const power = estimatePowerMW(el.tags, area);
      if (power < 10) continue; // Must be high-power consumer

      results.push({
        id: `LI-${country}-${el.id}`,
        name: el.tags.name,
        country,
        city: el.tags['addr:city'] || el.tags['addr:municipality'] || '',
        address: [el.tags['addr:street'], el.tags['addr:housenumber']].filter(Boolean).join(' ') || '',
        lat, lng,
        area_m2: area,
        estimated_power_mw: power,
        sector: determineSector(el.tags),
        for_sale: false, // OSM doesn't track sales status
        price_eur: null,
        listing_url: getListingUrl(country, lat, lng, area),
        map_url: getMapUrl(lat, lng),
        data_source: `OpenStreetMap — ${el.tags.operator || 'industrial site'}`,
        notes: `OSM ID: ${el.id}. Tags: ${Object.entries(el.tags).slice(0, 5).map(([k,v]) => `${k}=${v}`).join(', ')}`,
        source_type: 'osm_industrial'
      });
    }

    console.log(`[live] ${country}: ${results.length} industrial sites found`);
    const merged = mergeSites(store.sites, results);
    writeCache(areaKey, { maxRadiusKm: Math.max(store.maxRadiusKm || 0, radiusKm || 0), sites: merged });
    return merged;
  } catch (err) {
    console.error(`[live] Industrial fetch error for ${country}:`, err.message);
    return store.sites; // fall back to accumulated superset — never disappears
  }
}

// ─── Commercial sites from Overpass (≥3000 m²) ─────────────────
async function fetchCommercialSites(country, lat, lng, radiusKm) {
  const areaKey = `live-commercial-${country}-${lat ? lat.toFixed(1) : 'all'}-${lng ? lng.toFixed(1) : 'all'}`;
  const fresh = readCache(areaKey);
  const store = fresh || readCache(areaKey, true) || { maxRadiusKm: 0, sites: [] };
  if (fresh && (fresh.maxRadiusKm || 0) >= (radiusKm || 0)) return fresh.sites;

  console.log(`[live] Fetching commercial sites for ${country} near ${lat},${lng} (${radiusKm}km)...`);

  let bboxFilter;
  if (lat && lng && radiusKm) {
    const latDelta = (radiusKm || 100) / 111.32;
    const lngDelta = (radiusKm || 100) / (111.32 * Math.cos((lat || 50) * Math.PI / 180));
    bboxFilter = `(${(lat - latDelta).toFixed(3)},${(lng - lngDelta).toFixed(3)},${(lat + latDelta).toFixed(3)},${(lng + lngDelta).toFixed(3)})`;
  } else {
    const areaFilter = COUNTRY_AREAS[country];
    if (!areaFilter) return [];
    bboxFilter = null;
  }

  const query = bboxFilter
    ? `[out:json][timeout:45][maxsize:10485760];
(
  way["building"="commercial"]["name"]${bboxFilter};
  way["building"="warehouse"]["name"]${bboxFilter};
  way["building"="office"]["name"]["addr:street"]${bboxFilter};
);
out body bb;`
    : `[out:json][timeout:45][maxsize:10485760];
area[${COUNTRY_AREAS[country]}]->.a;
(
  way["building"="commercial"]["name"](area.a);
  way["building"="warehouse"]["name"](area.a);
  way["building"="office"]["name"]["addr:street"](area.a);
);
out body bb;`;

  try {
    const json = await queryOverpass(query);
    const seen = new Set();
    const results = [];

    for (const el of json.elements) {
      if (!el.tags || !el.tags.name) continue;
      const bounds = el.bounds;
      if (!bounds) continue;

      const lat = (bounds.minlat + bounds.maxlat) / 2;
      const lng = (bounds.minlon + bounds.maxlon) / 2;
      const area = estimateAreaFromBounds(bounds);
      if (area < 3000 || area > 200000) continue; // Cap at 200k m²

      const key = `${el.tags.name}-${lat.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        id: `LC-${country}-${el.id}`,
        name: el.tags.name,
        country,
        city: el.tags['addr:city'] || el.tags['addr:municipality'] || '',
        address: [el.tags['addr:street'], el.tags['addr:housenumber']].filter(Boolean).join(' ') || '',
        lat, lng,
        area_m2: area,
        estimated_power_kw: estimatePowerKW(el.tags, area),
        sector: determineSector(el.tags),
        for_sale: false,
        listing_url: getListingUrl(country, lat, lng, area),
        map_url: getMapUrl(lat, lng),
        data_source: `OpenStreetMap — ${el.tags.operator || el.tags.building || 'commercial'}`,
        notes: `OSM ID: ${el.id}`,
        source_type: 'osm_commercial'
      });
    }

    console.log(`[live] ${country}: ${results.length} commercial sites found`);
    const merged = mergeSites(store.sites, results);
    writeCache(areaKey, { maxRadiusKm: Math.max(store.maxRadiusKm || 0, radiusKm || 0), sites: merged });
    return merged;
  } catch (err) {
    console.error(`[live] Commercial fetch error for ${country}:`, err.message);
    return store.sites;
  }
}

// ─── PDOK BAG OGC v2: large industrial buildings in NL ─────────
async function fetchPDOKBuildings(lat, lng, radiusKm) {
  const cacheKey = `pdok-v2-${lat.toFixed(1)}-${lng.toFixed(1)}-${radiusKm}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  console.log(`[live] Fetching PDOK BAG OGC v2 buildings near ${lat},${lng} (${radiusKm}km)...`);

  // Use bbox filter — OGC API Features v2
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
  const bbox = `${(lng - lngDelta).toFixed(4)},${(lat - latDelta).toFixed(4)},${(lng + lngDelta).toFixed(4)},${(lat + latDelta).toFixed(4)}`;

  // Query verblijfsobject (addressable units) with industrial function and min 5000m²
  const queries = [
    { use: 'industriefunctie', minArea: 5000, label: 'Industrial' },
    { use: 'kantoorfunctie', minArea: 8000, label: 'Office' }
  ];

  const results = [];
  for (const q of queries) {
    try {
      const url = `https://service.pdok.nl/lv/bag/wfs/v2_0?service=WFS&version=2.0.0&request=GetFeature` +
        `&typeName=bag:verblijfsobject&outputFormat=application/json&count=100` +
        `&bbox=${bbox}` +
        `&CQL_FILTER=gebruiksdoel='${q.use}' AND oppervlakte>${q.minArea} AND status='Verblijfsobject in gebruik'`;

      const resp = await fetch(url, { timeout: 30000 });
      if (!resp.ok) continue;
      const json = await resp.json();

      for (const feature of (json.features || [])) {
        const props = feature.properties;
        if (!props) continue;

        let centLat, centLng;
        if (feature.geometry && feature.geometry.coordinates) {
          // Point geometry for verblijfsobject
          if (feature.geometry.type === 'Point') {
            centLng = feature.geometry.coordinates[0];
            centLat = feature.geometry.coordinates[1];
          } else {
            const coords = feature.geometry.coordinates.flat(3);
            const lats = [], lngs = [];
            for (let i = 0; i < coords.length; i += 2) { lngs.push(coords[i]); lats.push(coords[i + 1]); }
            centLat = lats.reduce((a, b) => a + b, 0) / lats.length;
            centLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
          }
        }
        if (!centLat || !centLng) continue;

        const area = props.oppervlakte || 0;
        if (area < q.minArea || area > 500000) continue;

        const dist = haversineKm(lat, lng, centLat, centLng);
        if (dist > radiusKm) continue;

        const id = props.identificatie || `${centLat.toFixed(4)}-${centLng.toFixed(4)}`;
        results.push({
          id: `PDOK-${id}`,
          name: `${q.label} — ${props.openbare_ruimte || ''} ${props.huisnummer || ''}`.trim() || `${q.label} Unit ${id.slice(-6)}`,
          country: 'NL',
          city: props.woonplaats || '',
          address: `${props.openbare_ruimte || ''} ${props.huisnummer || ''}, ${props.postcode || ''}`.trim(),
          lat: centLat, lng: centLng,
          area_m2: area,
          estimated_power_mw: estimatePowerMW({ industrial: q.use }, area),
          sector: `${q.label} — BAG registered`,
          for_sale: false,
          price_eur: null,
          listing_url: `https://bagviewer.kadaster.nl/lvbag/bag-viewer/#/verblijfsobject/${id}`,
          data_source: 'PDOK BAG — Dutch national building registry (CC0)',
          notes: `Use: ${props.gebruiksdoel}. Status: ${props.status}`,
          source_type: 'pdok_bag'
        });
      }
    } catch (e) {
      console.error(`[live] PDOK ${q.use} error:`, e.message);
    }
  }

  console.log(`[live] PDOK: ${results.length} large buildings near ${lat.toFixed(2)},${lng.toFixed(2)}`);
  writeCache(cacheKey, results);
  return results;
}

// ─── Spanish Cadastre: lookup parcels at known industrial locations ──
async function fetchCatastroBuildings(lat, lng, radiusKm) {
  const cacheKey = `catastro-${lat.toFixed(1)}-${lng.toFixed(1)}-${radiusKm}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  console.log(`[live] Fetching Spanish Cadastre data for industrial zones...`);

  // The Catastro API only supports single-point lookups, not radius search.
  // We sample OSM industrial sites' coordinates to get cadastral data for each.
  let industrialSites = [];
  try {
    industrialSites = await fetchIndustrialSites('ES', lat, lng, radiusKm);
  } catch (e) { /* use empty */ }

  // Filter to sites within radius
  const nearby = industrialSites.filter(s => haversineKm(lat, lng, s.lat, s.lng) <= radiusKm);
  
  const results = [];
  // Look up cadastral reference for up to 30 nearby industrial sites
  const toQuery = nearby.slice(0, 30);
  
  for (const site of toQuery) {
    try {
      const url = `https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_RCCOOR` +
        `?SRS=EPSG%3A4326&Coordenada_X=${site.lng.toFixed(6)}&Coordenada_Y=${site.lat.toFixed(6)}`;
      const resp = await fetch(url, { timeout: 10000 });
      if (!resp.ok) continue;
      const text = await resp.text();

      const rc1 = /<pc1>(.*?)<\/pc1>/s.exec(text);
      const rc2 = /<pc2>(.*?)<\/pc2>/s.exec(text);
      const ldt = /<ldt>(.*?)<\/ldt>/s.exec(text);
      if (!rc1) continue;

      const refcat = `${rc1[1]}${rc2 ? rc2[1] : ''}`;
      const address = ldt ? ldt[1] : '';

      // Enrich the existing OSM site with cadastral reference
      site.listing_url = `https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?refcat=${refcat}`;
      site.notes = `${site.notes || ''}. Ref. Catastral: ${refcat}. ${address}`;
      site.data_source = `OSM + Spanish Cadastre — Ref: ${refcat}`;

      // Slight delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    } catch (e) { /* skip this site */ }
  }

  console.log(`[live] Catastro: enriched ${toQuery.length} sites with cadastral references`);
  writeCache(cacheKey, []); // Cache empty — enrichment is in-place on OSM data
  return [];
}

// ─── RE Portal Search Links (for user follow-up) ──────────────
function getPortalSearchLinks(country, lat, lng, radiusKm) {
  const r = Math.min(radiusKm, 100);
  const links = [];

  switch (country) {
    case 'NL':
      links.push({
        name: 'Funda in Business',
        url: `https://www.fundainbusiness.nl/bedrijfsruimte/heel-nederland/`,
        type: 'Commercial & Industrial',
        note: 'Manual search — filter by ≥5000m² industrial'
      });
      links.push({
        name: 'Cushman & Wakefield NL',
        url: 'https://www.cushmanwakefield.com/nl-nl/netherlands/properties',
        type: 'Industrial & Logistics',
        note: 'Enterprise broker — large format'
      });
      links.push({
        name: 'CBRE Netherlands',
        url: 'https://www.cbre.nl/nl-nl/huurkantoor',
        type: 'Commercial & Industrial',
        note: 'Enterprise broker'
      });
      break;
    case 'DE':
      links.push({
        name: 'ImmobilienScout24',
        url: `https://www.immobilienscout24.de/Suche/radius/gewerbeflaeche-kaufen?geocoordinates=${Number(lat).toFixed(5)};${Number(lng).toFixed(5)};${Math.round(r)}.0`,
        type: 'Commercial & Industrial',
        note: 'Largest German RE portal — radius search around this location'
      });
      links.push({
        name: 'Immowelt',
        url: 'https://www.immowelt.de/gewerbeimmobilien/suche',
        type: 'Commercial',
        note: 'German RE portal'
      });
      links.push({
        name: 'JLL Germany',
        url: 'https://www.jll.de/en/find-commercial-real-estate',
        type: 'Industrial & Logistics',
        note: 'Enterprise broker'
      });
      break;
    case 'PL':
      links.push({
        name: 'Otodom',
        url: 'https://www.otodom.pl/pl/wyniki/sprzedaz/komercyjne/cala-polska',
        type: 'Commercial & Industrial',
        note: 'Largest Polish RE portal'
      });
      links.push({
        name: 'Savills / WarehouseMarket PL',
        url: 'https://warehousemarket.pl/en/all-warehouses',
        type: 'Industrial & Logistics',
        note: 'Savills-backed warehouse & industrial portal'
      });
      break;
    case 'ES':
      links.push({
        name: 'Idealista',
        url: `https://www.idealista.com/en/venta-naves/`,
        type: 'Industrial & Commercial',
        note: 'Largest Spanish RE portal — filter by ≥5000m²'
      });
      links.push({
        name: 'Fotocasa',
        url: 'https://www.fotocasa.es/es/comprar/naves-industriales/todas-las-zonas/l',
        type: 'Industrial',
        note: 'Spanish RE portal'
      });
      links.push({
        name: 'CBRE Spain',
        url: 'https://www.cbre.es/en/properties',
        type: 'Industrial & Logistics',
        note: 'Enterprise broker'
      });
      break;
  }
  return links;
}

// ─── Main aggregator ───────────────────────────────────────────
async function getLiveIndustrial(lat, lng, radiusKm, country) {
  const tasks = [];

  // OSM industrial sites (bbox around search center)
  tasks.push(fetchIndustrialSites(country, lat, lng, radiusKm));

  // PDOK for Netherlands
  if (country === 'NL') {
    tasks.push(fetchPDOKBuildings(lat, lng, radiusKm));
  }

  // Spanish Cadastre (enriches OSM data with cadastral refs)
  if (country === 'ES') {
    tasks.push(fetchCatastroBuildings(lat, lng, radiusKm));
  }

  const allResults = await Promise.all(tasks);
  const combined = allResults.flat();

  // Filter by radius and deduplicate
  const seen = new Set();
  return combined
    .filter(p => {
      const dist = haversineKm(lat, lng, p.lat, p.lng);
      if (dist > radiusKm) return false;
      p.distance_km = Math.round(dist * 10) / 10;

      // Deduplicate by proximity (within 200m = same building)
      const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distance_km - b.distance_km);
}

async function getLiveCommercial(lat, lng, radiusKm, country) {
  const results = await fetchCommercialSites(country, lat, lng, radiusKm);

  const seen = new Set();
  return results
    .filter(p => {
      const dist = haversineKm(lat, lng, p.lat, p.lng);
      if (dist > radiusKm) return false;
      p.distance_km = Math.round(dist * 10) / 10;

      const key = `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.distance_km - b.distance_km);
}

module.exports = {
  getLiveIndustrial,
  getLiveCommercial,
  getPortalSearchLinks
};
