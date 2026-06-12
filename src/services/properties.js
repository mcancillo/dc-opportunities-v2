const fs = require('fs');
const path = require('path');

const propertiesData = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'properties.json'), 'utf-8')
);

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getProperties(lat, lng, radiusMeters) {
  return propertiesData
    .filter(p => {
      const dist = haversineDistance(lat, lng, p.lat, p.lng);
      return dist <= radiusMeters;
    })
    .map(p => ({
      ...p,
      distance_km: Math.round(haversineDistance(lat, lng, p.lat, p.lng) / 100) / 10
    }));
}

module.exports = { getProperties };
