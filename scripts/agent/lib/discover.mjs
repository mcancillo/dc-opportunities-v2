// Candidate data-source & angle discovery for datacenter plot identification.
//
// Two layers:
//  1. Curated SEEDS — new angles beyond the existing RE-portal/cadastral sources
//     already in data/sources.json (grid-capacity APIs, land auctions, brownfield
//     registries, permit registers, port land, renewable-auction results, etc.).
//     These make the agent useful even with no LLM (zero token cost).
//  2. Optional LLM expansion — informed by the DC Audio Briefing signals, the
//     model proposes additional angles/sources per country.
import { llmEnabled, llmJson } from './llm.mjs';
import { log } from './util.mjs';

// New-angle seed candidates per country. category = the *type* of signal it adds.
const SEEDS = {
  NL: [
    { name: 'Netbeheer Nederland — Capaciteitskaart (grid capacity)', url: 'https://capaciteitskaart.netbeheernederland.nl', category: 'grid-capacity', angle: 'Filter plots by available substation capacity to avoid congestion (transportschaarste) zones.' },
    { name: 'RVO Bedrijventerreinen / IBIS industrial estates', url: 'https://www.rvo.nl', category: 'industrial-land', angle: 'National register of business/industrial parks with zoning already suited to heavy power use.' },
    { name: 'Groningen Seaports / Eemshaven land', url: 'https://www.groningen-seaports.com', category: 'port-land', angle: 'Port authority land with green power + subsea/backhaul, a known hyperscaler cluster.' }
  ],
  BE: [
    { name: 'Elia — grid data & capacity', url: 'https://www.elia.be/en/grid-data', category: 'grid-capacity', angle: 'Belgian TSO capacity/queue data to pre-qualify sites by connectable MW.' },
    { name: 'Geopunt Flanders — bedrijventerreinen', url: 'https://www.geopunt.be', category: 'industrial-land', angle: 'Flemish industrial-zone GIS layer for already-zoned heavy-power land.' },
    { name: 'Port of Antwerp-Bruges land', url: 'https://www.portofantwerpbruges.com', category: 'port-land', angle: 'Large port-authority parcels with fiber + power + water cooling access.' }
  ],
  DE: [
    { name: 'Bundesnetzagentur — grid & connection data', url: 'https://www.bundesnetzagentur.de', category: 'grid-capacity', angle: 'Federal grid-connection and Netzentwicklungsplan data to target upgrade corridors.' },
    { name: 'Gewerbegebiete / GENIOS industrial land registers', url: 'https://www.geoportal.de', category: 'industrial-land', angle: 'State Gewerbegebiet layers for pre-zoned commercial/industrial plots.' },
    { name: 'Braunfeld/brownfield & Konversionsflächen registers', url: 'https://www.bbsr.bund.de', category: 'brownfield', angle: 'Former industrial/military conversion land — fast-track power + planning.' }
  ],
  PL: [
    { name: 'PSE — grid connection capacity', url: 'https://www.pse.pl', category: 'grid-capacity', angle: 'Polish TSO connection-capacity publications to filter by available MW.' },
    { name: 'PAIH / Special Economic Zones (SEZ) land', url: 'https://www.paih.gov.pl', category: 'industrial-land', angle: 'Investment-agency + SEZ parcels with incentives and prepared infrastructure.' },
    { name: 'Geoportal krajowy — parcels & land use', url: 'https://www.geoportal.gov.pl', category: 'cadastral', angle: 'National parcel/land-use WMS for automated plot screening.' }
  ],
  ES: [
    { name: 'Red Eléctrica (REE) — ESIOS grid data', url: 'https://www.esios.ree.es', category: 'grid-capacity', angle: 'Grid nodes/capacity + renewable generation to find green-power-rich regions (e.g. Aragón).' },
    { name: 'SEPES / regional suelo industrial registries', url: 'https://www.sepes.es', category: 'industrial-land', angle: 'State industrial-land developer inventory of ready-to-build plots.' },
    { name: 'Aragón / Zaragoza logistics & DC land (PLAZA)', url: 'https://www.plazalogistica.com', category: 'industrial-land', angle: 'Emerging low-cost, green-power hyperscaler cluster outside Madrid.' }
  ]
};

function seedCandidates(countries, params) {
  const emphasis = params?.countryEmphasis || {};
  const out = [];
  // Emphasise under-covered countries first so limited runs cover them.
  const ordered = [...countries].sort((a, b) => (emphasis[b.code] ?? 1) - (emphasis[a.code] ?? 1));
  for (const { code } of ordered) {
    for (const s of SEEDS[code] || []) {
      out.push({ ...s, country: code, source: 'seed', confidence: 0.75, rationale: 'Curated new-angle seed source for datacenter plot discovery.' });
    }
  }
  return out;
}

async function llmCandidates(cfg, countries, briefing, params) {
  if (!llmEnabled(cfg)) return { candidates: [], usage: null, recommendations: [] };

  const maxPer = params?.maxCandidatesPerCountry ?? cfg.llm.maxCandidatesPerCountry;
  const system = [
    'You are a datacenter site-selection research agent.',
    'Goal: propose NEW public data sources and NEW analytical angles that help identify land plots suitable for building datacenters.',
    'Focus on: grid/substation connection capacity, industrial/brownfield land registers, permitting/zoning registries,',
    'renewable-energy auction results, port-authority land, water/cooling availability, and hyperscaler land-banking signals.',
    'Only include real, reachable https sources. Do NOT repeat sources the user says already exist.',
    'Return STRICT JSON: {"candidates":[{"country":"NL|BE|DE|PL|ES","name":str,"url":str,"category":str,"angle":str,"rationale":str,"confidence":0..1}],',
    '"algorithm_recommendations":[{"factor":str,"change":str,"rationale":str}]}'
  ].join(' ');

  const user = JSON.stringify({
    countries: countries.map(c => c.code),
    max_candidates_per_country: maxPer,
    country_emphasis: params?.countryEmphasis || {},
    category_emphasis: params?.categoryEmphasis || {},
    briefing_signals: briefing.signals,
    briefing_highlights: briefing.signals.highlights?.slice(0, 25) || [],
    instruction: 'Prioritise angles the briefing emphasises and countries/categories with higher emphasis weights (learned from past-run evaluation). Weight countries the briefing mentions more.'
  });

  const res = await llmJson(cfg, system, user);
  if (!res) return { candidates: [], usage: null, recommendations: [] };
  const data = res.data || {};
  const candidates = (data.candidates || []).map(c => ({ ...c, source: 'llm' }));
  log(`LLM proposed ${candidates.length} candidates, ${(data.algorithm_recommendations || []).length} algorithm recs`);
  return { candidates, usage: res.usage, recommendations: data.algorithm_recommendations || [] };
}

export async function discover(cfg, countries, briefing, params) {
  const seeds = seedCandidates(countries, params);
  const { candidates: llm, usage, recommendations } = await llmCandidates(cfg, countries, briefing, params);
  return { candidates: [...seeds, ...llm], usage, recommendations };
}
