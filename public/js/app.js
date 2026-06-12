// ─── State ───────────────────────────────────────────────────────
let map, ixData = [], searchCircle;
const layers = { properties: null, datacenters: null, ix: null, subseaCables: null, landingPoints: null, fiberBackbone: null };

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
  datacenter: () => makeCircleIcon('#4da6ff', 8),
  ix:         () => makeCircleIcon('#33cc66', 13)
};

// ─── Popup Builders ─────────────────────────────────────────────
function propertyPopup(p) {
  const badge = p.for_sale
    ? '<span class="popup-badge sale">FOR SALE</span>'
    : '<span class="popup-badge not-sale">NOT FOR SALE</span>';
  const price = p.for_sale && p.price_eur
    ? `<br>💰 €${(p.price_eur / 1e6).toFixed(1)}M`
    : '';
  return `
    <div class="popup-title">${p.name}</div>
    <div class="popup-meta">
      📍 ${p.city}, ${p.country}<br>
      📐 ${p.area_m2.toLocaleString()} m²<br>
      ⚡ ~${p.estimated_power_mw} MW (est.)${price}<br>
      🏭 ${p.sector}<br>
      📏 ${p.distance_km} km from IX
    </div>
    ${badge}
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
const radiusSlider = document.getElementById('radius-slider');
const radiusValue = document.getElementById('radius-value');
const searchBtn = document.getElementById('search-btn');
const loading = document.getElementById('loading');
const resultsSummary = document.getElementById('results-summary');
const propertyList = document.getElementById('property-list');

countrySelect.addEventListener('change', () => {
  const country = countrySelect.value;
  ixSelect.innerHTML = '<option value="">Select an IX…</option>';
  if (!country) { ixSelect.disabled = true; searchBtn.disabled = true; return; }

  const countryIXs = ixData.filter(ix => ix.country === country);
  countryIXs.forEach(ix => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ id: ix.id, lat: ix.lat, lng: ix.lng, name: ix.name });
    opt.textContent = `${ix.name} — ${ix.city}`;
    ixSelect.appendChild(opt);
  });
  ixSelect.disabled = false;
});

ixSelect.addEventListener('change', () => {
  searchBtn.disabled = !ixSelect.value;
});

radiusSlider.addEventListener('input', () => {
  radiusValue.textContent = radiusSlider.value;
});

searchBtn.addEventListener('click', runSearch);

// ─── Search ─────────────────────────────────────────────────────
async function runSearch() {
  const ixInfo = JSON.parse(ixSelect.value);
  const radiusKm = parseInt(radiusSlider.value);
  const radiusM = radiusKm * 1000;

  // UI state
  loading.classList.remove('hidden');
  resultsSummary.classList.add('hidden');
  propertyList.innerHTML = '';
  searchBtn.disabled = true;

  // Clear old layers
  Object.values(layers).forEach(lg => { if (lg) map.removeLayer(lg); });
  if (searchCircle) map.removeLayer(searchCircle);

  try {
    // Fetch data in parallel
    const [propertiesResp, datacentersResp] = await Promise.all([
      fetchJSON(`/api/properties?lat=${ixInfo.lat}&lng=${ixInfo.lng}&radius=${radiusM}`),
      fetchJSON(`/api/datacenters?lat=${ixInfo.lat}&lng=${ixInfo.lng}&radius=${radiusM}`)
    ]);

    // Draw search radius
    searchCircle = L.circle([ixInfo.lat, ixInfo.lng], {
      radius: radiusM,
      color: '#e94560',
      fillColor: '#e94560',
      fillOpacity: 0.05,
      dashArray: '8 6',
      weight: 2
    }).addTo(map);

    // IX marker
    layers.ix = L.layerGroup();
    L.marker([ixInfo.lat, ixInfo.lng], { icon: ICONS.ix() })
      .bindPopup(ixPopup(ixInfo))
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
    document.getElementById('stat-datacenters').textContent = datacentersResp.length;
    resultsSummary.classList.remove('hidden');

    // Property cards
    propertiesResp
      .sort((a, b) => a.distance_km - b.distance_km)
      .forEach(p => {
        const card = document.createElement('div');
        card.className = `property-card ${p.for_sale ? 'for-sale' : 'not-for-sale'}`;
        card.innerHTML = `
          <h4>${p.name}</h4>
          <div class="meta">
            <span>📍 ${p.city}</span>
            <span>📐 ${p.area_m2.toLocaleString()} m²</span>
            <span>⚡ ~${p.estimated_power_mw} MW</span>
            <span>📏 ${p.distance_km} km</span>
            ${p.for_sale && p.price_eur ? `<span>💰 €${(p.price_eur/1e6).toFixed(1)}M</span>` : ''}
          </div>
        `;
        card.addEventListener('click', () => {
          map.setView([p.lat, p.lng], 13);
        });
        propertyList.appendChild(card);
      });

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
async function loadSubseaCables() {
  try {
    const [cablesData, landingData] = await Promise.all([
      fetchJSON('/api/subsea-cables'),
      fetchJSON('/api/landing-points')
    ]);

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
    landingData.forEach(lp => {
      L.marker([lp.lat, lp.lng], { icon: landingIcon })
        .bindPopup(`<div class="popup-title">${lp.name}</div><div class="popup-meta">📍 Cable Landing Point</div><span class="popup-badge dc">LANDING STATION</span>`)
        .addTo(layers.landingPoints);
    });
    layers.landingPoints.addTo(map);

    console.log(`Loaded ${cablesData.length} subsea cables, ${landingData.length} landing points`);
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
  } else {
    if (layers.subseaCables) map.removeLayer(layers.subseaCables);
    if (layers.landingPoints) map.removeLayer(layers.landingPoints);
  }
});

document.getElementById('toggle-fiber').addEventListener('change', (e) => {
  if (e.target.checked) {
    if (layers.fiberBackbone) layers.fiberBackbone.addTo(map);
  } else {
    if (layers.fiberBackbone) map.removeLayer(layers.fiberBackbone);
  }
});

// ─── Boot ───────────────────────────────────────────────────────
initMap();

// Load IX data and infrastructure layers in parallel
Promise.all([
  loadIXLocations(),
  loadSubseaCables(),
  loadFiberBackbone()
]).catch(err => {
  console.error('Failed to load initial data:', err);
  document.getElementById('property-list').innerHTML =
    '<div style="color:#ff4444;padding:10px;">Failed to load data. Please refresh.</div>';
});
