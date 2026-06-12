const express = require('express');
const router = express.Router();
const peeringdb = require('../services/peeringdb');
const overpass = require('../services/overpass');
const properties = require('../services/properties');

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

// Get data source documentation per country
router.get('/sources', (req, res) => {
  const sources = require('../../data/sources.json');
  res.json(sources);
});

module.exports = router;
