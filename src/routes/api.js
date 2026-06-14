const express = require('express');
const router = express.Router();
const peeringdb = require('../services/peeringdb');
const overpass = require('../services/overpass');
const properties = require('../services/properties');
const commercial = require('../services/commercial');
const cables = require('../services/cables');
const { scoreProperty } = require('../services/scoring');
const liveListings = require('../services/live-listings');

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
  scoringContext = { ixLocations, landingPoints, fiberRoutes, datacenters: [] };
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

module.exports = router;
