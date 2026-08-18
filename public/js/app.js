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
// Universal, always-working link to inspect the exact plot on a map.
// Works for every property (curated, live, manual) — never 404s.
function mapUrl(p) {
  return p.map_url || `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
}
function mapLink(p, cls) {
  return `<a href="${mapUrl(p)}" target="_blank" rel="noopener" class="listing-link${cls ? ' ' + cls : ''}" onclick="event.stopPropagation()">📍 View on Map →</a>`;
}
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
    ${badge}${listing}
    <div style="margin-top:6px"><a href="${mapUrl(p)}" target="_blank" rel="noopener" style="color:#4da6ff;font-weight:600;font-size:0.85rem;text-decoration:none;">📍 View on Map →</a></div>
    ${scoreLine}
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
    ${badge}${listing}
    <div style="margin-top:6px"><a href="${mapUrl(p)}" target="_blank" rel="noopener" style="color:#aa44ff;font-weight:600;font-size:0.85rem;text-decoration:none;">📍 View on Map →</a></div>
    ${scoreLine}
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
          ${mapLink(p)}
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
            ${mapLink(p, 'comm')}
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
    if (btn.dataset.tab === 'ledger-tab') loadLedgerTab();
    if (btn.dataset.tab === 'admin-tab') loadIAM();
  });
});

// ─── Admin: IAM component ───────────────────────────────────────
// Sub-tab switching (IAM | Data Feeds)
document.querySelectorAll('.admin-subtab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-subtab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.subtab).classList.add('active');
    if (btn.dataset.subtab === 'manual-panel') loadManualEntries();
  });
});

let iamCustomers = [];

async function loadIAM() {
  try {
    const [summary, customers, users, invites] = await Promise.all([
      fetchJSON('/api/iam/summary'),
      fetchJSON('/api/iam/customers'),
      fetchJSON('/api/iam/users'),
      fetchJSON('/api/iam/invites')
    ]);
    iamCustomers = customers;
    renderIAMSummary(summary);
    renderCustomers(customers);
    renderUsers(users);
    renderInvites(invites);
    populateCustomerSelects(customers);
    const shareSel = document.getElementById('iam-share-customer').value;
    if (shareSel) loadShares(shareSel);
  } catch (e) {
    console.error('Failed to load IAM:', e);
  }
}

function renderIAMSummary(s) {
  document.getElementById('iam-summary').innerHTML = `
    <div class="iam-stat"><b>${s.customers}</b> customers</div>
    <div class="iam-stat"><b>${s.users}</b> users</div>
    <div class="iam-stat"><b>${s.shares}</b> shares</div>
    <div class="iam-stat ${s.mfa_pending ? 'warn' : ''}"><b>${s.mfa_pending}</b> MFA pending</div>
    <div class="iam-stat"><b>${s.pending_invites}</b> invites</div>`;
}

function renderCustomers(customers) {
  const el = document.getElementById('iam-customers-list');
  el.innerHTML = customers.length ? '' : '<div class="iam-empty">No customers yet.</div>';
  customers.forEach(c => {
    const row = document.createElement('div');
    row.className = 'iam-row';
    row.innerHTML = `
      <div><b>${escapeHtml(c.name)}</b>
        <span class="iam-sub">${c.user_count} users · ${c.share_count} shared plots</span></div>
      <button class="iam-del" title="Delete">✕</button>`;
    row.querySelector('.iam-del').addEventListener('click', async () => {
      if (!confirm(`Delete customer "${c.name}" and all its users/shares?`)) return;
      await fetch('/api/iam/customers/' + c.id, { method: 'DELETE' });
      loadIAM();
    });
    el.appendChild(row);
  });
}

function roleBadge(role) {
  const colors = { owner: '#00ff88', admin: '#4da6ff', customer: '#ffcc00' };
  const c = colors[role] || '#888';
  return `<span class="iam-role" style="color:${c};border-color:${c}">${role}</span>`;
}

function mfaBadge(u) {
  if (!u.mfa_required) return '<span class="iam-mfa off">MFA off</span>';
  return u.mfa_enrolled
    ? '<span class="iam-mfa ok">MFA ✓</span>'
    : '<span class="iam-mfa pending">MFA pending</span>';
}

function renderUsers(users) {
  const el = document.getElementById('iam-users-list');
  el.innerHTML = '';
  users.forEach(u => {
    const row = document.createElement('div');
    row.className = 'iam-row';
    const cust = u.customer_name ? ` · ${escapeHtml(u.customer_name)}` : '';
    const enrollBtn = (u.mfa_required && !u.mfa_enrolled)
      ? '<button class="iam-mini" data-act="enroll">Mark MFA enrolled</button>' : '';
    const gh = u.github
      ? `<a class="iam-gh" href="${escapeHtml(u.github.html_url)}" target="_blank" rel="noopener">
           <img class="iam-avatar" src="${escapeHtml(u.github.avatar_url)}" alt="" />@${escapeHtml(u.github.login)}</a>`
      : '';
    const primary = u.github ? `@${escapeHtml(u.github.login)}` : escapeHtml(u.email || '—');
    const contact = u.email ? ` · ${escapeHtml(u.email)}` : '';
    row.innerHTML = `
      <div>
        <div>${roleBadge(u.role)} ${gh || `<b>${primary}</b>`}</div>
        <span class="iam-sub">${escapeHtml(u.name || '')}${contact}${cust} · ${mfaBadge(u)}</span>
      </div>
      <div class="iam-actions">${enrollBtn}<button class="iam-del" title="Delete">✕</button></div>`;
    row.querySelector('.iam-del').addEventListener('click', async () => {
      const r = await fetch('/api/iam/users/' + u.id, { method: 'DELETE' });
      const j = await r.json();
      if (j.error) alert(j.error); else loadIAM();
    });
    const enroll = row.querySelector('[data-act="enroll"]');
    if (enroll) enroll.addEventListener('click', async () => {
      await fetch('/api/iam/users/' + u.id, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_enrolled: true })
      });
      loadIAM();
    });
    el.appendChild(row);
  });
}

function renderInvites(invites) {
  const el = document.getElementById('iam-invites-list');
  el.innerHTML = invites.length ? '' : '<div class="iam-empty">No pending invites.</div>';
  invites.forEach(i => {
    const row = document.createElement('div');
    row.className = 'iam-row';
    const cust = i.customer_name ? ` · ${escapeHtml(i.customer_name)}` : '';
    const gh = i.github
      ? `<a class="iam-gh" href="${escapeHtml(i.github.html_url)}" target="_blank" rel="noopener">
           <img class="iam-avatar" src="${escapeHtml(i.github.avatar_url)}" alt="" />@${escapeHtml(i.github.login)}</a>`
      : `<b>${escapeHtml(i.email || '—')}</b>`;
    row.innerHTML = `
      <div><div>${roleBadge(i.role)} ${gh}
        <span class="iam-status ${i.status}">${i.status}</span></div>
        <span class="iam-sub">expires ${new Date(i.expires_at).toLocaleDateString()}${cust}</span></div>
      <button class="iam-del" title="Revoke">✕</button>`;
    row.querySelector('.iam-del').addEventListener('click', async () => {
      await fetch('/api/iam/invites/' + i.id, { method: 'DELETE' });
      loadIAM();
    });
    el.appendChild(row);
  });
}

function populateCustomerSelects(customers) {
  const opts = '<option value="">Select customer…</option>' +
    customers.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  ['iam-user-customer', 'iam-invite-customer'].forEach(id => {
    const sel = document.getElementById(id);
    const prev = sel.value;
    sel.innerHTML = opts;
    sel.value = prev;
  });
  const shareSel = document.getElementById('iam-share-customer');
  const prevShare = shareSel.value;
  shareSel.innerHTML = opts;
  shareSel.value = prevShare;
}

// Toggle customer selector visibility when role = customer
function bindRoleToggle(roleId, custId) {
  const role = document.getElementById(roleId);
  const cust = document.getElementById(custId);
  const sync = () => cust.classList.toggle('hidden', role.value !== 'customer');
  role.addEventListener('change', sync);
  sync();
}
bindRoleToggle('iam-user-role', 'iam-user-customer');
bindRoleToggle('iam-invite-role', 'iam-invite-customer');

async function iamPost(url, body) {
  const r = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (j.error) { alert(j.error); return null; }
  return j;
}

document.getElementById('iam-add-customer')?.addEventListener('click', async () => {
  const name = document.getElementById('iam-customer-name').value.trim();
  if (!name) return;
  if (await iamPost('/api/iam/customers', { name })) {
    document.getElementById('iam-customer-name').value = '';
    loadIAM();
  }
});

document.getElementById('iam-add-user')?.addEventListener('click', async () => {
  const body = {
    github_login: document.getElementById('iam-user-github').value.trim() || null,
    email: document.getElementById('iam-user-email').value.trim(),
    name: document.getElementById('iam-user-name').value.trim(),
    role: document.getElementById('iam-user-role').value,
    customer_id: document.getElementById('iam-user-customer').value || null
  };
  if (await iamPost('/api/iam/users', body)) {
    document.getElementById('iam-user-github').value = '';
    document.getElementById('iam-user-email').value = '';
    document.getElementById('iam-user-name').value = '';
    loadIAM();
  }
});

document.getElementById('iam-add-invite')?.addEventListener('click', async () => {
  const body = {
    github_login: document.getElementById('iam-invite-github').value.trim() || null,
    email: document.getElementById('iam-invite-email').value.trim(),
    role: document.getElementById('iam-invite-role').value,
    customer_id: document.getElementById('iam-invite-customer').value || null
  };
  if (await iamPost('/api/iam/invites', body)) {
    document.getElementById('iam-invite-github').value = '';
    document.getElementById('iam-invite-email').value = '';
    loadIAM();
  }
});

// Property sharing
document.getElementById('iam-share-customer')?.addEventListener('change', e => {
  loadShares(e.target.value);
});

async function loadShares(customerId) {
  const el = document.getElementById('iam-shares-list');
  if (!customerId) { el.innerHTML = ''; return; }
  const [shares, ledgerData] = await Promise.all([
    fetchJSON('/api/iam/shares?customer_id=' + customerId),
    fetchJSON('/api/ledger')
  ]);
  const sharedKeys = new Set(shares.map(s => s.ledger_key));
  el.innerHTML = '';

  // Currently shared
  const sharedWrap = document.createElement('div');
  sharedWrap.innerHTML = `<div class="iam-sub" style="margin:8px 0 4px">Shared with this customer (${shares.length}):</div>`;
  el.appendChild(sharedWrap);
  if (!shares.length) {
    const none = document.createElement('div');
    none.className = 'iam-empty';
    none.textContent = 'Nothing shared yet.';
    el.appendChild(none);
  }
  shares.forEach(s => {
    const row = document.createElement('div');
    row.className = 'iam-row';
    row.innerHTML = `<div><b>${escapeHtml(s.ledger_name)}</b></div>
      <button class="iam-mini danger" title="Revoke">Revoke</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      await fetch('/api/iam/shares/' + s.id, { method: 'DELETE' });
      loadShares(customerId);
      loadIAM();
    });
    el.appendChild(row);
  });

  // Available ledger entries to share
  const avail = ledgerData.items.filter(i => !sharedKeys.has(i.key));
  const availWrap = document.createElement('div');
  availWrap.innerHTML = `<div class="iam-sub" style="margin:12px 0 4px">Add from ledger (${avail.length}):</div>`;
  el.appendChild(availWrap);
  if (!avail.length) {
    const none = document.createElement('div');
    none.className = 'iam-empty';
    none.textContent = ledgerData.items.length ? 'All ledger plots already shared.' : 'Ledger is empty — run a search first.';
    el.appendChild(none);
  }
  avail.slice(0, 50).forEach(i => {
    const row = document.createElement('div');
    row.className = 'iam-row';
    const tier = i.score ? `${i.score.tier} · ${i.score.total_score}/100` : '';
    row.innerHTML = `<div><b>${escapeHtml(i.name)}</b>
      <span class="iam-sub">${escapeHtml([i.city, i.country].filter(Boolean).join(', '))} · ${tier}</span></div>
      <button class="iam-mini" title="Share">＋ Share</button>`;
    row.querySelector('button').addEventListener('click', async () => {
      await iamPost('/api/iam/shares', { ledger_key: i.key, ledger_name: i.name, customer_id: customerId });
      loadShares(customerId);
      loadIAM();
    });
    el.appendChild(row);
  });
}

// ─── Opportunity Ledger Tab ─────────────────────────────────────
function ledgerFilters() {
  const country = document.getElementById('ledger-filter-country').value;
  const tier = document.getElementById('ledger-filter-tier').value;
  const forSale = document.getElementById('ledger-filter-forsale').checked;
  const params = new URLSearchParams();
  if (country) params.set('country', country);
  if (tier) params.set('tier', tier);
  if (forSale) params.set('for_sale', 'true');
  return params;
}

async function loadLedgerTab() {
  const params = ledgerFilters();
  let data;
  try {
    data = await fetchJSON('/api/ledger?' + params.toString());
  } catch (e) {
    console.error('Failed to load ledger:', e);
    return;
  }

  // Stats
  const s = data.stats || { total: 0, for_sale: 0, by_tier: {}, by_country: {} };
  const tierChips = Object.entries(s.by_tier || {})
    .map(([t, n]) => `<span class="ledger-chip">${t}: ${n}</span>`).join('');
  document.getElementById('ledger-stats').innerHTML = `
    <div class="ledger-stat-row">
      <span class="ledger-stat-big">${s.total}</span> interesting plots ·
      <span style="color:#ff6666">${s.for_sale} for sale</span>
    </div>
    <div class="ledger-chips">${tierChips}</div>`;

  // Update export link to respect filters
  document.getElementById('ledger-export').href = '/api/ledger/export.csv?' + params.toString();

  // List
  const list = document.getElementById('ledger-list');
  list.innerHTML = '';
  if (!data.items.length) {
    list.innerHTML = '<div style="color:#666;font-size:0.85rem;padding:12px;">No entries yet. Run a search to populate the ledger with interesting plots.</div>';
    return;
  }

  for (const item of data.items) {
    list.appendChild(ledgerCard(item));
  }
}

function ledgerCard(item) {
  const el = document.createElement('div');
  el.className = 'ledger-card';

  const badge = item.score ? tierBadge(item.score) : '';
  const saleTag = item.for_sale
    ? '<span class="popup-badge sale">FOR SALE</span>'
    : '';
  const power = item.estimated_power_mw
    ? `${item.estimated_power_mw} MW`
    : (item.estimated_power_kw ? `${item.estimated_power_kw} kW` : '—');
  const area = item.area_m2 ? `${item.area_m2.toLocaleString()} m²` : '—';

  const reasons = (item.reasons || []).length
    ? `<ul class="ledger-reasons">${item.reasons.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
    : '';

  const sources = (item.sources || []).length
    ? `<div class="ledger-sources"><strong>Sources:</strong> ${item.sources.map(src =>
        src.url
          ? `<a href="${src.url}" target="_blank" rel="noopener">${escapeHtml(src.label)}</a>`
          : `<span>${escapeHtml(src.label)}</span>`
      ).join(' · ')}</div>`
    : '';

  const seen = item.seen_count > 1 ? ` · seen ${item.seen_count}×` : '';

  el.innerHTML = `
    <div class="ledger-card-head">
      <div>
        <div class="ledger-card-title">${escapeHtml(item.name)} ${saleTag}</div>
        <div class="ledger-card-sub">${escapeHtml([item.city, item.country].filter(Boolean).join(', '))} · ${area} · ${power}${seen}</div>
      </div>
      <button class="ledger-locate" title="Zoom to site" data-lat="${item.lat}" data-lng="${item.lng}">📍</button>
    </div>
    <div style="margin:6px 0">${badge}</div>
    ${reasons}
    ${sources}`;

  el.querySelector('.ledger-locate').addEventListener('click', () => {
    map.setView([item.lat, item.lng], 13);
    document.querySelector('.tab-btn[data-tab="search-tab"]').click();
  });
  return el;
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Ledger controls
['ledger-filter-country', 'ledger-filter-tier', 'ledger-filter-forsale'].forEach(id => {
  const elm = document.getElementById(id);
  if (elm) elm.addEventListener('change', loadLedgerTab);
});
document.getElementById('ledger-refresh')?.addEventListener('click', loadLedgerTab);
document.getElementById('ledger-clear')?.addEventListener('click', async () => {
  if (!confirm('Clear the entire opportunity ledger? This cannot be undone.')) return;
  await fetch('/api/ledger', { method: 'DELETE' });
  loadLedgerTab();
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

// ─── Admin: Manual Entries (drop plots on the globe) ────────────
let manualLayer = null;
let manualPickMode = false;
let manualTempMarker = null;

function manualIcon() {
  // Distinctive pin so hand-placed plots stand out from automated sites.
  return L.divIcon({
    className: '',
    html: `<svg width="26" height="34" viewBox="0 0 26 34">
      <path d="M13 0C6 0 0.5 5.4 0.5 12.2 0.5 21 13 34 13 34s12.5-13 12.5-21.8C25.5 5.4 20 0 13 0z"
        fill="#ffd23f" stroke="#1b1b1b" stroke-width="1.5"/>
      <circle cx="13" cy="12" r="5" fill="#1b1b1b"/></svg>`,
    iconSize: [26, 34],
    iconAnchor: [13, 34],
    popupAnchor: [0, -30]
  });
}

function manualPopup(item) {
  const scoreLine = item.score
    ? `<div style="margin-top:6px">${tierBadge(item.score)}</div>` : '';
  const price = item.for_sale && item.price_eur
    ? `<br>💰 €${(item.price_eur / 1e6).toFixed(1)}M` : '';
  const listing = item.listing_url
    ? `<div style="margin-top:6px"><a href="${escapeHtml(item.listing_url)}" target="_blank" rel="noopener" style="color:#ffd23f;font-weight:600;text-decoration:none;">🔗 Source →</a></div>` : '';
  const notes = item.notes ? `<br>📝 ${escapeHtml(item.notes)}` : '';
  return `
    <div class="popup-title">📍 ${escapeHtml(item.name)}</div>
    <div class="popup-meta">
      ${escapeHtml([item.city, item.country].filter(Boolean).join(', '))}${price}${notes}<br>
      <span style="color:#ffd23f">Manual entry (admin)</span>
    </div>
    ${scoreLine}${listing}`;
}

async function loadManualEntries() {
  let items = [];
  try {
    const data = await fetchJSON('/api/ledger/manual');
    items = data.items || [];
  } catch (e) {
    console.error('Failed to load manual entries:', e);
  }

  // Render markers
  if (manualLayer) map.removeLayer(manualLayer);
  manualLayer = L.layerGroup();
  items.forEach(item => {
    L.marker([item.lat, item.lng], { icon: manualIcon() })
      .bindPopup(manualPopup(item))
      .addTo(manualLayer);
  });
  manualLayer.addTo(map);

  // Render admin list (only when the panel exists in the DOM)
  const list = document.getElementById('manual-list');
  if (!list) return;
  if (!items.length) {
    list.innerHTML = '<div class="iam-empty">No manual plots yet. Pick a location on the map above.</div>';
    return;
  }
  list.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'iam-row';
    const tier = item.score?.tier_label ? ` · ${escapeHtml(item.score.tier_label)} (${item.score.total_score}/100)` : '';
    const sale = item.for_sale ? ' · 💰 for sale' : '';
    row.innerHTML = `
      <div>
        <div><b>${escapeHtml(item.name)}</b></div>
        <span class="iam-sub">${escapeHtml([item.city, item.country].filter(Boolean).join(', ') || '—')}${tier}${sale}</span>
      </div>
      <div class="iam-actions">
        <button class="iam-mini" data-act="locate">📍 View</button>
        <button class="iam-del" title="Delete">✕</button>
      </div>`;
    row.querySelector('[data-act="locate"]').addEventListener('click', () => {
      map.setView([item.lat, item.lng], 13);
      document.querySelector('.tab-btn[data-tab="search-tab"]').click();
    });
    row.querySelector('.iam-del').addEventListener('click', async () => {
      if (!confirm(`Delete manual plot "${item.name}"?`)) return;
      await fetch('/api/ledger/' + encodeURIComponent(item.key), { method: 'DELETE' });
      loadManualEntries();
    });
    list.appendChild(row);
  });
}

// Place-mode: click the map to capture coordinates.
document.getElementById('manual-pick')?.addEventListener('click', () => {
  manualPickMode = !manualPickMode;
  const hint = document.getElementById('manual-pick-hint');
  const btn = document.getElementById('manual-pick');
  hint.classList.toggle('hidden', !manualPickMode);
  btn.textContent = manualPickMode ? '✖ Cancel picking' : '🎯 Pick location on map';
  document.getElementById('map').style.cursor = manualPickMode ? 'crosshair' : '';
  if (manualPickMode) document.querySelector('.tab-btn[data-tab="search-tab"]').click();
});

function setManualLatLng(lat, lng) {
  document.getElementById('manual-lat').value = lat.toFixed(6);
  document.getElementById('manual-lng').value = lng.toFixed(6);
  if (manualTempMarker) map.removeLayer(manualTempMarker);
  manualTempMarker = L.marker([lat, lng], { icon: manualIcon(), opacity: 0.7 }).addTo(map);
}

// Wire the map click and load existing manual markers.
function initManualEntries() {
  if (!map) return;
  map.on('click', (e) => {
    if (!manualPickMode) return;
    setManualLatLng(e.latlng.lat, e.latlng.lng);
    manualPickMode = false;
    document.getElementById('manual-pick-hint').classList.add('hidden');
    document.getElementById('manual-pick').textContent = '🎯 Pick location on map';
    document.getElementById('map').style.cursor = '';
    document.querySelector('.tab-btn[data-tab="admin-tab"]').click();
    document.querySelector('.admin-subtab-btn[data-subtab="manual-panel"]')?.click();
  });
  loadManualEntries();
}

document.getElementById('manual-add')?.addEventListener('click', async () => {
  const num = fid => {
    const v = document.getElementById(fid).value.trim();
    return v === '' ? null : Number(v);
  };
  const body = {
    lat: num('manual-lat'),
    lng: num('manual-lng'),
    name: document.getElementById('manual-name').value.trim(),
    country: document.getElementById('manual-country').value || null,
    city: document.getElementById('manual-city').value.trim() || null,
    address: document.getElementById('manual-address').value.trim() || null,
    area_m2: num('manual-area'),
    estimated_power_mw: num('manual-power'),
    sector: document.getElementById('manual-sector').value.trim() || null,
    listing_url: document.getElementById('manual-listing').value.trim() || null,
    price_eur: num('manual-price'),
    for_sale: document.getElementById('manual-forsale').checked,
    notes: document.getElementById('manual-notes').value.trim() || null
  };
  if (body.lat == null || body.lng == null) { alert('Set a location first (pick on map or enter lat/lng).'); return; }
  if (!body.name) { alert('A site name is required.'); return; }

  const r = await fetch('/api/ledger/manual', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if (!r.ok || j.error) { alert(j.error || 'Failed to add manual entry.'); return; }

  ['manual-lat', 'manual-lng', 'manual-name', 'manual-city', 'manual-address',
   'manual-area', 'manual-power', 'manual-sector', 'manual-listing', 'manual-price', 'manual-notes']
    .forEach(fid => { document.getElementById(fid).value = ''; });
  document.getElementById('manual-forsale').checked = false;
  if (manualTempMarker) { map.removeLayer(manualTempMarker); manualTempMarker = null; }

  loadManualEntries();
  const t = j.entry?.score?.tier_label ? ` (${j.entry.score.tier_label} — ${j.entry.score.total_score}/100)` : '';
  alert(`Added "${j.entry?.name || body.name}" to the globe${t}.`);
});

initManualEntries();
