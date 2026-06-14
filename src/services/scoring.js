// DC Suitability Scoring Algorithm
// Scores properties 0-100 for datacenter potential
// Two profiles: HYPERSCALE (industrial) and EDGE (commercial)

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Factor: IX Connectivity (30 pts max) ──────────────────────
// Distance to nearest IX, weighted by IX quality (net_count)
function scoreIXConnectivity(lat, lng, ixLocations) {
  if (!ixLocations.length) return { score: 0, detail: 'No IX data' };

  let bestScore = 0;
  let bestIX = null;
  let bestDist = Infinity;

  for (const ix of ixLocations) {
    const dist = haversineKm(lat, lng, ix.lat, ix.lng);
    const netCount = ix.net_count || 0;

    // Distance score (0-20)
    let distScore;
    if (dist <= 10)       distScore = 20;
    else if (dist <= 25)  distScore = 17;
    else if (dist <= 50)  distScore = 14;
    else if (dist <= 100) distScore = 10;
    else if (dist <= 200) distScore = 5;
    else                  distScore = 0;

    // IX quality bonus (0-10): based on number of connected networks
    let qualityBonus;
    if (netCount >= 500)      qualityBonus = 10;
    else if (netCount >= 200) qualityBonus = 8;
    else if (netCount >= 100) qualityBonus = 6;
    else if (netCount >= 50)  qualityBonus = 4;
    else if (netCount >= 10)  qualityBonus = 2;
    else                      qualityBonus = 0;

    const total = distScore + qualityBonus;
    if (total > bestScore || (total === bestScore && dist < bestDist)) {
      bestScore = total;
      bestIX = ix;
      bestDist = dist;
    }
  }

  return {
    score: Math.min(bestScore, 30),
    nearest_ix: bestIX ? bestIX.name : null,
    distance_km: Math.round(bestDist),
    detail: bestIX
      ? `${Math.round(bestDist)}km to ${bestIX.name} (${bestIX.net_count || '?'} networks)`
      : 'No IX found'
  };
}

// ─── Factor: Power Potential (25 pts max) ──────────────────────
function scorePowerPotential(property, profile) {
  if (profile === 'hyperscale') {
    const mw = property.estimated_power_mw || 0;
    let score;
    if (mw >= 200)      score = 25;
    else if (mw >= 100) score = 22;
    else if (mw >= 50)  score = 18;
    else if (mw >= 20)  score = 14;
    else if (mw >= 10)  score = 10;
    else                score = 3;
    return { score, detail: `~${mw} MW est. power potential` };
  } else {
    const kw = property.estimated_power_kw || 0;
    let score;
    if (kw >= 2000)     score = 25;
    else if (kw >= 1000) score = 20;
    else if (kw >= 500) score = 16;
    else if (kw >= 200) score = 12;
    else if (kw >= 100) score = 8;
    else if (kw >= 10)  score = 4;
    else                score = 1;
    return { score, detail: `~${kw} kW est. power potential` };
  }
}

// ─── Factor: Site Size (15 pts max) ────────────────────────────
function scoreSiteSize(area_m2, profile) {
  let score;
  if (profile === 'hyperscale') {
    if (area_m2 >= 200000)     score = 15;
    else if (area_m2 >= 100000) score = 13;
    else if (area_m2 >= 50000)  score = 11;
    else if (area_m2 >= 20000)  score = 9;
    else if (area_m2 >= 10000)  score = 7;
    else if (area_m2 >= 5000)   score = 5;
    else                        score = 2;
  } else {
    if (area_m2 >= 50000)      score = 15;
    else if (area_m2 >= 20000) score = 13;
    else if (area_m2 >= 10000) score = 11;
    else if (area_m2 >= 5000)  score = 9;
    else if (area_m2 >= 3000)  score = 7;
    else                       score = 3;
  }
  return { score, detail: `${area_m2.toLocaleString()} m²` };
}

// ─── Factor: DC Ecosystem (15 pts max) ─────────────────────────
// Existing DCs nearby = positive (connectivity, talent, customers)
function scoreDCEcosystem(lat, lng, datacenters) {
  const within25 = datacenters.filter(dc => haversineKm(lat, lng, dc.lat, dc.lng) <= 25).length;
  const within50 = datacenters.filter(dc => haversineKm(lat, lng, dc.lat, dc.lng) <= 50).length;

  let score;
  if (within25 >= 15)     score = 15;
  else if (within25 >= 8) score = 13;
  else if (within25 >= 4) score = 10;
  else if (within25 >= 2) score = 7;
  else if (within50 >= 3) score = 5;
  else if (within50 >= 1) score = 3;
  else                    score = 0;

  return {
    score,
    dc_within_25km: within25,
    dc_within_50km: within50,
    detail: `${within25} DCs within 25km, ${within50} within 50km`
  };
}

// ─── Factor: Fiber & Cable Proximity (10 pts max) ──────────────
function scoreFiberProximity(lat, lng, landingPoints, fiberRoutes) {
  let score = 0;
  let details = [];

  // Subsea cable landing proximity (0-5)
  if (landingPoints.length) {
    const nearestLP = Math.min(...landingPoints.map(lp => haversineKm(lat, lng, lp.lat, lp.lng)));
    if (nearestLP <= 25)       { score += 5; details.push(`${Math.round(nearestLP)}km to cable landing`); }
    else if (nearestLP <= 50)  { score += 3; details.push(`${Math.round(nearestLP)}km to cable landing`); }
    else if (nearestLP <= 100) { score += 1; details.push(`${Math.round(nearestLP)}km to cable landing`); }
  }

  // Fiber route diversity (0-5): count distinct routes within 10km
  if (fiberRoutes.length) {
    let nearbyRoutes = 0;
    for (const route of fiberRoutes) {
      if (!route.coords || route.coords.length < 2) continue;
      const minDist = Math.min(
        ...route.coords.filter((_, i) => i % 5 === 0).map(c => haversineKm(lat, lng, c[0], c[1]))
      );
      if (minDist <= 10) nearbyRoutes++;
      if (nearbyRoutes >= 10) break;
    }
    if (nearbyRoutes >= 8)      { score += 5; }
    else if (nearbyRoutes >= 4) { score += 3; }
    else if (nearbyRoutes >= 1) { score += 1; }
    details.push(`${nearbyRoutes} fiber routes within 10km`);
  }

  return { score, detail: details.join(', ') || 'No fiber data' };
}

// ─── Factor: Availability (5 pts max) ──────────────────────────
function scoreAvailability(property) {
  if (property.for_sale) {
    return { score: 5, detail: 'For sale — immediately actionable' };
  }
  return { score: 0, detail: 'Not listed for sale' };
}

// ─── Main Scoring Function ─────────────────────────────────────
function scoreProperty(property, context, profile = 'hyperscale') {
  const { ixLocations, datacenters, landingPoints, fiberRoutes } = context;

  const ix = scoreIXConnectivity(property.lat, property.lng, ixLocations);
  const power = scorePowerPotential(property, profile);
  const size = scoreSiteSize(property.area_m2, profile);
  const ecosystem = scoreDCEcosystem(property.lat, property.lng, datacenters);
  const fiber = scoreFiberProximity(property.lat, property.lng, landingPoints, fiberRoutes);
  const availability = scoreAvailability(property);

  const totalScore = ix.score + power.score + size.score + ecosystem.score + fiber.score + availability.score;

  // Gating: top tiers require minimum power and connectivity scores
  let tier, tierLabel;
  if (totalScore >= 90 && power.score >= 20 && ix.score >= 15) {
    tier = 'prime'; tierLabel = '⭐ Prime';
  } else if (totalScore >= 70 && power.score >= 14 && ix.score >= 10) {
    tier = 'high'; tierLabel = '🟢 High';
  } else if (totalScore >= 50) {
    tier = 'medium'; tierLabel = '🟡 Medium';
  } else if (totalScore >= 30) {
    tier = 'low'; tierLabel = '🟠 Low';
  } else {
    tier = 'marginal'; tierLabel = '🔴 Marginal';
  }

  return {
    total_score: totalScore,
    tier,
    tier_label: tierLabel,
    profile,
    breakdown: {
      ix_connectivity: { max: 30, ...ix },
      power_potential: { max: 25, ...power },
      site_size: { max: 15, ...size },
      dc_ecosystem: { max: 15, ...ecosystem },
      fiber_proximity: { max: 10, ...fiber },
      availability: { max: 5, ...availability }
    }
  };
}

module.exports = { scoreProperty, haversineKm };
