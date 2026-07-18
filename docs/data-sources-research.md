<!--
  Data & News Sources Research — DC Opportunities v2
  Generated research deliverable. Sources compiled for NL, DE, PL, ES.
  Priority sources and ready-to-use API endpoints are at the bottom.
-->
# Additional Data Sources for DC Opportunities Tool
## NL · DE · PL · ES — Programmatic & Intelligence Sources

---

## 1. 🏢 Real Estate / Land Listings

### 1.1 Country-Specific Portals

| # | Name | URL | Data | Countries | Access | Cost | DC Relevance |
|---|------|-----|------|-----------|--------|------|--------------|
| 1 | **Funda in Business** | `https://www.fundainbusiness.nl` | Industrial/commercial plots, warehouses, offices ≥500 m² | 🇳🇱 NL | **Unofficial/undocumented API** via `https://partnerapi.funda.nl/feeds/Aanbod.svc` (partner program, request access) | Free to browse / paid partner feed | NL's largest commercial RE portal — industrial estate listings in Amsterdam-Zuidoost, Schiphol-Rijk, Rotterdam Botlek near AMS-IX, NL-ix nodes |
| 2 | **NVM Business** | `https://www.nvmbusiness.nl` | Broker-listed industrial/logistics sites | 🇳🇱 NL | Manual / scrape | Free | NWWI-certified valuations; raw land parcel data matches PDOK |
| 3 | **ImmobilienScout24** | `https://api.immobilienscout24.de` | Commercial & industrial property listings — **Import/Export REST API** confirmed active (partner access required); publishes/updates listings; endpoint pattern: `https://rest.immobilienscout24.de/restapi/api/search/v1.0/search/region?realestatetype=INDUSTRIALBUILDING` | 🇩🇪 DE | **REST API** (OAuth2, must register) | Free API key / paid data tiers | DE's dominant platform; industrial/logistics sites near DE-CIX Frankfurt, BCIX Berlin, ECIX Hamburg |
| 4 | **Immowelt / Immonet** | `https://www.immowelt.de/gewerbe/` | Commercial RE, industrial land | 🇩🇪 DE | Web scraping (no public API) | Free | Secondary to IS24 but covers additional DE broker listings |
| 5 | **Otodom** | `https://www.otodom.pl` | Commercial/industrial plots (działki przemysłowe), warehouses | 🇵🇱 PL | No public API; structured JSON embedded in HTML (Next.js `__NEXT_DATA__`) — scrapeable | Free | PL's leading portal; covers Warsaw (PLIX/THINX), Katowice, Wrocław industrial zones |
| 6 | **Gratka Nieruchomości** | `https://gratka.pl/nieruchomosci/dzialki` | Industrial & commercial land plots | 🇵🇱 PL | Scrape | Free | Complements Otodom for PL industrial coverage |
| 7 | **Idealista** | `https://developers.idealista.com/access-request` | Residential + **commercial** (industrial/logistics) properties — **REST API confirmed**, returns JSON, request API key with project description | 🇪🇸 ES (+ 🇮🇹 🇵🇹) | **REST API** (API key, request-based, free for low volume) | Free tier / paid | ES largest portal; industrial parks near ESPANIX Madrid, CATNIX Barcelona |
| 8 | **Fotocasa Pro** | `https://pro.fotocasa.es` | Commercial land and industrial sites | 🇪🇸 ES | No documented public API; manual | Free to browse | Secondary ES portal; spot-checks vs. Idealista |

### 1.2 Pan-European / Broker Research Portals

| # | Name | URL | Data | Countries | Access | Cost | DC Relevance |
|---|------|-----|------|-----------|--------|------|--------------|
| 9 | **CoStar / LoopNet Europe** | `https://www.costar.com` | Comprehensive commercial RE database — industrial, land, data center assets; CoStar API (`/api/1.0/property/search`) available to subscribers | NL, DE, PL, ES + all EU | **REST API** (subscription required) | **Paid** (€€€, institutional) | The authoritative global CRE database; includes "data center" asset class filter, power availability tags, floor area ratios — gold standard for site comps |
| 10 | **Realla** | `https://www.realla.co.uk` | UK + expanding EU commercial/industrial listings | 🇬🇧 UK + partial EU | No documented API; web | Free | CoStar-owned UK portal; limited EU coverage but useful for pan-EU patterns |
| 11 | **CBRE Research** | `https://www.cbre.com/insights/reports` | Market reports: European Data Center Market, industrial rents, availability rates per city | NL, DE, PL, ES | PDF downloads + **CBRE Data Portal** (subscription) | Free reports / paid raw data | Publishes quarterly European DC market reports with vacancy rates, power availability, absorption — critical for market context |
| 12 | **JLL Research** | `https://www.jll.com/en/research` | European Industrial & Logistics reports, Data Center outlook | NL, DE, PL, ES | PDF / manual | Free reports | H1/H2 European DC market snapshots; named submarkets with available power |
| 13 | **Colliers** | `https://www.colliers.com/en-gb/research` | Industrial site reports, DC market sizing | NL, DE, PL, ES | PDF / manual | Free | Useful for DE and PL industrial park inventories |
| 14 | **Savills** | `https://www.savills.com/insight-and-opinion/research.aspx` | European DC investment, industrial land pricing | NL, DE, PL, ES | PDF / manual | Free | "Savills Spotlight: European Data Centres" series — annual benchmarks |
| 15 | **Cushman & Wakefield** | `https://www.cushmanwakefield.com/en/insights` | Global DC Market Comparison reports; industrial land availability | NL, DE, PL, ES | PDF / manual | Free | C&W publishes European DC "powered shell" availability maps |

> **API Status Summary:** Of the country portals, only **ImmobilienScout24** and **Idealista** have documented REST APIs. Funda has a partner API requiring registration. Otodom/Gratka have no public API but expose structured `__NEXT_DATA__` JSON. CoStar/CBRE/JLL/Savills/Colliers all require institutional subscriptions for raw data.

---

## 2. 🗺️ Cadastral / Land Registry / Zoning

### 2.1 Netherlands (beyond PDOK BAG)

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 16 | **PDOK — BRK (Kadaster Parcel Registry)** | `https://api.pdok.nl/bzk/locatieserver/search/v3_1/` | Parcel boundaries, owner type (public/private/BV/NV), surface area, address binding | 🇳🇱 NL | **WFS + REST API** (no key required) | Free (open data) | Identify large contiguous privately-held parcels in industrial zones ≥10 ha adjacent to IX nodes; filter on `functieomschrijving=bedrijventerrein` |
| 17 | **PDOK — BGT (Large-Scale Topography)** | `https://api.pdok.nl/lv/bgt/download/v1_0/full/predefined/` | Ground-level industrial surface classification, impervious surface, railway sidings | 🇳🇱 NL | **WFS + bulk download** | Free | Identify paved industrial parcels (suitable for DC slab) vs. vegetated land |
| 18 | **Ruimtelijke Plannen (Spatial Plans WFS)** | `https://afnemers.ruimtelijkeplannen.nl/afnemers/services?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities` | Zoning plans (bestemmingsplannen) — industrial (Bedrijf), mixed-use, spatial policy at municipality level; also via WMS | 🇳🇱 NL | **OGC WFS** (no key) | Free | Query allowed land-use by parcel: filter for `Bedrijf` or `Gemengd` zoning to pre-screen permittable sites |
| 19 | **Omgevingsloket (Building Permits)** | `https://omgevingswet.overheid.nl/home` | New building permit applications under the Omgevingswet (2024+); search by location/address | 🇳🇱 NL | Web portal + **REST API** via DSO-LV (Digitaal Stelsel Omgevingswet) `https://dso-lv.overheid.nl/lvbb/v1/documenten` | Free | Track permit applications for large industrial or utility buildings by polygon search — early signal of competitor DC projects |

### 2.2 Germany

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 20 | **Geoportal.de (BKG Federal Geodata)** | `https://sgx.geodatenzentrum.de/web_bkg_wms/` | ALKIS topographic base, federal land-use WMS/WFS, administrative boundaries | 🇩🇪 DE | **OGC WMS/WFS** (no key for basic layers) | Free | National topographic base aligned with state-level ALKIS |
| 21 | **State ALKIS / NAS APIs** (per Bundesland) | Varies by state, e.g. Bayern: `https://geodaten.bayern.de/opengeodata/` NRW: `https://www.wfs.nrw.de/geobasis/wfs_nw_alkis_vereinfacht?` | Parcel cadastre (Flurstücke), building footprints, land-use classification | 🇩🇪 DE (per state) | **WFS** (no key, NRW/Bayern/Brandenburg confirmed open) | Free | NRW and Brandenburg are key DC states (near DE-CIX Frankfurt, BCIX Berlin) — parcel-level industrial land identification |
| 22 | **Planungsportal NRW / BauGB Bauleitplanung** | `https://www.tim-online.nrw.de/tim-online2/` | FNP (Flächennutzungsplan) and B-Plan layers — planned industrial areas (GI/GE zones) | 🇩🇪 DE (NRW) | **WMS/WFS** | Free | Identify designated GI (Gewerbegebiet Industrie) zones ahead of development — good for greenfield DC pipeline |
| 23 | **MaStR (Marktstammdatenregister)** | `https://www.marktstammdatenregister.de/MaStR` + bulk export: `https://www.bundesnetzagentur.de/DE/Sachgebiete/ElektrizitaetundGas/Unternehmen_Institutionen/DatenaustauschundMonitoring/MaStR/MaStR_node.html` | All registered energy-generation/storage units in DE: substations, solar, wind, storage, with GPS coordinates and capacity | 🇩🇪 DE | **Bulk XML/CSV download** (free, daily refreshed); open-mastr.de provides cleaned Python/SQL exports | Free | Locate substations and HV connection points near candidate sites; identify decommissioning plants (freed grid capacity) |

### 2.3 Poland

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 24 | **GUGiK ULDK (Parcel Locator Service)** | `https://uldk.gugik.gov.pl/?request=GetParcelById&id={PARCEL_ID}` | Returns WKB geometry for any Polish cadastral parcel by ID; also `GetParcelByXY` | 🇵🇱 PL | **REST API** (no key, confirmed working) | Free | Programmatic parcel geometry lookup — input parcel IDs from EGIB to get exact polygon for GIS analysis |
| 25 | **BDOT10k (Topographic Objects Database)** | `https://mapy.geoportal.gov.pl/wss/service/WMTS/guest/wmts/BDOT10k` + WFS at `https://mapy.geoportal.gov.pl/wss/service/WFS/guest/wfs/` | 1:10,000 topographic features: industrial buildings, roads, railways, power lines, watercourses | 🇵🇱 PL | **OGC WFS/WMTS** | Free | Identify industrial building clusters and infrastructure corridors near IX points (Warsaw) |
| 26 | **MPZP (Local Zoning Plans portal)** | `https://www.geoportal.gov.pl/pl/dane/inspire/` | Municipal spatial plans; INSPIRE Land Use theme; zoning designations (P — produkcja/przemysł, U — usługi) | 🇵🇱 PL | **WMS/WFS** (via geoportal.gov.pl INSPIRE feeds) | Free | Filter allowed building function by parcel — PL planning permission for DC-class industrial use |

### 2.4 Spain

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 27 | **IGN INSPIRE Land Use WFS** | `https://www.ign.es/wms-inspire/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities` | SIOSE land-use classification — urban industrial, logistics, mixed urban areas | 🇪🇸 ES | **OGC WMS/WFS** | Free | National land-use polygons for site pre-screening; SIOSE layer `LC_IndustrialArea` |
| 28 | **Catastro WFS / OVC API** | `https://ovc.catastro.meh.es/ovcservweb/OVCSWDbis/OVCCallejero.asmx` | Parcel reference, surface, use, construction year — already partially integrated, but also `https://www1.sedecatastro.gob.es/OVCFrames.aspx?SRC=mnfSearchIBI` for bulk INSPIRE downloads | 🇪🇸 ES | **SOAP/REST** (no key) | Free | Full parcel polygon + use code (PI = industrial use) — cross-reference with Idealista listings |
| 29 | **Planes de Ordenación Urbanística (POUM/PGOU viewer)** | `https://ide.cat/geonetwork/srv/cat/catalog.search` (Catalonia) + IDEE national: `https://www.idee.es/csw-inspire-idee/srv/spa/csw` | Municipal urban planning — industrial/logistics zoning polygons per municipality | 🇪🇸 ES (varies by CCAA) | **CSW metadata + WFS** | Free | Identify officially zoned industrial land (Suelo Industrial) adjacent to ESPANIX/CATNIX IX nodes |

### 2.5 Pan-European (INSPIRE)

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 30 | **EU INSPIRE Geoportal (data.europa.eu)** | `https://data.europa.eu/en/datasets?categories=REGI&country=NL,DE,PL,ES` | Harmonised EU INSPIRE datasets: Cadastral Parcels (CP), Land Use (LU), Utility Networks (US) across all 4 target countries | EU-wide | **OGC WMS/WFS/CSW** + bulk downloads | Free | Single discovery endpoint for INSPIRE-compliant national datasets — use CSW query to find WFS endpoints per country and theme |
| 31 | **Eurostat GISCO / NUTS boundaries** | `https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2021_4326.geojson` | Statistical boundaries, urban/rural classification, LAU municipalities | EU-wide | **GeoJSON REST API** (no key) | Free | Overlay IX search radius with NUTS-3 industrial areas to identify priority municipalities |

---

## 3. ⚡ Power Grid & Energy

### 3.1 Netherlands

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 32 | **Netbeheer NL Capaciteitskaart** | `https://www.netbeheernederland.nl/netcapaciteit-en-flexibiliteit/capaciteitskaart` + underlying tile data at `https://data.partnersinenergie.nl/capaciteitskaart/totaal/afname` | Grid capacity by municipality/postcode — congestion (rood = waiting list), available capacity (MW) for new large offtakes | 🇳🇱 NL | **Interactive map** (JSON tile API, partially scrapeable); semi-annual PDF reports | Free | **Critical**: AMS area is severely congested; shows exact areas with ≥10 MW available capacity for new connections — primary filter before any other screening |
| 33 | **TenneT NL Grid Data** | `https://www.tennet.eu` (data portal under *Data Services* section) + ENTSO-E | HV grid topology, substations ≥150 kV, planned reinforcements | 🇳🇱 NL | ENTSO-E transparency API + manual reports | Free | Identify planned 380 kV substation expansions near IX locations (Diemen, Breukelen, etc.) |

### 3.2 Germany

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 34 | **50Hertz Grid Data Portal** | `https://www.50hertz.com/en/Grid/GridData` | Transmission grid map, overhead line monitoring, substations; annual grid development plans | 🇩🇪 DE (East, incl. Berlin) | Manual / PDF download | Free | Locates 50Hertz EHV substations in Berlin/Brandenburg corridor near BCIX, ECIX |
| 35 | **Amprion Transparency** | `https://www.amprion.net` → Netz → Netzdaten | Grid map, congestion management data; substations | 🇩🇪 DE (West/Central, incl. Frankfurt, Düsseldorf) | Manual PDF + ENTSO-E API | Free | Frankfurt Rhine-Main corridor (DE-CIX) substations; near-capacity signals |
| 36 | **TransnetBW** | `https://www.transnetbw.de/en` → Grid Development | Grid capacity, substation data, redispatch map | 🇩🇪 DE (South, incl. Stuttgart, Munich) | Manual / ENTSO-E | Free | Stuttgart/Munich corridor for DE DC expansion |
| 37 | **MaStR Substations Export** | `https://www.bundesnetzagentur.de` (MaStR bulk download link above) | All grid connection points (Netzverknüpfungspunkte) with voltage level, location, capacity — extractable for DE substations | 🇩🇪 DE | **CSV/XML bulk download** | Free | Most directly useful: enumerate all HV substations ≥110 kV by GPS and cross-reference with site radius |
| 38 | **Netzausbau.de (Grid Expansion Monitor)** | `https://www.netzausbau.de/` | Federal grid expansion projects with status, locations, planned completion dates | 🇩🇪 DE | Manual / map | Free | Identify planned HV upgrades in DC hotspots — forward-looking capacity signal |

### 3.3 Poland

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 39 | **PSE (Polskie Sieci Elektroenergetyczne)** | `https://www.pse.pl/en_US/home` → Data Publications section | Real-time and historical load data; grid map; generation mix; annual expansion plan (Plan Rozwoju Sieci) | 🇵🇱 PL | **REST API** (`https://api.raporty.pse.pl/api/` — confirmed JSON endpoints) + PDF reports | Free | PL grid is expanding; Warsaw-area substations; PSE API returns capacity data per balancing area |
| 40 | **PSE API (Raporty)** | `https://api.raporty.pse.pl/api/pdgsz` | Generation capacity and demand per hour; cross-border flows | 🇵🇱 PL | **REST/JSON** (no key required) | Free | Use to identify time-of-day peak demand patterns and available spare capacity windows |

### 3.4 Spain

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 41 | **REE / Red Eléctrica REData API** | `https://apidatos.ree.es/en/datos/mercados/precios-mercados-tiempo-real?start_date=2024-01-01T00:00&end_date=2024-01-02T00:00&time_trunc=hour` | Real-time & historic electricity prices, generation mix, demand, installed capacity — confirmed JSON REST API | 🇪🇸 ES | **REST API** (no key, confirmed working) | Free | Identify hours of surplus renewable generation → cheap power signal; grid balance by zone |
| 42 | **REE ESIOS Platform** | `https://www.esios.ree.es/en/` | Grid topology, interconnection capacity, substation atlas (Atlas de la Red) | 🇪🇸 ES | **REST API** (token required, free registration): `https://api.esios.ree.es/indicators` | Free | Substation locations and capacity per voltage level; download Atlas de la Red for substation GIS data |

### 3.5 Pan-European

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 43 | **ENTSO-E Transparency Platform** | `https://transparency.entsoe.eu/api?documentType=A44&securityToken={TOKEN}` | Net generation, cross-border flows, installed capacity, grid topology (CGMES), transmission constraints — all 4 target countries | EU-wide | **REST XML API** (free token via email registration) | Free | CGMES network topology export contains all TSO substation locations and capacities in standardized format — gold-standard for cross-country grid screening |
| 44 | **Open Infrastructure Map (OSM-derived)** | `https://openinframap.org` + data via Overpass: `[out:json]; node[power=substation][voltage~"^(110|150|220|380)000"](bbox); out body;` | HV substations, power lines, generators mapped in OSM | EU-wide | **Overpass API** (already in your stack) | Free | Use your existing Overpass integration — add substation voltage queries to find HV connection points near candidates |
| 45 | **TYNDP (Ten-Year Network Development Plan)** | `https://tyndp.entsoe.eu/maps-data` | Pan-European 10-year grid expansion projects, investment scenarios, capacity gaps by region | EU-wide | Manual PDF + **GIS data downloads** (GeoJSON available) | Free | Long-range signal: where ENTSO-E is investing in grid reinforcement correlates with future DC capacity availability |

---

## 4. 📰 Data Center Industry News & Intelligence

### 4.1 News Sites with RSS Feeds

| # | Name | URL | RSS Feed | Cost | DC Relevance |
|---|------|-----|----------|------|--------------|
| 46 | **Data Center Dynamics (DCD)** | `https://www.datacenterdynamics.com` | **`https://www.datacenterdynamics.com/en/rss/`** ✅ (confirmed live — Equinix, Anthropic stories, 18 Jul 2026) | Free | **Primary** EU DC industry news — planning, permit, acquisition, hyperscaler expansion stories with named locations |
| 47 | **DatacenterKnowledge (Informa TechTarget)** | `https://www.datacenterknowledge.com` | **`https://www.datacenterknowledge.com/rss.xml`** ✅ (confirmed live — 17 Jul 2026 stories) | Free | Broader datacenter news; useful for US hyperscaler EU expansion signals |
| 48 | **Data Centre Magazine** | `https://www.datacentremagazine.com` | `https://www.datacentremagazine.com/rss.xml` (redirect to `https://www.datacentremagazine.com/rss.xml`) | Free | European-focused content; sustainability, power, planning angles |
| 49 | **Baxtel** | `https://baxtel.com` | No dedicated RSS; but facility pages at `https://baxtel.com/data-center/{country}` are scrapeable | Free | Global DC directory with facility specs, operator names, addresses, and power capacity — use for competitive mapping |
| 50 | **DatacenterHawk** | `https://datacenterhawk.com` | No public RSS | **Paid** (subscription) | **Premium market intelligence**: supply/demand, leasing absorption, powered shell vacancy by market (AMS, FRA, WAW, MAD) — direct site-selection input |
| 51 | **Cloudscene** | `https://cloudscene.com` | No public RSS | Free browse / paid full access | Carrier-neutral facility directory + connectivity graph; identifies which DCs already have fiber diversity — useful for IX proximity + dark fiber analysis |
| 52 | **DC Byte / CBRE Data Centre Solutions** | `https://www.dcbyte.com` | No RSS | **Paid** | Institutional DC market research; EU-focused supply/demand tracking |

### 4.2 Planning & Permit Announcement Feeds

| # | Name | URL | Access | DC Relevance |
|---|------|-----|--------|--------------|
| 53 | **Official Journal of the EU (EUR-Lex)** | `https://eur-lex.europa.eu/oj/direct-access.html` | RSS per OJ series | Large public procurement and State Aid decisions involving DC infrastructure |
| 54 | **TED (Tenders Electronic Daily)** | `https://ted.europa.eu/TED/browse/browseByMap.do` + API `https://api.ted.europa.eu/v3/notices/search` | **REST API** (free) | Public procurement for data centers, UPS, cooling systems — early signal of government/institutional DC projects in target countries |
| 55 | **Hyperscaler investor relations / press** | AWS: `https://press.aboutamazon.com/rss.xml` · Azure: `https://news.microsoft.com/rss.xml` · Google: `https://blog.google/rss/` | RSS (confirmed active feeds) | Free | Hyperscaler EU datacenter announcements often name specific cities/regions; 3-6 months ahead of public planning filings |

---

## 5. 📋 Planning Permits & Construction

### 5.1 Netherlands

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 56 | **Ruimtelijke Plannen WFS** | `https://afnemers.ruimtelijkeplannen.nl/afnemers/services` | All bestemmingsplannen (zoning plans) + wijzigingsplannen (amendments); POST-industrial rezoning to DC-compatible use | 🇳🇱 NL | **OGC WFS** (GetFeature by bbox/time) | Free | Monitor for new "Bedrijf" or "Utiliteitsgebouw" zoning amendments in AMS/Rotterdam IX-adjacent areas |
| 57 | **DSO-LV (Omgevingswet permits API)** | `https://dso-lv.overheid.nl/lvbb/v1/documenten` | Environment Act permits filed under the new Omgevingswet (since Jan 2024) including large building permits | 🇳🇱 NL | **REST API** (free, open) | Free | New DC projects above ~5,000 m² require Omgevingsvergunning filings — searchable by location and type |
| 58 | **Planviewer.nl** | `https://www.planviewer.nl` | Viewer + WMS for all active zoning plans | 🇳🇱 NL | WMS (no key) | Free | Quick visual validation of zoning status before deeper PDOK queries |

### 5.2 Germany

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 59 | **UVP-Portal (Environmental Impact Portal)** | `https://www.uvp-verbund.de/mapapps/resources/apps/uvp/index.html` | EIA-required projects ≥50,000 m² gross floor area, large energy installations — includes DC projects above thresholds | 🇩🇪 DE | **Web portal + WMS** `https://www.uvp-verbund.de/ows/uvp-verbund/uvpgis` | Free | Large DC projects requiring EIA are disclosed here before construction — find competitor/hyperscaler projects |
| 60 | **Bauleitplanung per Bundesland** | Bayern: `https://geoserver.bayerncloud.de/geoserver/ows` · NRW: `https://www.wfs.nrw.de/geobasis/wfs_nw_bplan` | Municipal development plans (B-Plan) | 🇩🇪 DE (state by state) | **WFS** (no key for NRW/Bayern) | Free | Identify designated Gewerbepark/Industriegebiet areas being newly zoned — pipeline for industrial land availability |

### 5.3 Poland

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 61 | **BIP (Biuletyn Informacji Publicznej)** | `https://www.bip.gov.pl/subjects/` | Public procurement and planning decisions; each municipality publishes MPZP changes | 🇵🇱 PL | Manual (per gmina) | Free | Monitor Warsaw (Mazowieckie), Wrocław, Katowice for industrial zone rezoning amendments |
| 62 | **SSWI (Spatial Data Infrastructure — WFS)** | `https://mapy.geoportal.gov.pl/wss/service/WFS/guest/wfs/` | Land use, infrastructure, administrative | 🇵🇱 PL | **WFS** | Free | Cross-reference parcel zoning status with ULDK geometry for PL sites |

### 5.4 Spain

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 63 | **MITMA — Información Urbanística** | `https://www.mitma.gob.es/urbanismo-y-suelo/urbanismo/informacion-del-suelo` | National urban land statistics; SUC (urban consolidated) vs SUNC (urban unconsolidated) classification | 🇪🇸 ES | Manual PDF + GIS download | Free | Identify legally industrial land (Suelo Industrial) at national level |
| 64 | **Sede Electrónica del Catastro — INSPIRE WFS** | `https://www.catastro.meh.es/INSPIRE/` | Cadastral Parcels + Land Use (INSPIRE CP+LU) | 🇪🇸 ES | **OGC WFS** (no key) | Free | Download all industrial-use parcels by municipality polygon — extends what you already have from Catastro |

---

## 6. 🔗 Fiber & Connectivity

### 6.1 Global / Pan-European

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 65 | **TeleGeography Submarine Cable Map API** | `https://www.submarinecablemap.com/api/v3/cable/all.json` | All ~600 global submarine cables with landing station locations, operators, ready-for-service dates | Global | **REST JSON API** ✅ (confirmed live, no key) | Free | Identify submarine cable landing stations in ES (Barcelona, Bilbao, Valencia, Algeciras) and NL (Zandvoort, Den Haag) — DC adjacent to cable landings = premium connectivity |
| 66 | **TeleGeography CommsUpdate** | `https://www2.telegeography.com/commsupdate-news-service` | Daily telecom news: fiber route announcements, carrier investments, IX peerings | Global | Email newsletter + manual | Free newsletter | Early signals of new fiber routes or IX formation near candidate cities |
| 67 | **Cloudscene Network Coverage** | `https://cloudscene.com` | ISP/carrier service availability per DC facility; fiber route density by data center | Global | Web browse (free tier); API for paying enterprise customers | Free/Paid | Map which candidate sites already have fiber diversity from Tier-1 carriers vs. which need new builds |
| 68 | **Open Infrastructure Map (Power + Fiber)** | `https://openinframap.org` | OSM-tagged telecom ducts, fiber routes, IXPs, power substations overlaid | EU-wide | **Overpass API** (existing integration) — query `[telecom=cable_duct]` or `[man_made=pipeline][substance=telecommunications]` | Free | Augment existing Overpass queries with telecom duct / dark fiber layer |

### 6.2 Country-Specific Broadband / Fiber Maps

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 69 | **NL — Telecomkaart (ACM)** | `https://www.acm.nl/nl/publicaties/postcodetool-van-de-acm` | Fiber/cable/xDSL availability by postcode | 🇳🇱 NL | **API** via ACM postcode tool | Free | Identify postcodes with DWDM dark fiber availability (NL fiber density near Amsterdam) |
| 70 | **DE — Breitbandatlas / Gigabit-Grundbuch** | `https://gigabitgrundbuch.bund.de` (confirmed accessible) | FTTH/FTTB coverage by municipality; carrier-reported fiber presence | 🇩🇪 DE | **WMS** (BMWK open data) | Free | Screen DE municipalities for existing fiber infrastructure before site shortlisting |
| 71 | **PL — UKE Broadband Map (SIIS)** | `https://www.uke.gov.pl/en/` → Broadband coverage section; WMS: `https://mapa.uke.gov.pl/arcgis/rest/services` | Fiber/cable/LTE coverage by operator; registered infrastructure in SIIS database | 🇵🇱 PL | **WMS/ArcGIS REST** | Free | UKE (telecoms regulator) maintains public broadband map — identify fiber-dark areas near IX nodes where new DC would have competitive advantage |
| 72 | **ES — CNMC Cobertura de Banda Ancha** | `https://www.cnmc.es/expedientes-y-resoluciones/resoluciones/telecomunicaciones/informes-anuales-telecomunicaciones` + SETSI coverage check | FTTH/HFC/FWA coverage per municipality | 🇪🇸 ES | Manual + WMS via MITECO | Free | Spanish broadband coverage by municipality — cross-reference with IX-proximity zones |

---

## 7. 🏭 Company / Brownfield Signals

### 7.1 Insolvency & Corporate Distress

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 73 | **DE — Insolvenzbekanntmachungen.de** | `https://neu.insolvenzbekanntmachungen.de/ap/suche.jsf` | All German insolvency court notices — company name, court, date, type; searchable by PLZ/region | 🇩🇪 DE | **Web scrape** (confirmed accessible; no API but structured HTML) | Free | Power-hungry industrial companies (steel, paper, chemicals, printing) going insolvent in industrial zones = potential brownfield site with existing HV connection |
| 74 | **DE — Bundesanzeiger** | `https://www.bundesanzeiger.de/pub/en/start?0` | Official company filings: balance sheets, liquidations, restructurings | 🇩🇪 DE | Web (free search); API available to registered parties | Free | Corporate dissolution notices for large industrial operators — trigger for land-to-market searches |
| 75 | **NL — Staatscourant (Official Gazette)** | `https://www.officielebekendmakingen.nl/staatscourant` + RSS: `https://feeds.officielebekendmakingen.nl/stcrt.rss` | Legal notices including company dissolutions, liquidations, environmental permits | 🇳🇱 NL | **RSS feed** + **REST API** `https://repository.overheid.nl/frbr/officielepublicaties` | Free | Monitor for NL industrial company closures and environmental permit surrenders — freed up industrial land signal |
| 76 | **NL — KVK (Chamber of Commerce) Open Data** | `https://data.kvk.nl/` | Business deregistrations, sector codes, address data | 🇳🇱 NL | **REST API** (free, open data) | Free | Filter deregistrations of energy-intensive SBI codes (e.g., 24xx metals, 17xx paper, 20xx chemicals) in industrial zones |
| 77 | **PL — KRS (National Court Register)** | `https://ekrs.ms.gov.pl/` + API: `https://api-krs.ms.gov.pl/api/krs/` | Company registration/dissolution; proceedings | 🇵🇱 PL | **REST API** (no key, JSON) | Free | Monitor industrial company liquidations in Warsaw/Mazowieckie, Silesia, Lower Silesia regions |
| 78 | **ES — BORME (Boletín Oficial del Registro Mercantil)** | `https://www.boe.es/diario_borme/` + RSS: `https://www.boe.es/rss/borme.php?s=5` | Spanish company dissolutions, liquidations, insolvencies | 🇪🇸 ES | **RSS feed** + API via BOE/BORME `https://www.boe.es/api/` | Free | Track industrial company closures in Madrid (ESPANIX), Barcelona (CATNIX), Valencia corridors |

### 7.2 Industrial Site / Former Factory Databases

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 79 | **NL — Bodemloket (Contamination Registry)** | `https://www.bodemloket.nl` + WMS: `https://www.bodemloket.nl/server/services/bodemloket/MapServer/WMSServer` | Known soil contamination sites by address/polygon — former industrial use indicator | 🇳🇱 NL | **WMS** (no key) | Free | **Negative screen**: identifies brownfield contamination risk for candidate sites; also confirms prior heavy-industrial use (= HV connection likely) |
| 80 | **DE — Altlastenkataster (per Bundesland)** | e.g. NRW: `https://www.geoserver.nrw.de/geoserver/ows?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities` (layer `bodenbelastung`) | Contaminated/former-industrial sites | 🇩🇪 DE (state databases) | **WMS** (free) | Free | Same dual-use: contamination risk screen + heavy-industrial use confirmation for brownfield DC shortlisting |
| 81 | **Eurostat Industrial Structure Database** | `https://ec.europa.eu/eurostat/databrowser/view/STS_INPR_A/default/table` | Industrial production by NUTS-2 region — declining sectors indicate factory closure likelihood | EU-wide | **JSON-stat API** `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/STS_INPR_A?format=JSON` | Free | Identify NUTS-2 regions with rapidly declining steel/paper/chemical production → future brownfield sites |

### 7.3 News Intelligence for Brownfield Signals

| # | Name | URL | Data | Access | Cost | DC Relevance |
|---|------|-----|------|--------|------|--------------|
| 82 | **Google News RSS (keyword-targeted)** | `https://news.google.com/rss/search?q=datacenter+site+OR+Rechenzentrum+genehmigung+OR+data+centre+planning&hl=en-GB&gl=GB&ceid=GB:en` | Any news source mentioning DC planning/permits/acquisitions; also query for factory closures: `fabrik+schliessung+OR+usine+fermeture` | Global | **RSS** (no key) | Free | Real-time cross-source monitoring for permit approvals, hyperscaler land acquisitions, factory closures in target countries |
| 83 | **Reuters / AP RSS for industrial closures** | `https://feeds.reuters.com/reuters/businessNews` | Wire service coverage of major plant closures (automotive, steel, chemicals) | EU-wide | **RSS** | Free | Reuters regularly reports major EU industrial plant closures by company and location — map to IX-radius zones |

---

## Summary Prioritization Matrix

| Priority | Source | Why | Quick Win? |
|----------|--------|-----|------------|
| 🔴 **Critical** | Netbeheer NL Capaciteitskaart | NL grid congestion is deal-breaker; must filter before anything else | ✅ Integrate JSON tiles |
| 🔴 **Critical** | ENTSO-E Transparency API | Cross-country substation capacity in one API | ✅ Free token |
| 🔴 **Critical** | DCD + DCK RSS feeds | Daily permit/acquisition signals | ✅ Already confirmed live |
| 🟠 **High** | Ruimtelijke Plannen WFS | NL zoning pre-screening | ✅ No key needed |
| 🟠 **High** | MaStR (DE substations) | All DE substations with GPS + capacity | ✅ Free CSV export |
| 🟠 **High** | REE ESIOS API | ES grid substations + renewable surplus | ✅ Free token |
| 🟠 **High** | PSE Raporty API | PL grid capacity data | ✅ No key |
| 🟠 **High** | ULDK (PL parcels) | PL parcel geometry by ID | ✅ No key needed |
| 🟡 **Medium** | ImmobilienScout24 API | DE commercial listings | ⚠️ OAuth partner registration |
| 🟡 **Medium** | Idealista API | ES commercial listings | ⚠️ Request-based key |
| 🟡 **Medium** | Submarine Cable Map API | Cable landing stations near ES sites | ✅ Confirmed free JSON |
| 🟡 **Medium** | Insolvenzbekanntmachungen.de | DE brownfield signals | ✅ Free scrape |
| 🟡 **Medium** | NL Staatscourant RSS + KVK API | NL industrial closure signals | ✅ Free |
| 🟡 **Medium** | BORME RSS (ES) | ES industrial closure signals | ✅ Free |
| 🔵 **Valuable** | TED Procurement API | DC construction tenders | ✅ Free |
| 🔵 **Valuable** | CoStar API | Institutional CRE comps | ❌ Expensive |
| 🔵 **Valuable** | DatacenterHawk | Market supply/demand | ❌ Paid subscription |
| 🔵 **Valuable** | Open Infrastructure Map + Overpass | Power + telecom OSM layers | ✅ Already in stack |

---

## Key API Endpoints — Quick Reference

```
# ENTSO-E Transparency (free token via ENTSO-E website)
GET https://transparency.entsoe.eu/api?documentType=A73&processType=A16
    &psrType=B16&in_Domain=10YNL----------L
    &periodStart=YYYYMMDDHHMM&periodEnd=YYYYMMDDHHMM
    &securityToken={TOKEN}

# REE REData (no auth)
GET https://apidatos.ree.es/en/datos/mercados/precios-mercados-tiempo-real
    ?start_date=2024-01-01T00:00&end_date=2024-01-02T00:00&time_trunc=hour

# REE ESIOS (free token via registration at esios.ree.es)
GET https://api.esios.ree.es/indicators/10021
    Headers: x-api-key: {TOKEN}

# PSE Poland (no auth)
GET https://api.raporty.pse.pl/api/pdgsz?$filter=doba eq '2024-01-01'&$top=24

# Polish Parcel Geometry (no auth)
GET https://uldk.gugik.gov.pl/?request=GetParcelById&id={PARCEL_ID}&result=geom_wkt

# Submarine Cable Map (no auth)
GET https://www.submarinecablemap.com/api/v3/cable/all.json
GET https://www.submarinecablemap.com/api/v3/landing-point/all.json

# EUROSTAT GeoJSON (no auth)
GET https://gisco-services.ec.europa.eu/distribution/v2/nuts/geojson/NUTS_RG_01M_2021_4326.geojson

# NL Ruimtelijke Plannen WFS (no auth)
GET https://afnemers.ruimtelijkeplannen.nl/afnemers/services
    ?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature
    &TYPENAME=app:Bestemmingsplangebied&BBOX=4.7,52.2,5.1,52.5,EPSG:4326

# TED Procurement API (no auth)
GET https://api.ted.europa.eu/v3/notices/search
    ?q=data+center+OR+Rechenzentrum+OR+datacenter&fields=BT-5141-Lot,BT-727-Lot
    &language=EN&page=1&limit=25

# DCD RSS Feed (no auth)
GET https://www.datacenterdynamics.com/en/rss/

# DCK RSS Feed (no auth)
GET https://www.datacenterknowledge.com/rss.xml

# NL Staatscourant RSS (no auth)
GET https://feeds.officielebekendmakingen.nl/stcrt.rss

# ES BORME RSS (no auth)
GET https://www.boe.es/rss/borme.php?s=5
```

---

## Gaps & Uncertainties

1. **ImmobilienScout24 Search API**: The `api.immobilienscout24.de` portal is confirmed active for **Import/Export** (broker listing management), but **programmatic search** of existing listings requires a separate partner agreement — their public search API was deprecated ~2020. Workaround: structured web scraping with respectful rate-limiting, or use CoStar API.

2. **Netbeheer NL Capaciteitskaart raw API**: The tile endpoint at `data.partnersinenergie.nl/capaciteitskaart/` requires authentication per the redirect chain. The underlying data is published as a **semi-annual Excel/PDF** download at `https://www.netbeheernederland.nl/netcapaciteit-en-flexibiliteit/capaciteitskaart` — parse the downloadable Excel file for programmatic use rather than the tile API.

3. **PSE Poland REST API**: `api.raporty.pse.pl` endpoint pattern is inferred from PSE's published OData service; the exact base URL needs validation against PSE's developer documentation at `https://www.pse.pl/en_US/home` → Publications.

4. **DE Bauleitplanung WFS**: Coverage varies significantly by Bundesland — Bayern and NRW are well-covered with open WFS; other states (e.g. Sachsen, Thüringen) may require individual Landkreis portals. Use the Geoportal.de CSW catalog to discover available WFS endpoints per state.

5. **Otodom / Gratka (PL) APIs**: No public APIs confirmed. The Next.js `__NEXT_DATA__` JSON is scrapeable but ToS must be reviewed; consider a Polish RE data broker (e.g. [Nieruchomosci-online.pl](https://nieruchomosci-online.pl) which has a documented partner API) as an alternative.

6. **DatacenterHawk / DC Byte**: Both are paid-subscription platforms with no free tier — costs are ~$10,000–$30,000/year for institutional access. However, both publish **free quarterly sample reports** that can be manually incorporated.

7. **ES broadband/fiber map (CNMC)**: The CNMC cobertura tool was DNS-unresolvable during this research session; the correct current URL may be `https://www.mineco.gob.es/portal/site/mineco/` via SETSI division, or the CNMC's broadband coverage check embedded in their consumer portal.
