# Access control

This tool uses **network-based access control** enforced at the Azure Front Door WAF,
configured entirely through files in this repository (GitOps). Change access by editing
the config files below and redeploying the infrastructure — no Azure portal clicks needed.

## Model

| Endpoint | Auth | Who can reach it |
| --- | --- | --- |
| **Public / customer** (`CUSTOMER_URI`) | None — publicly available | Any client on the Ziggo or KPN consumer ISP ranges |
| **Admin** (`ADMIN_URI`) | None at the edge | `admin.allowedIps` if set, otherwise the Ziggo/KPN ranges |

Everything not on the allowlist receives an HTTP 403 from Front Door before it ever
reaches the App Service. The App Services themselves remain locked to
`AzureFrontDoor.Backend` only, so the WAF is the single enforced entry point.

## Config files (edit these, then redeploy)

### `config/access-control.json`
- `customerPublic` — the public side is served without login.
- `admin.allowedIps` — **the admin GitOps knob.** Add explicit CIDRs (e.g. your office
  or VPN egress, `203.0.113.10/32`) to lock the admin site down to just those locations.
  When this array is **empty**, admin is reachable from the full Ziggo/KPN ranges.
- `website.allowedIsps` — documents the ISPs whose ranges are allowed.

### `config/isp-allowlist.json` (auto-generated)
The concrete Ziggo/KPN CIDR ranges, generated from live BGP data (RIPEstat).
**Do not edit by hand.** Refresh it with:

```bash
npm run update-isp-allowlist
```

then commit and redeploy. ISPs re-announce prefixes over time, so refresh periodically
(e.g. monthly) to avoid stale ranges. To change which ISPs/ASNs are covered, edit
`ISP_ASNS` in `scripts/update-isp-allowlist.mjs`.

## How it's wired

1. `infra/main.bicep` loads both config files with `loadJsonContent()` at deploy time.
2. It passes `kpn`/`ziggo` CIDR arrays and `admin.allowedIps` to
   `infra/modules/frontdoor.bicep`.
3. The Front Door module builds two WAF policies (allowlist model — Allow rules for the
   permitted ranges, then a catch-all Block rule):
   - **customer WAF** → customer endpoint (Ziggo + KPN).
   - **admin WAF** → admin endpoint (admin CIDRs, or ISP fallback).

## Redeploy after a config change

```bash
azd provision
# or: az deployment sub create -l swedencentral -f infra/main.bicep -p infra/main.parameters.json
```

## Notes & caveats

- **You must connect from a Ziggo or KPN IP** (or an IP in `admin.allowedIps`) to reach
  the site after this change. Corporate/VPN networks on other ISPs will be blocked.
- IPv4 and IPv6 ranges are both included, so IPv6 clients are covered.
- The per-IP rate-limit rule (200 req/min) still applies to allowed clients.
