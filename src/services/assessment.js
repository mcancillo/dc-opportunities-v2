// Property development assessment.
//
// For a specific plot (typically a for-sale property or a hand-dropped
// "undiscovered" site) this assembles a structured due-diligence report across
// the dimensions that make or break a datacenter development:
//   1. Permits        — power / environmental / building & industry
//   2. Water          — availability for cooling
//   3. Zoning         — municipal land-use plan
//   4. Federal/regional plans — grid & spatial planning for the region
//   5. Regional power — usage context and potential (green) suppliers
//
// It is deliberately data-source-driven: every finding links to the
// authoritative national/regional body so a human can verify and act. Region
// specifics reuse the repo's grid-expansion and renewable-zones datasets and a
// live OSM (Nominatim) reverse-geocode for the municipality.

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8')); }
  catch (e) { return fallback; }
}
const gridExpansion = loadJson('grid-expansion.json', []);
const renewableZones = loadJson('renewable-zones.json', []);

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Coarse coastal reference points per country (for a water-cooling proximity
// estimate). Mirrors the scoring service's coastline anchors.
const COAST = {
  NL: [[52.95, 4.75], [52.50, 4.55], [51.92, 4.48], [53.32, 5.25], [53.45, 6.85]],
  BE: [[51.35, 3.20], [51.23, 2.92], [51.34, 3.28]],
  DE: [[54.30, 10.10], [54.00, 8.80], [53.55, 8.55], [54.32, 13.10], [54.18, 12.10]],
  PL: [[54.35, 18.65], [54.45, 16.87], [54.18, 15.60], [54.50, 17.05]],
  ES: [[43.37, -8.40], [43.26, -2.93], [41.38, 2.16], [39.47, -0.37], [36.72, -4.42], [37.37, -5.97]]
};
// Major navigable rivers/lakes as inland surface-water anchors (approximate
// points along each course) — supplements coastal cooling options.
const INLAND_WATER = {
  NL: [[51.85, 4.65], [51.84, 5.85], [52.38, 4.90], [52.09, 5.12]], // Nieuwe Waterweg, Waal, Amsterdam waterways, Amsterdam-Rijnkanaal
  BE: [[51.22, 4.40], [50.85, 4.35]],                               // Schelde, Zenne
  DE: [[50.11, 8.68], [51.22, 6.77], [53.55, 9.99], [52.52, 13.40]],// Main, Rhein, Elbe, Spree
  PL: [[52.24, 21.03], [51.10, 17.03], [54.35, 18.65]],            // Wisła (Warsaw), Odra (Wrocław), Gdańsk
  ES: [[41.65, -0.88], [37.38, -5.99], [39.86, -4.02]]             // Ebro, Guadalquivir, Tajo
};

// Authoritative bodies & portals per country.
const REF = {
  NL: {
    name: 'Netherlands',
    permits: {
      power: { name: 'TenneT (TSO) grid connection', url: 'https://www.tennet.eu/nl/klanten/klantaansluitingen' },
      dso: { name: 'Liander / Stedin / Enexis (DSO)', url: 'https://www.netbeheernederland.nl' },
      environmental: { name: 'Omgevingsvergunning (Wabo/Omgevingswet) via Omgevingsloket', url: 'https://omgevingswet.overheid.nl' },
      building_industry: { name: 'Municipal building/industry permit (gemeente)', url: 'https://www.omgevingsloket.nl' }
    },
    water: { name: 'Waterschappen / Rijkswaterstaat (water permit)', url: 'https://www.rijkswaterstaat.nl' },
    zoning: { name: 'Regels op de kaart (Omgevingswet)', url: 'https://omgevingswet.overheid.nl/regels-op-de-kaart/' },
    federal_regional: [
      { name: 'Investerings- en Capaciteitsplan (grid)', url: 'https://www.netbeheernederland.nl/investerings-en-capaciteitsplan' },
      { name: 'Nationale Omgevingsvisie (NOVEX / spatial planning)', url: 'https://www.denationaleomgevingsvisie.nl' }
    ],
    power: {
      tso: { name: 'TenneT', url: 'https://www.tennet.eu' },
      capacity_map: 'https://capaciteitskaart.netbeheernederland.nl',
      market: { name: 'RVO SDE++ (renewable subsidy / PPAs)', url: 'https://www.rvo.nl/subsidies-financiering/sde' }
    }
  },
  BE: {
    name: 'Belgium',
    permits: {
      power: { name: 'Elia (TSO) grid connection', url: 'https://www.elia.be' },
      dso: { name: 'Fluvius (DSO)', url: 'https://www.fluvius.be' },
      environmental: { name: 'Omgevingsvergunning (Vlaanderen) / Permis d’environnement', url: 'https://omgevingsloketvlaanderen.be' },
      building_industry: { name: 'Municipal/regional building permit', url: 'https://www.vlaanderen.be/omgevingsvergunning' }
    },
    water: { name: 'Vlaamse Milieumaatschappij (VMM) / SPW water', url: 'https://www.vmm.be' },
    zoning: { name: 'Geopunt Vlaanderen — ruimtelijke plannen', url: 'https://www.geopunt.be' },
    federal_regional: [
      { name: 'Elia Federal Development Plan', url: 'https://www.elia.be/en/infrastructure-and-projects/investment-plan' }
    ],
    power: {
      tso: { name: 'Elia', url: 'https://www.elia.be' },
      capacity_map: 'https://www.elia.be/en/grid-data',
      market: { name: 'CREG (regulator) / green PPAs', url: 'https://www.creg.be' }
    }
  },
  DE: {
    name: 'Germany',
    permits: {
      power: { name: 'TenneT / 50Hertz / Amprion / TransnetBW (TSO) connection', url: 'https://www.netzausbau.de' },
      dso: { name: 'Regional Verteilnetzbetreiber (DSO)', url: 'https://www.bundesnetzagentur.de' },
      environmental: { name: 'BImSchG permit (immission control) via Landesbehörde', url: 'https://www.bmuv.de' },
      building_industry: { name: 'Baugenehmigung (Landkreis/Stadt Bauamt)', url: 'https://www.service-bw.de' }
    },
    water: { name: 'Wasserbehörde / WHG water rights (Länder)', url: 'https://www.umweltbundesamt.de/themen/wasser' },
    zoning: { name: 'Bauleitplanung — Flächennutzungs-/Bebauungsplan (Kommune)', url: 'https://www.xplanung.de' },
    federal_regional: [
      { name: 'Netzentwicklungsplan Strom (NEP)', url: 'https://www.netzentwicklungsplan.de' },
      { name: 'Bundesnetzagentur grid expansion', url: 'https://www.netzausbau.de' }
    ],
    power: {
      tso: { name: 'TenneT / 50Hertz / Amprion / TransnetBW', url: 'https://www.netzausbau.de' },
      capacity_map: 'https://www.netzausbau.de/leitungsvorhaben/de.html',
      market: { name: 'EEG / green PPAs (Bundesnetzagentur)', url: 'https://www.bundesnetzagentur.de' }
    }
  },
  PL: {
    name: 'Poland',
    permits: {
      power: { name: 'PSE (TSO) grid connection', url: 'https://www.pse.pl' },
      dso: { name: 'PGE / Tauron / Enea / Energa (DSO)', url: 'https://www.ure.gov.pl' },
      environmental: { name: 'Decyzja o środowiskowych uwarunkowaniach (RDOŚ)', url: 'https://www.gov.pl/web/gdos' },
      building_industry: { name: 'Pozwolenie na budowę (Starostwo/Urząd Miasta)', url: 'https://www.gov.pl/web/gunb' }
    },
    water: { name: 'Wody Polskie (water permit — pozwolenie wodnoprawne)', url: 'https://www.wody.gov.pl' },
    zoning: { name: 'Geoportal — miejscowy plan zagospodarowania (MPZP)', url: 'https://www.geoportal.gov.pl' },
    federal_regional: [
      { name: 'PSE Plan Rozwoju Sieci Przesyłowej', url: 'https://www.pse.pl/dokumenty' }
    ],
    power: {
      tso: { name: 'PSE', url: 'https://www.pse.pl' },
      capacity_map: 'https://www.pse.pl/dane-systemowe',
      market: { name: 'URE (regulator) / green PPAs', url: 'https://www.ure.gov.pl' }
    }
  },
  ES: {
    name: 'Spain',
    permits: {
      power: { name: 'Red Eléctrica de España (TSO) access & connection', url: 'https://www.ree.es' },
      dso: { name: 'i-DE / e-distribución / UFD (DSO)', url: 'https://www.cnmc.es' },
      environmental: { name: 'Evaluación de Impacto Ambiental (MITECO / CCAA)', url: 'https://www.miteco.gob.es' },
      building_industry: { name: 'Licencia de obras / actividad (Ayuntamiento)', url: 'https://administracion.gob.es' }
    },
    water: { name: 'Confederación Hidrográfica (concesión de agua)', url: 'https://www.miteco.gob.es/es/agua' },
    zoning: { name: 'Sede del Catastro / Plan General de Ordenación Urbana', url: 'https://www.sedecatastro.gob.es' },
    federal_regional: [
      { name: 'REE Plan de Desarrollo de la Red de Transporte', url: 'https://www.ree.es/es/actividades/gestor-de-la-red-y-transportista' }
    ],
    power: {
      tso: { name: 'Red Eléctrica de España', url: 'https://www.ree.es' },
      capacity_map: 'https://www.ree.es/es/clientes/generador/acceso-conexion/mapa-capacidad-acceso',
      market: { name: 'CNMC (regulator) / green PPAs', url: 'https://www.cnmc.es' }
    }
  }
};

function nearestKm(lat, lng, points) {
  if (!points || !points.length) return Infinity;
  return Math.min(...points.map(([a, b]) => haversineKm(lat, lng, a, b)));
}

// Live municipality lookup (OSM Nominatim). Cached per rounded coordinate;
// fails soft so the assessment always renders.
const geoCache = new Map();
async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'dc-opportunities-v2/1.0 (assessment)', 'Accept': 'application/json' },
      timeout: 8000
    });
    if (resp.ok) {
      const j = await resp.json();
      const a = j.address || {};
      const out = {
        municipality: a.city || a.town || a.municipality || a.village || a.county || null,
        region: a.state || a.province || null,
        country: a.country || null,
        display_name: j.display_name || null
      };
      geoCache.set(key, out);
      return out;
    }
  } catch (e) { /* soft fail */ }
  const empty = { municipality: null, region: null, country: null, display_name: null };
  geoCache.set(key, empty);
  return empty;
}

function status(kind) { return kind; } // 'favorable' | 'review' | 'action_required' | 'unknown'

async function buildAssessment(input) {
  const lat = Number(input.lat), lng = Number(input.lng);
  const cc = (input.country || '').toUpperCase();
  const ref = REF[cc] || null;
  const powerMw = Number(input.power_mw || input.estimated_power_mw) || null;
  const areaM2 = Number(input.area_m2) || null;

  const loc = (Number.isFinite(lat) && Number.isFinite(lng))
    ? await reverseGeocode(lat, lng)
    : { municipality: null, region: null, country: null, display_name: null };
  const muni = loc.municipality || input.city || '—';
  const gmaps = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  const sections = [];

  // ── 1. Permits ────────────────────────────────────────────────
  if (ref) {
    sections.push({
      id: 'permits',
      title: 'Permits (power, environmental, industry)',
      status: status('review'),
      summary: `Three permit tracks typically gate a datacenter build in ${ref.name}: a grid-connection agreement with the TSO/DSO, an environmental permit, and a municipal building/industry permit for ${muni}.`,
      items: [
        { label: 'Power — grid connection (TSO)', detail: ref.permits.power.name, url: ref.permits.power.url },
        { label: 'Power — distribution (DSO)', detail: ref.permits.dso.name, url: ref.permits.dso.url },
        { label: 'Environmental permit', detail: ref.permits.environmental.name, url: ref.permits.environmental.url },
        { label: 'Building / industry permit', detail: `${ref.permits.building_industry.name}${muni !== '—' ? ` — ${muni}` : ''}`, url: ref.permits.building_industry.url }
      ],
      checklist: [
        'Request a grid-connection offer (capacity + timeline) from the TSO/DSO',
        'Confirm environmental permit scope (emissions, noise, backup generators, heat)',
        `Verify industrial building permit feasibility with the ${muni} planning office`,
        'Screen for protected areas (Natura 2000 / nature reserves) within the parcel'
      ]
    });
  } else {
    sections.push({ id: 'permits', title: 'Permits (power, environmental, industry)', status: status('unknown'),
      summary: 'No country-specific permit reference available for this location.', items: [], checklist: [] });
  }

  // ── 2. Water availability ─────────────────────────────────────
  const coastKm = nearestKm(lat, lng, COAST[cc]);
  const inlandKm = nearestKm(lat, lng, INLAND_WATER[cc]);
  const waterKm = Math.min(coastKm, inlandKm);
  let waterStatus = 'review', waterNote;
  if (waterKm <= 10) { waterStatus = 'favorable'; waterNote = `Surface water within ~${Math.round(waterKm)} km — strong potential for water/evaporative cooling (subject to a water permit).`; }
  else if (waterKm <= 40) { waterStatus = 'review'; waterNote = `Surface water ~${Math.round(waterKm)} km away — water cooling possible but may require piping or abstraction rights.`; }
  else { waterStatus = 'action_required'; waterNote = `Nearest major surface water is ~${Number.isFinite(waterKm) ? Math.round(waterKm) : '?'} km away — plan for air/adiabatic cooling or closed-loop systems.`; }
  sections.push({
    id: 'water',
    title: 'Water availability',
    status: status(waterStatus),
    summary: waterNote,
    items: [
      { label: 'Nearest coast', detail: Number.isFinite(coastKm) ? `~${Math.round(coastKm)} km` : 'n/a' },
      { label: 'Nearest major river/lake', detail: Number.isFinite(inlandKm) ? `~${Math.round(inlandKm)} km` : 'n/a' },
      ref ? { label: 'Water authority (abstraction permit)', detail: ref.water.name, url: ref.water.url } : null
    ].filter(Boolean),
    checklist: [
      'Confirm whether water-based cooling is permittable at this abstraction point',
      'Estimate annual water demand vs. local scarcity/drought restrictions',
      'Assess municipal potable supply and wastewater/discharge routes'
    ]
  });

  // ── 3. Municipal zoning plan ──────────────────────────────────
  sections.push({
    id: 'zoning',
    title: 'Municipal zoning plan',
    status: status('review'),
    summary: `Confirm the parcel's land-use designation in the ${muni} zoning/land-use plan. Datacenters usually require industrial ("bedrijventerrein" / "Gewerbe" / "przemysłowy" / "industrial") zoning with sufficient permitted building height, footprint, and power/utility provisions.`,
    items: [
      ref ? { label: 'Zoning / land-use viewer', detail: ref.zoning.name, url: ref.zoning.url } : null,
      { label: 'Parcel location (map)', detail: 'Open exact coordinates', url: gmaps },
      loc.display_name ? { label: 'Resolved address', detail: loc.display_name } : null
    ].filter(Boolean),
    checklist: [
      'Verify current zoning class permits data-center / heavy-power industrial use',
      'Check max building height, plot coverage and setback limits',
      'Identify whether a zoning amendment (rezoning) would be required and its lead time'
    ]
  });

  // ── 4. Federal / regional plans ───────────────────────────────
  const nearbyGrid = gridExpansion
    .filter(g => (!g.country || g.country === cc) && Number.isFinite(g.lat))
    .map(g => ({ ...g, km: Math.round(haversineKm(lat, lng, g.lat, g.lng)) }))
    .filter(g => g.km <= 60)
    .sort((a, b) => a.km - b.km)
    .slice(0, 6);
  sections.push({
    id: 'federal_regional',
    title: 'Federal & regional plans',
    status: status(nearbyGrid.length ? 'favorable' : 'review'),
    summary: nearbyGrid.length
      ? `${nearbyGrid.length} planned grid/infrastructure project(s) fall within 60 km — a strong signal of forward regional capacity around ${loc.region || muni}.`
      : `No mapped grid-expansion projects within 60 km; consult the national grid & spatial-planning roadmaps for ${loc.region || ref?.name || 'the region'}.`,
    items: [
      ...nearbyGrid.map(g => ({
        label: `${g.name} (${g.km} km)`,
        detail: `${g.type || 'project'}${g.voltage_kv ? ' · ' + g.voltage_kv + 'kV' : ''}${g.timeline ? ' · ' + g.timeline : ''}${g.operator ? ' · ' + g.operator : ''}`,
        url: g.source_url || null
      })),
      ...(ref ? ref.federal_regional.map(f => ({ label: f.name, detail: 'National plan', url: f.url })) : [])
    ],
    checklist: [
      'Align build timeline with planned substation / HV-line commissioning dates',
      'Check regional spatial strategy for designated energy/industry zones',
      'Engage the province/Land/region early on strategic-project status'
    ]
  });

  // ── 5. Regional power usage & potential suppliers ─────────────
  const nearbyRenewables = renewableZones
    .filter(r => (!r.country || r.country === cc) && Number.isFinite(r.lat))
    .map(r => ({ ...r, km: Math.round(haversineKm(lat, lng, r.lat, r.lng)) }))
    .filter(r => r.km <= 100)
    .sort((a, b) => a.km - b.km)
    .slice(0, 8);
  const totalGreenMw = nearbyRenewables.reduce((s, r) => s + (Number(r.capacity_mw) || 0), 0);
  sections.push({
    id: 'power',
    title: 'Regional power usage & potential suppliers',
    status: status(nearbyRenewables.length ? 'favorable' : 'review'),
    summary: `${ref ? ref.power.tso.name + ' operates the transmission grid. ' : ''}${nearbyRenewables.length
      ? `${nearbyRenewables.length} renewable generation zone(s) (~${totalGreenMw.toLocaleString()} MW) sit within 100 km — candidates for green PPAs.`
      : 'No mapped renewable zones within 100 km; green supply would likely rely on grid PPAs or on-site generation.'}${powerMw ? ` Estimated site demand ~${powerMw} MW.` : ''}`,
    items: [
      ref ? { label: 'Transmission system operator', detail: ref.power.tso.name, url: ref.power.tso.url } : null,
      ref ? { label: 'Grid capacity map', detail: 'Available connection capacity by substation', url: ref.power.capacity_map } : null,
      ref ? { label: 'Green power / PPA route', detail: ref.power.market.name, url: ref.power.market.url } : null,
      ...nearbyRenewables.map(r => ({
        label: `${r.name} (${r.km} km)`,
        detail: `${r.type || 'renewable'}${r.capacity_mw ? ' · ~' + Number(r.capacity_mw).toLocaleString() + ' MW' : ''}`,
        url: r.source_url || null
      }))
    ].filter(Boolean),
    checklist: [
      'Request available grid capacity at the nearest 110/220/380 kV substation',
      'Model a green PPA with the nearest wind/solar zones vs. grid supply',
      'Evaluate on-site generation / battery storage for resilience and peak shaving'
    ]
  });

  // ── Overall readiness ─────────────────────────────────────────
  const weights = { favorable: 1, review: 0.55, action_required: 0.25, unknown: 0.4 };
  const readiness = Math.round(
    (sections.reduce((s, sec) => s + (weights[sec.status] ?? 0.4), 0) / sections.length) * 100
  );
  let readinessLabel;
  if (readiness >= 80) readinessLabel = 'Strong — advance to detailed due diligence';
  else if (readiness >= 60) readinessLabel = 'Promising — several items to verify';
  else if (readiness >= 40) readinessLabel = 'Mixed — material constraints to resolve';
  else readinessLabel = 'Challenging — significant gaps';

  return {
    generated_at: new Date().toISOString(),
    property: {
      name: input.name || 'Selected property',
      lat, lng,
      country: cc || null,
      country_name: ref ? ref.name : (loc.country || null),
      city: input.city || null,
      area_m2: areaM2,
      estimated_power_mw: powerMw,
      for_sale: input.for_sale === true || input.for_sale === 'true',
      listing_url: input.listing_url || null,
      map_url: gmaps
    },
    location: loc,
    overall: { readiness_score: readiness, readiness_label: readinessLabel },
    sections
  };
}

module.exports = { buildAssessment };
