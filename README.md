# DC Opportunities v2

> 🏢 Find commercial real estate near Internet Exchange points suitable for data center development across Europe.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![License](https://img.shields.io/badge/License-MIT-blue)

## Overview

DC Opportunities v2 is an interactive map-based tool that helps identify potential data center sites near Internet Exchange (IX) points in **Netherlands**, **Germany**, **Poland**, and **Spain**.

### Features

- 🗺️ **Interactive Map** — Leaflet.js with dark CARTO tiles
- 🌐 **IX Locations** — Live data from PeeringDB
- 🏭 **Property Listings** — Commercial/industrial sites ≥5,000 m² with estimated power ≥10 MW
- 🔴 **For Sale** — Red markers for properties on the market
- 🟠 **Not For Sale** — Orange markers for occupied high-power sites
- 🔵 **Existing Datacenters** — Live from OpenStreetMap/Overpass API
- 📏 **Adjustable Radius** — 10–100 km search radius around IX points
- 📋 **Data Sources** — Documented real estate portals, cadastral data, and grid operators per country

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
│       └── properties.js     Sample property provider
└── data/
    ├── properties.json        Curated sample properties
    └── sources.json           Data sources per country
```

## Data Sources

| Category | Source | Coverage |
|----------|--------|----------|
| IX Locations | [PeeringDB](https://www.peeringdb.com) | Live API |
| Datacenters | [OpenStreetMap](https://www.openstreetmap.org) via Overpass | Live API |
| Properties | Sample dataset | Illustrative |

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

## License

MIT
