const express = require('express');
const router = express.Router();
const peeringdb = require('../services/peeringdb');
const overpass = require('../services/overpass');
const properties = require('../services/properties');
const commercial = require('../services/commercial');
const cables = require('../services/cables');
const { scoreProperty } = require('../services/scoring');
const liveListings = require('../services/live-listings');
const ledger = require('../services/ledger');
const iam = require('../services/iam');

// Load grid expansion and renewable zones data
const path = require('path');
const fs = require('fs');
let gridExpansion = [];
let renewableZones = [];
let fiberPlans = [];
let crossborderLinks = [];
try { gridExpansion = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/grid-expansion.json'), 'utf8')); } catch (e) { console.warn('Grid expansion data not loaded:', e.message); }
try { renewableZones = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/renewable-zones.json'), 'utf8')); } catch (e) { console.warn('Renewable zones data not loaded:', e.message); }
try { fiberPlans = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/fiber-plans.json'), 'utf8')); } catch (e) { console.warn('Fiber plans data not loaded:', e.message); }
try { crossborderLinks = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/crossborder-links.json'), 'utf8')); } catch (e) { console.warn('Crossborder links data not loaded:', e.message); }

// Cached context for scoring (populated lazily)
let scoringContext = null;
async function getScoringContext() {
  if (scoringContext) return scoringContext;
  let ixLocations = [];
  try { ixLocations = await peeringdb.getIXLocations(); } catch (e) { console.error('Scoring: IX data unavailable:', e.message); }
  let landingPoints = [];
  try { landingPoints = cables.getLandingPoints(); } catch (e) { /* ok */ }
  let fiberRoutes = [];
  try { fiberRoutes = await cables.getFiberBackbone(); } catch (e) { /* ok */ }
  scoringContext = { ixLocations, landingPoints, fiberRoutes, datacenters: [], gridExpansion, renewableZones };
  return scoringContext;
}

// Get IX locations for supported countries
router.get('/ix-locations', async (req, res) => {
  try {
    const data = await peeringdb.getIXLocations();
    res.json(data);
  } catch (err) {
    console.error('IX locations error:', err.message);
    res.status(500).json({ error: 'Failed to fetch IX locations' });
  }
});

// Get facilities (physical sites) for a given IX
router.get('/ix-facilities/:ixId', async (req, res) => {
  try {
    const data = await peeringdb.getIXFacilities(req.params.ixId);
    res.json(data);
  } catch (err) {
    console.error('IX facilities error:', err.message);
    res.status(500).json({ error: 'Failed to fetch IX facilities' });
  }
});

// Get existing datacenters near a point
router.get('/datacenters', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const data = await overpass.getDatacenters(
      parseFloat(lat), parseFloat(lng), parseFloat(radius) || 50000
    );
    res.json(data);
  } catch (err) {
    console.error('Datacenters error:', err.message);
    res.status(500).json({ error: 'Failed to fetch datacenters' });
  }
});

// Get property opportunities near a point (curated + live from OSM/PDOK, scored)
router.get('/properties', async (req, res) => {
  try {
    const { lat, lng, radius, country } = req.query;
    const pLat = parseFloat(lat), pLng = parseFloat(lng), pRadius = parseFloat(radius) || 50000;
    const radiusKm = pRadius / 1000;

    // Curated properties
    const curated = properties.getProperties(pLat, pLng, pRadius);

    // Live industrial sites from OSM/PDOK
    let live = [];
    if (country) {
      try {
        live = await liveListings.getLiveIndustrial(pLat, pLng, radiusKm, country);
      } catch (e) { console.error('Live industrial error:', e.message); }
    }

    // Deduplicate: remove live sites that overlap with curated (within 500m)
    const dedupedLive = live.filter(lp => {
      return !curated.some(cp => haversineM(cp.lat, cp.lng, lp.lat, lp.lng) < 500);
    });

    const combined = [...curated, ...dedupedLive];

    // Score each property
    const ctx = await getScoringContext();
    let datacenters = [];
    try { datacenters = await overpass.getDatacenters(pLat, pLng, Math.max(pRadius, 50000)); } catch (e) { /* ok */ }
    const fullCtx = { ...ctx, datacenters };

    const scored = combined.map(p => ({
      ...p,
      score: scoreProperty(p, fullCtx, 'hyperscale')
    }));

    // Sort by score
    scored.sort((a, b) => (b.score?.total_score || 0) - (a.score?.total_score || 0));

    // Record interesting plots to the opportunity ledger
    try {
      const written = ledger.recordBatch(scored, {
        origin: { profile: 'hyperscale', near: { lat: pLat, lng: pLng }, radius_km: radiusKm, country: country || null }
      });
      if (written) console.log(`[ledger] +${written} interesting plot(s) from properties search`);
    } catch (e) { console.error('[ledger] record error:', e.message); }

    res.json(scored);
  } catch (err) {
    console.error('Properties error:', err.message);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Get commercial real estate near a point (curated + live from OSM, scored)
router.get('/commercial', async (req, res) => {
  try {
    const { lat, lng, radius, country } = req.query;
    const pLat = parseFloat(lat), pLng = parseFloat(lng), pRadius = parseFloat(radius) || 50000;
    const radiusKm = pRadius / 1000;

    const curated = commercial.getCommercial(pLat, pLng, pRadius);

    let live = [];
    if (country) {
      try {
        live = await liveListings.getLiveCommercial(pLat, pLng, radiusKm, country);
      } catch (e) { console.error('Live commercial error:', e.message); }
    }

    const dedupedLive = live.filter(lp => {
      return !curated.some(cp => haversineM(cp.lat, cp.lng, lp.lat, lp.lng) < 500);
    });

    const combined = [...curated, ...dedupedLive];

    const ctx = await getScoringContext();
    let datacenters = [];
    try { datacenters = await overpass.getDatacenters(pLat, pLng, Math.max(pRadius, 50000)); } catch (e) { /* ok */ }
    const fullCtx = { ...ctx, datacenters };

    const scored = combined.map(p => ({
      ...p,
      score: scoreProperty(p, fullCtx, 'edge')
    }));

    scored.sort((a, b) => (b.score?.total_score || 0) - (a.score?.total_score || 0));

    // Record interesting plots to the opportunity ledger
    try {
      const written = ledger.recordBatch(scored, {
        origin: { profile: 'edge', near: { lat: pLat, lng: pLng }, radius_km: radiusKm, country: country || null }
      });
      if (written) console.log(`[ledger] +${written} interesting plot(s) from commercial search`);
    } catch (e) { console.error('[ledger] record error:', e.message); }

    res.json(scored);
  } catch (err) {
    console.error('Commercial error:', err.message);
    res.status(500).json({ error: 'Failed to fetch commercial properties' });
  }
});

// Helper for deduplication
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Get RE portal search links for a country
router.get('/portal-links', (req, res) => {
  const { country, lat, lng, radius } = req.query;
  const links = liveListings.getPortalSearchLinks(
    country, parseFloat(lat), parseFloat(lng), parseFloat(radius) / 1000 || 50
  );
  res.json(links);
});

// Get subsea cable landing points
router.get('/landing-points', (req, res) => {
  try {
    res.json(cables.getLandingPoints());
  } catch (err) {
    console.error('Landing points error:', err.message);
    res.status(500).json({ error: 'Failed to fetch landing points' });
  }
});

// Get subsea cable routes (TeleGeography, European segments)
router.get('/subsea-cables', (req, res) => {
  try {
    res.json(cables.getSubseaCables());
  } catch (err) {
    console.error('Subsea cables error:', err.message);
    res.status(500).json({ error: 'Failed to fetch subsea cables' });
  }
});

// Get fiber backbone routes (OSM)
router.get('/fiber-backbone', async (req, res) => {
  try {
    const data = await cables.getFiberBackbone();
    res.json(data);
  } catch (err) {
    console.error('Fiber backbone error:', err.message);
    res.status(500).json({ error: 'Failed to fetch fiber backbone' });
  }
});

// Get data source documentation per country
router.get('/sources', (req, res) => {
  const sources = require('../../data/sources.json');
  res.json(sources);
});

// ─── Credential Management ─────────────────────────────────────
// In-memory credential store (not persisted server-side — comes from browser)
let apiCredentials = {};

router.post('/credentials', (req, res) => {
  apiCredentials = req.body || {};
  const count = Object.keys(apiCredentials).filter(k => apiCredentials[k]).length;
  console.log(`[creds] ${count} API credentials configured`);
  res.json({ ok: true, count });
});

router.get('/credentials/status', (req, res) => {
  const configured = Object.keys(apiCredentials).filter(k => apiCredentials[k]);
  res.json({ configured });
});

// Test a credential
router.get('/test-credential', async (req, res) => {
  const { type, token } = req.query;
  try {
    if (type === 'entsoe' && token) {
      const fetch = require('node-fetch');
      const r = await fetch(`https://web-api.tp.entsoe.eu/api?securityToken=${token}&documentType=A11&processType=A01&outBiddingZone_Domain=10YNL----------L&periodStart=202401010000&periodEnd=202401020000`, { timeout: 10000 });
      res.json({ ok: r.ok, status: r.status });
    } else {
      res.json({ ok: false, error: 'Unknown credential type' });
    }
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Expose credentials to other services
function getCredential(key) { return apiCredentials[key] || null; }

// Infrastructure intel — grid, fiber, crossborder data by country
router.get('/infrastructure', (req, res) => {
  const { country } = req.query;
  const filter = item => !country || item.country === country || (item.countries && item.countries.includes(country));

  res.json({
    gridExpansion: gridExpansion.filter(filter),
    renewableZones: renewableZones.filter(filter),
    fiberPlans: fiberPlans.filter(filter),
    crossborderLinks: crossborderLinks.filter(filter)
  });
});

// ─── Opportunity Ledger ────────────────────────────────────────
// Persistent record of every interesting plot found (with sources + reasons).

// List ledger entries (optional filters: country, tier, for_sale, min_score)
router.get('/ledger', (req, res) => {
  try {
    const { country, tier, for_sale, min_score } = req.query;
    const items = ledger.getAll({
      country: country || undefined,
      tier: tier || undefined,
      for_sale: for_sale === 'true' ? true : undefined,
      min_score: min_score || undefined
    });
    res.json({ stats: ledger.stats(), items });
  } catch (err) {
    console.error('Ledger error:', err.message);
    res.status(500).json({ error: 'Failed to read ledger' });
  }
});

// Export the ledger as CSV
router.get('/ledger/export.csv', (req, res) => {
  try {
    const { country, tier, for_sale, min_score } = req.query;
    const csv = ledger.toCSV({
      country: country || undefined,
      tier: tier || undefined,
      for_sale: for_sale === 'true' ? true : undefined,
      min_score: min_score || undefined
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="dc-opportunities-ledger.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Ledger export error:', err.message);
    res.status(500).json({ error: 'Failed to export ledger' });
  }
});

// Delete a single ledger entry
router.delete('/ledger/:key', (req, res) => {
  const ok = ledger.remove(req.params.key);
  res.json({ ok });
});

// Clear the whole ledger
router.delete('/ledger', (req, res) => {
  ledger.clear();
  res.json({ ok: true });
});

// ─── IAM (Identity & Access Management) ────────────────────────
// Manages customers, users/roles, invites and owner-curated property shares.
// See docs/architecture-proposals.md §4–5.

function iamHandler(fn) {
  return (req, res) => {
    try {
      res.json(fn(req));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  };
}

// Summary counts
router.get('/iam/summary', iamHandler(() => iam.summary()));

// Customers
router.get('/iam/customers', iamHandler(() => iam.listCustomers()));
router.post('/iam/customers', iamHandler(req => iam.createCustomer(req.body || {})));
router.delete('/iam/customers/:id', iamHandler(req => ({ ok: iam.deleteCustomer(req.params.id) })));

// Users
router.get('/iam/users', iamHandler(() => iam.listUsers()));
router.post('/iam/users', iamHandler(req => iam.createUser(req.body || {})));
router.patch('/iam/users/:id', iamHandler(req => iam.updateUser(req.params.id, req.body || {})));
router.delete('/iam/users/:id', iamHandler(req => ({ ok: iam.deleteUser(req.params.id) })));

// Invites
router.get('/iam/invites', iamHandler(() => iam.listInvites()));
router.post('/iam/invites', iamHandler(req => iam.createInvite(req.body || {})));
router.delete('/iam/invites/:id', iamHandler(req => ({ ok: iam.revokeInvite(req.params.id) })));

// Property shares (which plots each customer can see)
router.get('/iam/shares', iamHandler(req => iam.listShares(req.query.customer_id)));
router.post('/iam/shares', iamHandler(req => iam.createShare(req.body || {})));
router.delete('/iam/shares/:id', iamHandler(req => ({ ok: iam.revokeShare(req.params.id) })));

// Customer-facing portfolio: only the ledger plots shared with a customer.
router.get('/portfolio', (req, res) => {
  try {
    const customerId = req.query.customer_id;
    if (!customerId) return res.status(400).json({ error: 'customer_id is required' });
    const keys = new Set(iam.keysForCustomer(customerId));
    const items = ledger.getAll().filter(i => keys.has(i.key));
    res.json({ customer_id: customerId, count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to build portfolio' });
  }
});

module.exports = router;
module.exports.getCredential = getCredential;
