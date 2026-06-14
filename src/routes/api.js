const express = require('express');
const router = express.Router();
const peeringdb = require('../services/peeringdb');
const overpass = require('../services/overpass');
const properties = require('../services/properties');
const commercial = require('../services/commercial');
const cables = require('../services/cables');
const { scoreProperty } = require('../services/scoring');

// Cached context for scoring (populated lazily)
let scoringContext = null;
async function getScoringContext() {
  if (scoringContext) return scoringContext;
  const [ixLocations, landingPoints] = await Promise.all([
    peeringdb.getIXLocations(),
    Promise.resolve(cables.getLandingPoints())
  ]);
  // Fiber routes cached from previous calls (may be empty on first call)
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

// Get property opportunities near a point (with DC suitability scores)
router.get('/properties', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const pLat = parseFloat(lat), pLng = parseFloat(lng), pRadius = parseFloat(radius) || 50000;
    const data = properties.getProperties(pLat, pLng, pRadius);

    // Score each property
    const ctx = await getScoringContext();
    // Get nearby DCs for ecosystem scoring
    let datacenters = [];
    try { datacenters = await overpass.getDatacenters(pLat, pLng, Math.max(pRadius, 50000)); } catch (e) { /* ok */ }
    const fullCtx = { ...ctx, datacenters };

    const scored = data.map(p => ({
      ...p,
      score: scoreProperty(p, fullCtx, 'hyperscale')
    }));

    res.json(scored);
  } catch (err) {
    console.error('Properties error:', err.message);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Get commercial real estate near a point (with DC suitability scores)
router.get('/commercial', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const pLat = parseFloat(lat), pLng = parseFloat(lng), pRadius = parseFloat(radius) || 50000;
    const data = commercial.getCommercial(pLat, pLng, pRadius);

    const ctx = await getScoringContext();
    let datacenters = [];
    try { datacenters = await overpass.getDatacenters(pLat, pLng, Math.max(pRadius, 50000)); } catch (e) { /* ok */ }
    const fullCtx = { ...ctx, datacenters };

    const scored = data.map(p => ({
      ...p,
      score: scoreProperty(p, fullCtx, 'edge')
    }));

    res.json(scored);
  } catch (err) {
    console.error('Commercial error:', err.message);
    res.status(500).json({ error: 'Failed to fetch commercial properties' });
  }
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
