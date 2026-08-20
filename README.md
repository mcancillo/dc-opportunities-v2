# DC Opportunities v2

> 🏢 Find commercial real estate near Internet Exchange points suitable for data center development across Europe.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/License-MIT-blue)

## Overview

DC Opportunities v2 is an interactive map-based tool that helps identify potential data center sites near Internet Exchange (IX) points in **Netherlands**, **Germany**, **Poland**, and **Spain**.

It ships as **two login-gated portals** — a public **customer** portal and a restricted **admin** portal — deployed to Azure behind Front Door with a zero-trust WAF. See [Security & Access Control](#-security--access-control).

### Features

- 🗺️ **Interactive Map** — Leaflet.js with dark CARTO tiles
- 🌐 **IX Locations** — Live data from PeeringDB
- 🏭 **Property Listings** — Commercial/industrial sites ≥5,000 m² with estimated power ≥10 MW
- 🔴 **For Sale** — Red markers for properties on the market
- 🟠 **Not For Sale** — Orange markers for occupied high-power sites
- 🔵 **Existing Datacenters** — Live from OpenStreetMap/Overpass API, enriched with a curated **DataCenterMap** extract (current **and** upcoming sites)
- 📒 **Opportunity Ledger** — Every interesting plot is auto-recorded with **sources** and **why it's interesting** (score-driven reasons), deduplicated and exportable to CSV
- 📏 **Adjustable Radius** — 10–100 km search radius around IX points (results accumulate — they never disappear when you widen the radius)
- 📋 **Data Sources** — Documented real estate portals, cadastral data, and grid operators per country
- 🔐 **Authentication** — App-level login on both portals, per-user password management, and an enforced password policy
- 🛡️ **Zero-trust access control** — Azure Front Door + WAF, ISP-scoped allowlists (KPN / Ziggo / Odido), and an admin portal locked to explicit IPs — all managed via GitOps config files
- 🧾 **Connection logging** — Classify inbound Front Door connections by ISP and export to CSV

## Quick Start

```bash
# Clone
git clone https://github.com/mcancillo/dc-opportunities-v2.git
cd dc-opportunities-v2

# Install
npm install

# Run
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Select a **country** (NL, DE, PL, ES)
2. Pick an **Internet Exchange** from the dropdown
3. Adjust the **search radius** (default 50 km)
4. Click **Search Opportunities**
5. Click property cards in the sidebar to zoom to that location

## Architecture

```
├── server.js                  Express server
├── public/
│   ├── index.html             Single-page app
│   ├── css/style.css          Dark theme UI
│   └── js/app.js              Map + UI logic
├── src/
│   ├── routes/api.js          REST API endpoints
│   └── services/
│       ├── peeringdb.js       PeeringDB IX & facility data (cached)
│       ├── overpass.js        OSM datacenter queries (cached)
│       ├── scoring.js         8-factor DC suitability score
│       ├── ledger.js          Opportunity ledger (interesting plots + sources)
│       └── properties.js     Sample property provider
└── data/
    ├── properties.json        Curated sample properties
    ├── ledger.json            Auto-generated ledger (gitignored)
    └── sources.json           Data sources per country
```

## 📒 Opportunity Ledger

Every time you run a search, plots that are **genuinely interesting** are automatically
appended to a persistent ledger (`data/ledger.json`), deduplicated by site.

A plot qualifies when it is **Prime/High tier**, **currently for sale**, or scores **≥ 60/100**.

Each ledger entry captures:

- **Why it's interesting** — human-readable reasons derived from the score
  (e.g. *"Excellent connectivity: 18km to AMS-IX", "High power potential: ~400 MW", "For sale — immediately actionable"*).
- **Sources** — the data provider, listing/registry URL, nearest IX (PeeringDB),
  grid/renewables evidence, and DC-ecosystem evidence (OSM/Overpass).
- **Provenance** — `first_seen`, `last_seen`, and `seen_count`.

Browse it in the **📒 Ledger** tab, filter by country/tier/for-sale, and **export to CSV**.

### Ledger API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/ledger` | List entries + stats. Filters: `country`, `tier`, `for_sale`, `min_score` |
| GET | `/api/ledger/export.csv` | Download the ledger as CSV (same filters) |
| DELETE | `/api/ledger/:key` | Remove one entry |
| DELETE | `/api/ledger` | Clear the ledger |

## Data Sources

| Category | Source | Coverage |
|----------|--------|----------|
| IX Locations | [PeeringDB](https://www.peeringdb.com) | Live API |
| Datacenters | [OpenStreetMap](https://www.openstreetmap.org) via Overpass + curated [DataCenterMap](https://www.datacentermap.com) extract | Live API + curated |
| Backbone landlines | [GÉANT Connectivity Map](https://map.geant.org) (`/maps/nodes_and_edges`) | Live feed + snapshot |
| Fiber / subsea | OpenStreetMap (`telecom`/`communication` lines, submarine cables) | Live API |
| Properties | Sample dataset + live OSM/PDOK/Cadastre | Illustrative + live |

### Real Estate Portals (for integration)

| Country | Portals |
|---------|---------|
| 🇳🇱 NL | Funda in Business, NVM Business, Cushman & Wakefield, CBRE |
| 🇩🇪 DE | ImmobilienScout24, Immowelt, JLL Germany, Colliers |
| 🇵🇱 PL | Otodom, Gratka, JLL Poland, Savills |
| 🇪🇸 ES | Idealista, Fotocasa, CBRE Spain, Savills |

### Energy Grid Operators

| Country | TSO |
|---------|-----|
| 🇳🇱 NL | TenneT — [Grid Capacity Map](https://capaciteitskaart.netbeheernederland.nl) |
| 🇩🇪 DE | TenneT, 50Hertz, Amprion, TransnetBW |
| 🇵🇱 PL | PSE (Polskie Sieci Elektroenergetyczne) |
| 🇪🇸 ES | Red Eléctrica de España (REE) |

### Cadastral / Geodata

| Country | Source |
|---------|--------|
| 🇳🇱 NL | [PDOK / Kadaster](https://www.pdok.nl) |
| 🇩🇪 DE | [Geoportal.de](https://www.geoportal.de) |
| 🇵🇱 PL | [geoportal.gov.pl](https://www.geoportal.gov.pl) |
| 🇪🇸 ES | [Sede Electrónica del Catastro](https://www.sedecatastro.gob.es) |

## ⚠️ Data Notice

- **Property listings** are illustrative samples to demonstrate the tool's capabilities. Integrate real APIs for production use.
- **Datacenter locations** from OpenStreetMap may be incomplete — OSM tagging varies by region.
- **Power estimates** are approximations based on sector and building size, not measured consumption.
- **IX data** from PeeringDB is live but cached for 24 hours.

## 📱 Mobile App (iOS + Android)

An invite-only **Expo (React Native)** app provides a mobile front end with the
same map layers and **offline caching** of maps and data (data centers, subsea
cables, landing points, fiber, real estate). It reuses the existing Microsoft
Entra ID security framework (OAuth2 PKCE, invite-only, MFA).

- Source & dev guide: [`mobile/README.md`](mobile/README.md)
- Full documentation, build/submit steps & manual checklist: [`docs/mobile-app.md`](docs/mobile-app.md)

## 🤖 Daily Optimizer Agent

A scheduled agent ([`.github/workflows/data-source-optimizer.yml`](.github/workflows/data-source-optimizer.yml))
runs **once every 24 hours** (capped at 2 hours/day) to keep the tool improving:
it ingests the Cowork **DC Audio Briefing**, discovers new data sources & angles
for datacenter plots across **NL, BE, DE, PL, ES**, and opens a PR with the
enhancements. Run locally with `npm run optimize`.

- Documentation & cost overview: [`docs/optimizer-agent.md`](docs/optimizer-agent.md)

## License

MIT
