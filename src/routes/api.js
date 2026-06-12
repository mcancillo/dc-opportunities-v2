const express = require('express');
const router = express.Router();
const peeringdb = require('../services/peeringdb');
const overpass = require('../services/overpass');
const properties = require('../services/properties');
const commercial = require('../services/commercial');
const cables = require('../services/cables');

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

// Get property opportunities near a point
router.get('/properties', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const data = properties.getProperties(
      parseFloat(lat), parseFloat(lng), parseFloat(radius) || 50000
    );
    res.json(data);
  } catch (err) {
    console.error('Properties error:', err.message);
    res.status(500).json({ error: 'Failed to fetch properties' });
  }
});

// Get commercial real estate near a point (≥3000 m², ≥10 kW)
router.get('/commercial', async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const data = commercial.getCommercial(
      parseFloat(lat), parseFloat(lng), parseFloat(radius) || 50000
    );
    res.json(data);
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
