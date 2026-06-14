// DC Suitability Scoring Algorithm v2
// Scores properties 0-100 for datacenter potential
// Two profiles: HYPERSCALE (industrial) and EDGE (commercial)
// 8 factors: IX, Power, Size, Ecosystem, Fiber, Grid Future, Climate/Water, Availability

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Factor 1: IX Connectivity (25 pts max) ────────────────────
function scoreIXConnectivity(lat, lng, ixLocations) {
  if (!ixLocations.length) return { score: 0, detail: 'No IX data' };

  let bestScore = 0, bestIX = null, bestDist = Infinity;

  for (const ix of ixLocations) {
    const dist = haversineKm(lat, lng, ix.lat, ix.lng);
    const netCount = ix.net_count || 0;

    let distScore;
    if (dist <= 10)       distScore = 17;
    else if (dist <= 25)  distScore = 14;
    else if (dist <= 50)  distScore = 11;
    else if (dist <= 100) distScore = 8;
    else if (dist <= 200) distScore = 4;
    else                  distScore = 0;

    let qualityBonus;
    if (netCount >= 500)      qualityBonus = 8;
    else if (netCount >= 200) qualityBonus = 6;
    else if (netCount >= 100) qualityBonus = 5;
    else if (netCount >= 50)  qualityBonus = 3;
    else if (netCount >= 10)  qualityBonus = 1;
    else                      qualityBonus = 0;

    const total = distScore + qualityBonus;
    if (total > bestScore || (total === bestScore && dist < bestDist)) {
      bestScore = total;
      bestIX = ix;
      bestDist = dist;
    }
  }

  return {
    score: Math.min(bestScore, 25),
    nearest_ix: bestIX ? bestIX.name : null,
    distance_km: Math.round(bestDist),
    detail: bestIX
      ? `${Math.round(bestDist)}km to ${bestIX.name} (${bestIX.net_count || '?'} networks)`
      : 'No IX found'
  };
}

// ─── Factor 2: Power Potential (20 pts max) ─────────────────────
function scorePowerPotential(property, profile) {
  if (profile === 'hyperscale') {
    const mw = property.estimated_power_mw || 0;
    let score;
    if (mw >= 200)      score = 20;
    else if (mw >= 100) score = 17;
    else if (mw >= 50)  score = 14;
    else if (mw >= 20)  score = 11;
    else if (mw >= 10)  score = 8;
    else                score = 3;
    return { score, detail: `~${mw} MW est. power potential` };
  } else {
    const kw = property.estimated_power_kw || 0;
    let score;
    if (kw >= 2000)     score = 20;
    else if (kw >= 1000) score = 17;
    else if (kw >= 500) score = 13;
    else if (kw >= 200) score = 10;
    else if (kw >= 100) score = 6;
    else if (kw >= 10)  score = 3;
    else                score = 1;
    return { score, detail: `~${kw} kW est. power potential` };
  }
}

// ─── Factor 3: Site Size (10 pts max) ──────────────────────────
function scoreSiteSize(area_m2, profile) {
  let score;
  if (profile === 'hyperscale') {
    if (area_m2 >= 200000)     score = 10;
    else if (area_m2 >= 100000) score = 9;
    else if (area_m2 >= 50000)  score = 8;
    else if (area_m2 >= 20000)  score = 6;
    else if (area_m2 >= 10000)  score = 5;
    else if (area_m2 >= 5000)   score = 3;
    else                        score = 1;
  } else {
    if (area_m2 >= 50000)      score = 10;
    else if (area_m2 >= 20000) score = 9;
    else if (area_m2 >= 10000) score = 8;
    else if (area_m2 >= 5000)  score = 6;
    else if (area_m2 >= 3000)  score = 4;
    else                       score = 2;
  }
  return { score, detail: `${area_m2.toLocaleString()} m²` };
}

// ─── Factor 4: DC Ecosystem (10 pts max) ───────────────────────
function scoreDCEcosystem(lat, lng, datacenters) {
  const within25 = datacenters.filter(dc => haversineKm(lat, lng, dc.lat, dc.lng) <= 25).length;
  const within50 = datacenters.filter(dc => haversineKm(lat, lng, dc.lat, dc.lng) <= 50).length;

  let score;
  if (within25 >= 15)     score = 10;
  else if (within25 >= 8) score = 9;
  else if (within25 >= 4) score = 7;
  else if (within25 >= 2) score = 5;
  else if (within50 >= 3) score = 3;
  else if (within50 >= 1) score = 2;
  else                    score = 0;

  return {
    score,
    dc_within_25km: within25,
    dc_within_50km: within50,
    detail: `${within25} DCs within 25km, ${within50} within 50km`
  };
}

// ─── Factor 5: Fiber & Cable Proximity (8 pts max) ─────────────
function scoreFiberProximity(lat, lng, landingPoints, fiberRoutes) {
  let score = 0;
  let details = [];

  if (landingPoints.length) {
    const nearestLP = Math.min(...landingPoints.map(lp => haversineKm(lat, lng, lp.lat, lp.lng)));
    if (nearestLP <= 25)       { score += 4; details.push(`${Math.round(nearestLP)}km to cable landing`); }
    else if (nearestLP <= 50)  { score += 2; details.push(`${Math.round(nearestLP)}km to cable landing`); }
    else if (nearestLP <= 100) { score += 1; details.push(`${Math.round(nearestLP)}km to cable landing`); }
  }

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
    if (nearbyRoutes >= 8)      { score += 4; }
    else if (nearbyRoutes >= 4) { score += 2; }
    else if (nearbyRoutes >= 1) { score += 1; }
    details.push(`${nearbyRoutes} fiber routes within 10km`);
  }

  return { score: Math.min(score, 8), detail: details.join(', ') || 'No fiber data' };
}

// ─── Factor 6: Grid Expansion & Future Power (12 pts max) ──────
// Scores proximity to planned grid upgrades, renewable energy zones,
// and existing HV substations — forward-looking indicator
function scoreGridFuture(lat, lng, country, context) {
  let score = 0;
  let details = [];
  const gridExpansion = context.gridExpansion || [];
  const renewableZones = context.renewableZones || [];

  // Planned grid expansions (substations, HV lines) — 0-7 pts
  if (gridExpansion.length) {
    let nearestProject = Infinity;
    let nearestName = '';
    for (const proj of gridExpansion) {
      if (proj.country && proj.country !== country) continue;
      const dist = haversineKm(lat, lng, proj.lat, proj.lng);
      if (dist < nearestProject) { nearestProject = dist; nearestName = proj.name; }
    }
    if (nearestProject <= 10)      { score += 7; details.push(`${Math.round(nearestProject)}km to ${nearestName}`); }
    else if (nearestProject <= 25) { score += 5; details.push(`${Math.round(nearestProject)}km to ${nearestName}`); }
    else if (nearestProject <= 50) { score += 3; details.push(`${Math.round(nearestProject)}km to ${nearestName}`); }
    else if (nearestProject <= 100){ score += 1; details.push(`${Math.round(nearestProject)}km to grid project`); }
  }

  // Renewable energy zones (wind/solar farms) — 0-5 pts
  // Proximity to planned renewables = future cheap/green power
  if (renewableZones.length) {
    const nearRenewables = renewableZones.filter(rz => {
      if (rz.country && rz.country !== country) return false;
      return haversineKm(lat, lng, rz.lat, rz.lng) <= 50;
    }).length;
    if (nearRenewables >= 5)      { score += 5; details.push(`${nearRenewables} renewable projects nearby`); }
    else if (nearRenewables >= 3) { score += 3; details.push(`${nearRenewables} renewable projects nearby`); }
    else if (nearRenewables >= 1) { score += 2; details.push(`${nearRenewables} renewable project nearby`); }
  }

  // Country-level grid capacity bonus (base infrastructure quality)
  const gridQuality = { NL: 2, DE: 2, ES: 1, PL: 0 };
  if (!gridExpansion.length && !renewableZones.length) {
    score = gridQuality[country] || 0;
    details.push(score > 0 ? 'Country base grid quality' : 'Limited grid data');
  }

  return { score: Math.min(score, 12), detail: details.join('; ') || 'No grid expansion data' };
}

// ─── Factor 7: Climate & Cooling (10 pts max) ──────────────────
// Cooler climate = lower PUE = lower operating cost
// Proximity to water = cooling option
function scoreClimateCooling(lat, lng, country) {
  let score = 0;
  let details = [];

  // Latitude-based temperature proxy (higher lat = cooler = better for DCs)
  // European DC sweet spot: 50-60°N (NL, northern DE, PL)
  if (lat >= 55)      { score += 5; details.push('Cold climate — excellent PUE'); }
  else if (lat >= 52) { score += 4; details.push('Cool climate — good PUE'); }
  else if (lat >= 48) { score += 3; details.push('Moderate climate'); }
  else if (lat >= 43) { score += 2; details.push('Warm climate — higher cooling cost'); }
  else                { score += 1; details.push('Hot climate — high cooling cost'); }

  // Coastal / water proximity bonus (crude: distance to nearest coast)
  // NL is almost entirely coastal; northern DE/PL coast; ES has both coast and interior
  const coastalProximity = estimateCoastalProximity(lat, lng, country);
  if (coastalProximity <= 15)      { score += 5; details.push('Coastal — water cooling available'); }
  else if (coastalProximity <= 30) { score += 4; details.push('Near coast/river — cooling potential'); }
  else if (coastalProximity <= 60) { score += 3; details.push('Moderate water access'); }
  else if (coastalProximity <= 100){ score += 2; details.push('Limited water cooling access'); }
  else                             { score += 1; details.push('Inland — air cooling only'); }

  return { score: Math.min(score, 10), detail: details.join('; ') };
}

// Crude coastal proximity estimate using known coastlines
function estimateCoastalProximity(lat, lng, country) {
  // Key coastal reference points per country
  const coastPoints = {
    NL: [[52.95, 4.75], [52.50, 4.55], [51.92, 4.48], [53.32, 5.25], [53.45, 6.85]],
    DE: [[54.30, 10.10], [54.00, 8.80], [53.55, 8.55], [54.32, 13.10], [54.18, 12.10]],
    PL: [[54.35, 18.65], [54.45, 16.87], [54.18, 15.60], [54.50, 17.05]],
    ES: [[43.37, -8.40], [43.26, -2.93], [41.38, 2.16], [39.47, -0.37], [36.72, -4.42], [37.37, -5.97]]
  };
  const points = coastPoints[country] || [];
  if (!points.length) return 200;
  return Math.min(...points.map(([clat, clng]) => haversineKm(lat, lng, clat, clng)));
}

// ─── Factor 8: Availability & Market (5 pts max) ──────────────
function scoreAvailability(property) {
  let score = 0;
  let detail;

  if (property.for_sale) {
    score = 5;
    detail = 'For sale — immediately actionable';
  } else if (property.listing_url) {
    score = 2;
    detail = 'Not for sale — but listing link available';
  } else {
    score = 0;
    detail = 'Not listed for sale';
  }

  return { score, detail };
}

// ─── Main Scoring Function ─────────────────────────────────────
// 8 factors, 100 pts total:
//   IX Connectivity:  25  |  Power Potential:  20  |  Grid Future: 12
//   Site Size:        10  |  DC Ecosystem:     10  |  Climate:     10
//   Fiber Proximity:   8  |  Availability:      5
function scoreProperty(property, context, profile = 'hyperscale') {
  const { ixLocations = [], datacenters = [], landingPoints = [], fiberRoutes = [] } = context;

  const ix = scoreIXConnectivity(property.lat, property.lng, ixLocations);
  const power = scorePowerPotential(property, profile);
  const size = scoreSiteSize(property.area_m2, profile);
  const ecosystem = scoreDCEcosystem(property.lat, property.lng, datacenters);
  const fiber = scoreFiberProximity(property.lat, property.lng, landingPoints, fiberRoutes);
  const gridFuture = scoreGridFuture(property.lat, property.lng, property.country, context);
  const climate = scoreClimateCooling(property.lat, property.lng, property.country);
  const availability = scoreAvailability(property);

  const totalScore = ix.score + power.score + size.score + ecosystem.score +
    fiber.score + gridFuture.score + climate.score + availability.score;

  // Gating: top tiers require minimum power and connectivity scores
  let tier, tierLabel;
  if (totalScore >= 85 && power.score >= 16 && ix.score >= 12) {
    tier = 'prime'; tierLabel = '⭐ Prime';
  } else if (totalScore >= 65 && power.score >= 11 && ix.score >= 8) {
    tier = 'high'; tierLabel = '🟢 High';
  } else if (totalScore >= 45) {
    tier = 'medium'; tierLabel = '🟡 Medium';
  } else if (totalScore >= 25) {
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
      ix_connectivity: { max: 25, ...ix },
      power_potential: { max: 20, ...power },
      grid_future: { max: 12, ...gridFuture },
      site_size: { max: 10, ...size },
      dc_ecosystem: { max: 10, ...ecosystem },
      climate_cooling: { max: 10, ...climate },
      fiber_proximity: { max: 8, ...fiber },
      availability: { max: 5, ...availability }
    }
  };
}

module.exports = { scoreProperty, haversineKm };
