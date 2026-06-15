// ─── State ───────────────────────────────────────────────────────
let map, ixData = [], landingData = [], searchCircle;
const layers = { properties: null, datacenters: null, ix: null, subseaCables: null, landingPoints: null, fiberBackbone: null, backboneLinks: null };

// ─── Map Init ────────────────────────────────────────────────────
function initMap() {
  map = L.map('map', { zoomControl: true }).setView([50.5, 10], 5);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19
  }).addTo(map);
}

// ─── Marker Factories ───────────────────────────────────────────
function makeCircleIcon(color, radius = 10) {
  return L.divIcon({
    className: '',
    html: `<svg width="${radius*2}" height="${radius*2}"><circle cx="${radius}" cy="${radius}" r="${radius-1}" fill="${color}" stroke="#fff" stroke-width="1.5" opacity="0.9"/></svg>`,
    iconSize: [radius*2, radius*2],
    iconAnchor: [radius, radius]
  });
}

const ICONS = {
  forSale:    () => makeCircleIcon('#ff4444', 11),
  notForSale: () => makeCircleIcon('#ff8c00', 11),
  commForSale:    () => makeCircleIcon('#aa44ff', 10),
  commNotForSale: () => makeCircleIcon('#ff69b4', 10),
  datacenter: () => makeCircleIcon('#4da6ff', 8),
  ix:         () => makeCircleIcon('#33cc66', 13),
  landing:    () => makeCircleIcon('#4488ff', 13)
};

// ─── Score Helpers ──────────────────────────────────────────────
function tierBadge(score) {
  if (!score) return '';
  const { tier, total_score, tier_label } = score;
  const colors = { prime:'#00ff88', high:'#33cc66', medium:'#ffcc00', low:'#ff8c00', marginal:'#ff4444' };
  const color = colors[tier] || '#888';
  return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${color}22;border:1px solid ${color};color:${color};font-size:0.78rem;font-weight:700;">${tier_label} — ${total_score}/100</span>`;
}
function scoreBreakdown(score) {
  if (!score || !score.breakdown) return '';
  const b = score.breakdown;
  return `<div style="font-size:0.7rem;color:#aaa;margin-top:4px;line-height:1.5">
    IX: ${b.ix_connectivity.score}/${b.ix_connectivity.max} · Power: ${b.power_potential.score}/${b.power_potential.max} · Grid: ${b.grid_future?.score || 0}/${b.grid_future?.max || 12} · Size: ${b.site_size.score}/${b.site_size.max} · DC: ${b.dc_ecosystem.score}/${b.dc_ecosystem.max} · Climate: ${b.climate_cooling?.score || 0}/${b.climate_cooling?.max || 10} · Fiber: ${b.fiber_proximity.score}/${b.fiber_proximity.max} · Avail: ${b.availability.score}/${b.availability.max}
  </div>`;
}

// ─── Popup Builders ─────────────────────────────────────────────
function propertyPopup(p) {
  const badge = p.for_sale
    ? '<span class="popup-badge sale">FOR SALE</span>'
    : '<span class="popup-badge not-sale">NOT FOR SALE</span>';
  const price = p.for_sale && p.price_eur
    ? `<br>💰 €${(p.price_eur / 1e6).toFixed(1)}M`
    : '';
  const listing = p.for_sale && p.listing_url
    ? `<div style="margin-top:6px"><a href="${p.listing_url}" target="_blank" rel="noopener" style="color:#ff6666;font-weight:600;font-size:0.85rem;text-decoration:none;">🔗 View Listing →</a></div>`
    : '';
  const scoreLine = p.score ? `<div style="margin-top:6px">${tierBadge(p.score)}</div>${scoreBreakdown(p.score)}` : '';
  return `
    <div class="popup-title">${p.name}</div>
    <div class="popup-meta">
      📍 ${p.city}, ${p.country}<br>
      📐 ${p.area_m2.toLocaleString()} m²<br>
      ⚡ ~${p.estimated_power_mw} MW (est.)${price}<br>
      🏭 ${p.sector}<br>
      📏 ${p.distance_km} km from IX
    </div>
    ${badge}${listing}${scoreLine}
    <div style="margin-top:6px;font-size:0.7rem;color:#888">${p.data_source}</div>
  `;
}

function commercialPopup(p) {
  const badge = p.for_sale
    ? '<span class="popup-badge comm-sale">FOR SALE</span>'
    : '<span class="popup-badge comm-not-sale">NOT FOR SALE</span>';
  const listing = p.for_sale && p.listing_url
    ? `<div style="margin-top:6px"><a href="${p.listing_url}" target="_blank" rel="noopener" style="color:#aa44ff;font-weight:600;font-size:0.85rem;text-decoration:none;">🔗 View Listing →</a></div>`
    : '';
  const scoreLine = p.score ? `<div style="margin-top:6px">${tierBadge(p.score)}</div>${scoreBreakdown(p.score)}` : '';
  return `
    <div class="popup-title">${p.name}</div>
    <div class="popup-meta">
      📍 ${p.city}, ${p.country}<br>
      📐 ${p.area_m2.toLocaleString()} m²<br>
      ⚡ ~${p.estimated_power_kw} kW (est.)<br>
      🏢 ${p.sector}<br>
      📏 ${p.distance_km} km from IX
    </div>
    ${badge}${listing}${scoreLine}
    <div style="margin-top:6px;font-size:0.7rem;color:#888">${p.data_source}</div>
  `;
}

function datacenterPopup(dc) {
  return `
    <div class="popup-title">${dc.name}</div>
    <div class="popup-meta">
      ${dc.operator ? '🏢 ' + dc.operator + '<br>' : ''}
      📡 Source: ${dc.source}
    </div>
    <span class="popup-badge dc">EXISTING DATACENTER</span>
  `;
}

function ixPopup(ix) {
  return `
    <div class="popup-title">${ix.name}</div>
    <div class="popup-meta">
      ${ix.name_long ? ix.name_long + '<br>' : ''}
      📍 ${ix.city}, ${ix.country}
      ${ix.website ? '<br>🌐 <a href="' + ix.website + '" target="_blank" style="color:#4da6ff">' + ix.website + '</a>' : ''}
    </div>
    <span class="popup-badge ix">INTERNET EXCHANGE</span>
  `;
}

// ─── Data Fetching ──────────────────────────────────────────────
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

async function loadIXLocations() {
  ixData = await fetchJSON('/api/ix-locations');
}

// ─── UI Wiring ──────────────────────────────────────────────────
const countrySelect = document.getElementById('country-select');
const ixSelect = document.getElementById('ix-select');
const lpSelect = document.getElementById('lp-select');
const radiusSlider = document.getElementById('radius-slider');
const radiusValue = document.getElementById('radius-value');
const searchBtn = document.getElementById('search-btn');
const loading = document.getElementById('loading');
const resultsSummary = document.getElementById('results-summary');
const propertyList = document.getElementById('property-list');

countrySelect.addEventListener('change', () => {
  const country = countrySelect.value;
  ixSelect.innerHTML = '<option value="">Select an IX…</option>';
  lpSelect.innerHTML = '<option value="">Select a landing point…</option>';
  infraSelectedLocation = null;
  // Sync infra tab country selector
  const infraCountry = document.getElementById('infra-country');
  if (infraCountry) infraCountry.value = country || '';

  if (!country) { ixSelect.disabled = true; lpSelect.disabled = true; searchBtn.disabled = true; return; }

  const countryIXs = ixData.filter(ix => ix.country === country);
  countryIXs.forEach(ix => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ id: ix.id, lat: ix.lat, lng: ix.lng, name: ix.name });
    opt.textContent = `${ix.name} — ${ix.city}`;
    ixSelect.appendChild(opt);
  });
  ixSelect.disabled = false;

  const countryLPs = landingData.filter(lp => {
    const cc = extractCountry(lp.name);
    return cc === country;
  });
  countryLPs.forEach(lp => {
    const opt = document.createElement('option');
    const city = lp.name.split(',')[0].trim();
    opt.value = JSON.stringify({ lat: lp.lat, lng: lp.lng, name: city });
    opt.textContent = `🔵 ${city}`;
    lpSelect.appendChild(opt);
  });
  lpSelect.disabled = false;
});

ixSelect.addEventListener('change', () => {
  if (ixSelect.value) {
    lpSelect.value = '';
    const info = JSON.parse(ixSelect.value);
    setInfraLocation(info.lat, info.lng, info.name);
  } else {
    infraSelectedLocation = null;
  }
  searchBtn.disabled = !ixSelect.value && !lpSelect.value;
});

lpSelect.addEventListener('change', () => {
  if (lpSelect.value) {
    ixSelect.value = '';
    const info = JSON.parse(lpSelect.value);
    setInfraLocation(info.lat, info.lng, info.name);
  } else {
    infraSelectedLocation = null;
  }
  searchBtn.disabled = !ixSelect.value && !lpSelect.value;
});

radiusSlider.addEventListener('input', () => {
  radiusValue.textContent = radiusSlider.value;
});

searchBtn.addEventListener('click', runSearch);

// ─── Search ─────────────────────────────────────────────────────
async function runSearch() {
  const activeSelect = ixSelect.value ? ixSelect : lpSelect;
  const locationInfo = JSON.parse(activeSelect.value);
  const radiusKm = parseInt(radiusSlider.value);
  const radiusM = radiusKm * 1000;
  const country = countrySelect.value;
  const searchLabel = locationInfo.name;

  // UI state
  loading.classList.remove('hidden');
  resultsSummary.classList.add('hidden');
  propertyList.innerHTML = '';
  searchBtn.disabled = true;

  // Clear old layers — preserve infrastructure overlays
  ['properties', 'commercial', 'datacenters', 'ix'].forEach(k => {
    if (layers[k]) { map.removeLayer(layers[k]); layers[k] = null; }
  });
  if (searchCircle) map.removeLayer(searchCircle);

  // Re-add infrastructure overlays if enabled
  if (document.getElementById('toggle-subsea').checked) {
    if (layers.subseaCables) layers.subseaCables.addTo(map);
    if (layers.landingPoints) layers.landingPoints.addTo(map);
    if (layers.backboneLinks) layers.backboneLinks.addTo(map);
  }
  if (document.getElementById('toggle-fiber').checked) {
    if (layers.fiberBackbone) layers.fiberBackbone.addTo(map);
  }

  try {
    // Fetch data in parallel
    const [propertiesResp, commercialResp, datacentersResp, portalLinks] = await Promise.all([
      fetchJSON(`/api/properties?lat=${locationInfo.lat}&lng=${locationInfo.lng}&radius=${radiusM}&country=${country}`),
      fetchJSON(`/api/commercial?lat=${locationInfo.lat}&lng=${locationInfo.lng}&radius=${radiusM}&country=${country}`),
      fetchJSON(`/api/datacenters?lat=${locationInfo.lat}&lng=${locationInfo.lng}&radius=${radiusM}`),
      fetchJSON(`/api/portal-links?country=${country}&lat=${locationInfo.lat}&lng=${locationInfo.lng}&radius=${radiusM}`)
    ]);

    // Draw search radius
    searchCircle = L.circle([locationInfo.lat, locationInfo.lng], {
      radius: radiusM,
      color: '#e94560',
      fillColor: '#e94560',
      fillOpacity: 0.05,
      dashArray: '8 6',
      weight: 2
    }).addTo(map);

    // Search center marker
    layers.ix = L.layerGroup();
    const isLandingPoint = !!lpSelect.value;
    const centerIcon = isLandingPoint ? ICONS.landing() : ICONS.ix();
    const centerPopup = isLandingPoint
      ? `<b>🔵 ${searchLabel}</b><br>Subsea cable landing point`
      : ixPopup(locationInfo);
    L.marker([locationInfo.lat, locationInfo.lng], { icon: centerIcon })
      .bindPopup(centerPopup)
      .addTo(layers.ix);
    layers.ix.addTo(map);

    // Properties
    layers.properties = L.layerGroup();
    const forSale = propertiesResp.filter(p => p.for_sale);
    const notForSale = propertiesResp.filter(p => !p.for_sale);

    propertiesResp.forEach(p => {
      const icon = p.for_sale ? ICONS.forSale() : ICONS.notForSale();
      L.marker([p.lat, p.lng], { icon })
        .bindPopup(propertyPopup(p))
        .addTo(layers.properties);
    });
    layers.properties.addTo(map);

    // Commercial properties
    layers.commercial = L.layerGroup();
    const commForSale = commercialResp.filter(p => p.for_sale);
    const commNotForSale = commercialResp.filter(p => !p.for_sale);

    commercialResp.forEach(p => {
      const icon = p.for_sale ? ICONS.commForSale() : ICONS.commNotForSale();
      L.marker([p.lat, p.lng], { icon })
        .bindPopup(commercialPopup(p))
        .addTo(layers.commercial);
    });
    layers.commercial.addTo(map);

    // Datacenters
    layers.datacenters = L.layerGroup();
    datacentersResp.forEach(dc => {
      L.marker([dc.lat, dc.lng], { icon: ICONS.datacenter() })
        .bindPopup(datacenterPopup(dc))
        .addTo(layers.datacenters);
    });
    layers.datacenters.addTo(map);

    // Fit map
    map.fitBounds(searchCircle.getBounds(), { padding: [30, 30] });

    // Update stats
    document.getElementById('stat-for-sale').textContent = forSale.length;
    document.getElementById('stat-not-for-sale').textContent = notForSale.length;
    document.getElementById('stat-comm-sale').textContent = commForSale.length;
    document.getElementById('stat-comm-not-sale').textContent = commNotForSale.length;
    document.getElementById('stat-datacenters').textContent = datacentersResp.length;
    resultsSummary.classList.remove('hidden');

    // Property cards — industrial first, sorted by score (highest first)
    propertiesResp
      .sort((a, b) => (b.score?.total_score || 0) - (a.score?.total_score || 0))
      .forEach(p => {
        const card = document.createElement('div');
        card.className = `property-card ${p.for_sale ? 'for-sale' : 'not-for-sale'}`;
        card.innerHTML = `
          <h4>${p.name} ${p.score ? tierBadge(p.score) : ''}</h4>
          <div class="meta">
            <span>📍 ${p.city}</span>
            <span>📐 ${p.area_m2.toLocaleString()} m²</span>
            <span>⚡ ~${p.estimated_power_mw} MW</span>
            <span>📏 ${p.distance_km} km</span>
            ${p.for_sale && p.price_eur ? `<span>💰 €${(p.price_eur/1e6).toFixed(1)}M</span>` : ''}
          </div>
          ${p.for_sale && p.listing_url ? `<a href="${p.listing_url}" target="_blank" rel="noopener" class="listing-link" onclick="event.stopPropagation()">🔗 View Listing →</a>` : ''}
        `;
        card.addEventListener('click', () => {
          map.setView([p.lat, p.lng], 13);
        });
        propertyList.appendChild(card);
      });

    // Commercial cards
    if (commercialResp.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'section-divider';
      divider.innerHTML = '<span>🏢 Commercial Real Estate</span>';
      propertyList.appendChild(divider);

      commercialResp
        .sort((a, b) => (b.score?.total_score || 0) - (a.score?.total_score || 0))
        .forEach(p => {
          const card = document.createElement('div');
          card.className = `property-card ${p.for_sale ? 'comm-for-sale' : 'comm-not-for-sale'}`;
          card.innerHTML = `
            <h4>${p.name} ${p.score ? tierBadge(p.score) : ''}</h4>
            <div class="meta">
              <span>📍 ${p.city}</span>
              <span>📐 ${p.area_m2.toLocaleString()} m²</span>
              <span>⚡ ~${p.estimated_power_kw} kW</span>
              <span>📏 ${p.distance_km} km</span>
            </div>
            ${p.for_sale && p.listing_url ? `<a href="${p.listing_url}" target="_blank" rel="noopener" class="listing-link comm" onclick="event.stopPropagation()">🔗 View Listing →</a>` : ''}
          `;
          card.addEventListener('click', () => {
            map.setView([p.lat, p.lng], 13);
          });
          propertyList.appendChild(card);
        });
    }

    // Portal links section — links to RE websites for more listings
    if (portalLinks && portalLinks.length > 0) {
      const portalDiv = document.createElement('div');
      portalDiv.className = 'section-divider';
      portalDiv.innerHTML = '<span>🌐 Search RE Portals</span>';
      propertyList.appendChild(portalDiv);

      portalLinks.forEach(link => {
        const card = document.createElement('div');
        card.className = 'property-card portal-link-card';
        card.innerHTML = `
          <h4><a href="${link.url}" target="_blank" rel="noopener" style="color:#4da6ff;text-decoration:none;">${link.name} ↗</a></h4>
          <div class="meta">
            <span>🏷️ ${link.type}</span>
            <span>📝 ${link.note}</span>
          </div>
        `;
        propertyList.appendChild(card);
      });

      // Show live data stats
      const liveIndustrial = propertiesResp.filter(p => p.source_type === 'osm_industrial' || p.source_type === 'pdok_bag');
      const liveCommercial = commercialResp.filter(p => p.source_type === 'osm_commercial');
      if (liveIndustrial.length > 0 || liveCommercial.length > 0) {
        const statsDiv = document.createElement('div');
        statsDiv.className = 'property-card';
        statsDiv.style.borderColor = '#4da6ff';
        statsDiv.innerHTML = `
          <h4 style="color:#4da6ff">📡 Live Data Sources</h4>
          <div class="meta">
            <span>🏭 ${liveIndustrial.length} industrial from OSM/PDOK</span>
            <span>🏢 ${liveCommercial.length} commercial from OSM</span>
            <span>📦 ${propertiesResp.length - liveIndustrial.length + commercialResp.length - liveCommercial.length} curated</span>
          </div>
        `;
        propertyList.appendChild(statsDiv);
      }
    }

  } catch (err) {
    console.error('Search error:', err);
    propertyList.innerHTML = `<div style="color:#ff4444;padding:10px;">Error: ${err.message}</div>`;
  } finally {
    loading.classList.add('hidden');
    searchBtn.disabled = false;
  }
}

// ─── Sources Modal ──────────────────────────────────────────────
document.getElementById('sources-link').addEventListener('click', async (e) => {
  e.preventDefault();
  const modal = document.getElementById('sources-modal');
  const body = document.getElementById('sources-body');

  try {
    const sources = await fetchJSON('/api/sources');
    let html = '';
    for (const [code, info] of Object.entries(sources)) {
      html += `<h3>${info.country} (${code})</h3>`;
      html += `<div class="source-category">Internet Exchanges</div>`;
      html += `<ul><li><strong>${info.internet_exchanges.primary}</strong></li>`;
      info.internet_exchanges.others.forEach(ix => { html += `<li>${ix}</li>`; });
      html += '</ul>';

      html += `<div class="source-category">Commercial Real Estate</div><ul>`;
      info.commercial_real_estate.portals.forEach(p => {
        html += `<li><a href="${p.url}" target="_blank">${p.name}</a> — ${p.type}</li>`;
      });
      html += '</ul>';

      if (info.commercial_real_estate.cadastral_data) {
        const c = info.commercial_real_estate.cadastral_data;
        html += `<div class="source-category">Cadastral / Geodata</div>`;
        html += `<ul><li><a href="${c.url}" target="_blank">${c.name}</a> — ${c.notes}</li></ul>`;
      }

      html += `<div class="source-category">Energy Grid (TSO)</div><ul>`;
      const tso = Array.isArray(info.energy_grid.tso) ? info.energy_grid.tso : [info.energy_grid.tso];
      tso.forEach(t => { html += `<li><a href="${t.url}" target="_blank">${t.name}</a></li>`; });
      html += '</ul>';
    }
    body.innerHTML = html;
  } catch (err) {
    body.innerHTML = `<p style="color:#ff4444">Failed to load sources: ${err.message}</p>`;
  }

  modal.classList.remove('hidden');
});

document.getElementById('sources-close').addEventListener('click', () => {
  document.getElementById('sources-modal').classList.add('hidden');
});

document.getElementById('sources-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add('hidden');
  }
});

// ─── Infrastructure Layers (Cables & Fiber) ────────────────────

// Map landing point country names to IX country codes
const COUNTRY_MAP = {
  'Netherlands': 'NL', 'Germany': 'DE', 'Poland': 'PL', 'Spain': 'ES'
};

function extractCountry(lpName) {
  for (const [full, code] of Object.entries(COUNTRY_MAP)) {
    if (lpName.includes(full)) return code;
  }
  return null;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Primary national IX hubs — landing points always connect to these
const PRIMARY_IX = {
  'NL': ['AMS-IX'],
  'DE': ['DE-CIX Frankfurt'],
  'PL': ['PLIX'],
  'ES': ['ESPANIX']
};

function buildBackboneLinks() {
  if (!landingData.length || !ixData.length) return;

  layers.backboneLinks = L.layerGroup();

  const drawn = new Set();

  landingData.forEach(lp => {
    const cc = extractCountry(lp.name);
    if (!cc) return;

    const countryIXs = ixData.filter(ix => ix.country === cc);
    if (!countryIXs.length) return;

    const targets = new Map();

    // 1) Closest IX in the same country
    let closest = null, closestDist = Infinity;
    countryIXs.forEach(ix => {
      const d = haversineKm(lp.lat, lp.lng, ix.lat, ix.lng);
      if (d < closestDist) { closestDist = d; closest = ix; }
    });
    if (closest) targets.set(closest.id, { ix: closest, dist: closestDist });

    // 2) Primary national IX (if different from closest)
    const primaryNames = PRIMARY_IX[cc] || [];
    countryIXs.forEach(ix => {
      if (primaryNames.some(p => ix.name.includes(p)) && !targets.has(ix.id)) {
        targets.set(ix.id, { ix, dist: haversineKm(lp.lat, lp.lng, ix.lat, ix.lng) });
      }
    });

    targets.forEach(({ ix, dist }) => {
      const key = `${lp.lat.toFixed(3)},${lp.lng.toFixed(3)}-${ix.lat.toFixed(3)},${ix.lng.toFixed(3)}`;
      if (drawn.has(key)) return;
      drawn.add(key);

      const distLabel = Math.round(dist);
      const cityName = lp.name.split(',')[0];

      L.polyline([[lp.lat, lp.lng], [ix.lat, ix.lng]], {
        color: '#ff66ff',
        weight: 2.5,
        opacity: 0.7,
        dashArray: '8 5'
      })
        .bindPopup(`
          <div class="popup-title">🔗 Backbone Link</div>
          <div class="popup-meta">
            📡 ${cityName} landing → ${ix.name}<br>
            📏 ~${distLabel} km terrestrial
          </div>
          <span class="popup-badge" style="background:#ff66ff;color:#000">LAND ROUTE</span>
        `)
        .addTo(layers.backboneLinks);
    });
  });

  layers.backboneLinks.addTo(map);
  console.log(`Built ${drawn.size} backbone links`);
}

async function loadSubseaCables() {
  try {
    const [cablesData, lpData] = await Promise.all([
      fetchJSON('/api/subsea-cables'),
      fetchJSON('/api/landing-points')
    ]);

    landingData = lpData;

    // Subsea cable routes
    layers.subseaCables = L.layerGroup();
    cablesData.forEach(cable => {
      cable.segments.forEach(segment => {
        if (segment.length < 2) return;
        L.polyline(segment, {
          color: cable.color || '#00ccff',
          weight: 2,
          opacity: 0.5,
          dashArray: '6 4'
        })
          .bindPopup(`<div class="popup-title">${cable.name}</div><span class="popup-badge dc">SUBSEA CABLE</span>`)
          .addTo(layers.subseaCables);
      });
    });
    layers.subseaCables.addTo(map);

    // Landing points
    layers.landingPoints = L.layerGroup();
    const landingIcon = L.divIcon({
      className: '',
      html: '<svg width="14" height="14"><polygon points="7,1 13,13 1,13" fill="#00ccff" stroke="#fff" stroke-width="1.5" opacity="0.9"/></svg>',
      iconSize: [14, 14],
      iconAnchor: [7, 13]
    });
    lpData.forEach(lp => {
      L.marker([lp.lat, lp.lng], { icon: landingIcon })
        .bindPopup(`<div class="popup-title">${lp.name}</div><div class="popup-meta">📍 Cable Landing Point</div><span class="popup-badge dc">LANDING STATION</span>`)
        .addTo(layers.landingPoints);
    });
    layers.landingPoints.addTo(map);

    console.log(`Loaded ${cablesData.length} subsea cables, ${lpData.length} landing points`);
  } catch (err) {
    console.error('Failed to load subsea cables:', err);
  }
}

async function loadFiberBackbone() {
  try {
    const fiberData = await fetchJSON('/api/fiber-backbone');

    layers.fiberBackbone = L.layerGroup();
    fiberData.forEach(fiber => {
      if (fiber.coords.length < 2) return;
      const color = fiber.submarine ? '#00ccff' : '#ffcc00';
      L.polyline(fiber.coords, {
        color,
        weight: fiber.submarine ? 2 : 1.5,
        opacity: fiber.submarine ? 0.4 : 0.35,
        dashArray: fiber.submarine ? '6 4' : null
      })
        .bindPopup(`<div class="popup-title">${fiber.name}</div>${fiber.operator ? '<div class="popup-meta">🏢 ' + fiber.operator + '</div>' : ''}<span class="popup-badge" style="background:${color};color:#000">${fiber.submarine ? 'SUBMARINE CABLE' : 'FIBER BACKBONE'}</span>`)
        .addTo(layers.fiberBackbone);
    });
    layers.fiberBackbone.addTo(map);

    console.log(`Loaded ${fiberData.length} fiber routes`);
  } catch (err) {
    console.error('Failed to load fiber backbone:', err);
  }
}

// Toggle handlers
document.getElementById('toggle-subsea').addEventListener('change', (e) => {
  if (e.target.checked) {
    if (layers.subseaCables) layers.subseaCables.addTo(map);
    if (layers.landingPoints) layers.landingPoints.addTo(map);
    if (layers.backboneLinks) layers.backboneLinks.addTo(map);
  } else {
    if (layers.subseaCables) map.removeLayer(layers.subseaCables);
    if (layers.landingPoints) map.removeLayer(layers.landingPoints);
    if (layers.backboneLinks) map.removeLayer(layers.backboneLinks);
  }
});

document.getElementById('toggle-fiber').addEventListener('change', (e) => {
  if (e.target.checked) {
    if (layers.fiberBackbone) layers.fiberBackbone.addTo(map);
  } else {
    if (layers.fiberBackbone) map.removeLayer(layers.fiberBackbone);
  }
});

// ─── Tab Switching ──────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'infra-tab') loadInfrastructureTab();
  });
});

// ─── Infrastructure Tab ─────────────────────────────────────────
let infraData = null;
let infraSelectedLocation = null; // {lat, lng, name} from IX or LP selection

function setInfraLocation(lat, lng, name) {
  infraSelectedLocation = { lat, lng, name };
  // If infra tab is visible, refresh it
  if (document.getElementById('infra-tab').classList.contains('active')) loadInfrastructureTab();
}

async function loadInfrastructureTab() {
  const country = document.getElementById('infra-country').value || '';
  const url = country ? `/api/infrastructure?country=${country}` : '/api/infrastructure';

  try {
    infraData = await fetchJSON(url);
  } catch (e) {
    console.error('Failed to load infrastructure data:', e);
    return;
  }

  const loc = infraSelectedLocation;
  const banner = document.getElementById('infra-highlight-banner');
  if (loc) {
    document.getElementById('infra-highlight-name').textContent = loc.name;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }

  renderInfraSection('infra-grid-list', [...infraData.gridExpansion, ...infraData.renewableZones], loc, 'grid');
  renderInfraSection('infra-fiber-list', infraData.fiberPlans, loc, 'fiber');
  renderInfraSection('infra-crossborder-list', infraData.crossborderLinks, loc, 'crossborder');
}

function renderInfraSection(containerId, items, location, sectionType) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<div style="color:#666;font-size:0.8rem;padding:8px;">No data for selected country</div>';
    return;
  }

  // Calculate distances and sort: nearby first if location selected
  const enriched = items.map(item => {
    let dist = null;
    if (location && item.lat && item.lng) {
      dist = haversineKm(location.lat, location.lng, item.lat, item.lng);
    } else if (location && item.landing_points) {
      // For crossborder items, use nearest landing point
      const dists = item.landing_points.map(lp => haversineKm(location.lat, location.lng, lp.lat, lp.lng));
      dist = Math.min(...dists);
    }
    return { ...item, _dist: dist, _nearby: dist !== null && dist <= 150 };
  });

  // Sort: highlighted (nearby) first, then by distance
  enriched.sort((a, b) => {
    if (a._nearby && !b._nearby) return -1;
    if (!a._nearby && b._nearby) return 1;
    if (a._dist !== null && b._dist !== null) return a._dist - b._dist;
    return 0;
  });

  enriched.forEach(item => {
    const card = document.createElement('div');
    card.className = 'infra-card' + (item._nearby ? ' highlighted' : '');

    const icon = sectionType === 'grid' ? (item.type === 'solar' || item.type === 'onshore_wind' || item.type === 'offshore_wind' || item.type === 'mixed' ? '🌿' : '⚡')
      : sectionType === 'fiber' ? '🔗' : '🌊';

    const statusClass = (item.status || 'planned').toLowerCase().replace(/\s+/g, '-');
    const statusLabel = item.status || item.timeline || '';

    const distLine = item._dist !== null
      ? `<span class="infra-distance">${Math.round(item._dist)} km away</span>`
      : '';

    const typeBadge = item.type
      ? `<span class="infra-tag">${item.type.replace(/_/g, ' ')}</span>`
      : '';

    const voltLine = item.voltage_kv ? `${item.voltage_kv} kV · ` : '';
    const capLine = item.capacity_mw ? `${item.capacity_mw.toLocaleString()} MW · ` : '';
    const opLine = item.operator ? `${item.operator} · ` : '';
    const coverLine = item.coverage ? `<br>📍 ${item.coverage}` : '';
    const countriesLine = item.countries ? `<br>🌐 ${item.countries.join(', ')}` : '';
    const cityLine = item.relevant_cities ? ` · ${item.relevant_cities.join(', ')}` : '';
    const sourceLine = item.source_url
      ? `<br><a href="${item.source_url}" target="_blank" rel="noopener" class="infra-source">📄 Source ↗</a>`
      : '';

    card.innerHTML = `
      <div class="infra-card-title">
        ${icon} ${item.name}
        <span class="infra-status ${statusClass}">${statusLabel}</span>
        ${typeBadge}
      </div>
      <div class="infra-card-meta">
        ${voltLine}${capLine}${opLine}${item.country || ''}${cityLine}
        ${coverLine}${countriesLine}
        <br>${item.description}
        ${distLine ? '<br>' + distLine : ''}
        ${sourceLine}
      </div>
    `;

    // Click to fly to location on map (but not when clicking source link)
    if (item.lat && item.lng) {
      card.addEventListener('click', (e) => { if (!e.target.closest('a')) map.flyTo([item.lat, item.lng], 10); });
    } else if (item.landing_points && item.landing_points.length) {
      card.addEventListener('click', (e) => { if (!e.target.closest('a')) map.flyTo([item.landing_points[0].lat, item.landing_points[0].lng], 8); });
    }

    container.appendChild(card);
  });
}

document.getElementById('infra-country').addEventListener('change', loadInfrastructureTab);

// ─── Credential Management ─────────────────────────────────────
const CRED_KEYS = [
  { id: 'is24-key', storageKey: 'cred_is24_key' },
  { id: 'is24-secret', storageKey: 'cred_is24_secret' },
  { id: 'idealista-key', storageKey: 'cred_idealista_key' },
  { id: 'idealista-secret', storageKey: 'cred_idealista_secret' },
  { id: 'kadaster-key', storageKey: 'cred_kadaster_key' },
  { id: 'otodom-key', storageKey: 'cred_otodom_key' },
  { id: 'otodom-secret', storageKey: 'cred_otodom_secret' },
  { id: 'entsoe-token', storageKey: 'cred_entsoe_token' },
  { id: 'opencage-key', storageKey: 'cred_opencage_key' }
];

function loadCredentials() {
  CRED_KEYS.forEach(({ id, storageKey }) => {
    const el = document.getElementById(id);
    if (el) {
      const val = localStorage.getItem(storageKey) || '';
      el.value = val;
    }
  });
  updateCredStatusDots();
}

function saveCredentials() {
  CRED_KEYS.forEach(({ id, storageKey }) => {
    const el = document.getElementById(id);
    if (el) {
      if (el.value.trim()) localStorage.setItem(storageKey, el.value.trim());
      else localStorage.removeItem(storageKey);
    }
  });
  updateCredStatusDots();
  showCredMsg('Credentials saved to browser storage.', 'success');

  // Push credentials to backend
  const creds = {};
  CRED_KEYS.forEach(({ id, storageKey }) => {
    const val = localStorage.getItem(storageKey);
    if (val) creds[storageKey] = val;
  });
  fetch('/api/credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds)
  }).catch(() => {});
}

function clearCredentials() {
  CRED_KEYS.forEach(({ id, storageKey }) => {
    localStorage.removeItem(storageKey);
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  updateCredStatusDots();
  showCredMsg('All credentials cleared.', 'error');
}

function updateCredStatusDots() {
  const statusMap = {
    'is24': ['is24-key', 'is24-secret'],
    'idealista': ['idealista-key', 'idealista-secret'],
    'kadaster': ['kadaster-key'],
    'otodom': ['otodom-key', 'otodom-secret'],
    'entsoe': ['entsoe-token'],
    'opencage': ['opencage-key']
  };

  Object.entries(statusMap).forEach(([name, fields]) => {
    const dot = document.getElementById(`status-${name}`);
    if (!dot) return;
    const allFilled = fields.every(f => {
      const el = document.getElementById(f);
      return el && el.value.trim();
    });
    dot.className = `cred-status ${allFilled ? 'configured' : ''}`;
  });
}

async function testCredentials() {
  showCredMsg('Testing connections...', 'success');
  const results = [];

  // Test ENTSO-E
  const entsoeToken = document.getElementById('entsoe-token')?.value;
  if (entsoeToken) {
    try {
      const r = await fetch(`/api/test-credential?type=entsoe&token=${encodeURIComponent(entsoeToken)}`);
      results.push(r.ok ? '✅ ENTSO-E: connected' : '❌ ENTSO-E: failed');
    } catch { results.push('❌ ENTSO-E: network error'); }
  }

  // Test OpenCage
  const opencageKey = document.getElementById('opencage-key')?.value;
  if (opencageKey) {
    try {
      const r = await fetch(`https://api.opencagedata.com/geocode/v1/json?q=52.37,4.90&key=${opencageKey}&limit=1`);
      const j = await r.json();
      results.push(j.status?.code === 200 ? '✅ OpenCage: connected' : `❌ OpenCage: ${j.status?.message || 'failed'}`);
    } catch { results.push('❌ OpenCage: network error'); }
  }

  if (results.length === 0) results.push('No testable credentials configured');
  showCredMsg(results.join('<br>'), results.some(r => r.includes('❌')) ? 'error' : 'success');
}

function showCredMsg(msg, type) {
  const el = document.getElementById('cred-status-msg');
  el.innerHTML = msg;
  el.className = type;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 8000);
}

document.getElementById('save-credentials')?.addEventListener('click', saveCredentials);
document.getElementById('test-credentials')?.addEventListener('click', testCredentials);
document.getElementById('clear-credentials')?.addEventListener('click', clearCredentials);

// Load saved credentials on startup
loadCredentials();

// ─── Boot ───────────────────────────────────────────────────────
initMap();

// Load IX data and infrastructure layers, then build backbone links
Promise.all([
  loadIXLocations(),
  loadSubseaCables(),
  loadFiberBackbone()
]).then(() => {
  buildBackboneLinks();
}).catch(err => {
  console.error('Failed to load initial data:', err);
  document.getElementById('property-list').innerHTML =
    '<div style="color:#ff4444;padding:10px;">Failed to load data. Please refresh.</div>';
});
