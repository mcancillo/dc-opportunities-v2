# DC Opportunities v2 — Azure-Native Architecture Proposal

> **Status:** Proposal / for review
> **Author:** generated for @mcancillo
> **Date:** 2026-07-22
> **Target subscription:** `6cbb5372-2516-4048-b672-a3e0a36fac8b` (MCAPS-Hybrid-REQ-105009-2024-macancil)
> **Region:** West Europe (primary)

This proposal re-architects DC Opportunities v2 from a single-process Express app into an
**internet-facing, Azure-native solution** built on **Azure App Service (Web App)** and
**Azure SQL Database**, secured with a **Zero Trust** posture, dual identity
(**Entra workforce + C2B external identities**), **Microsoft Authenticator MFA**, and a
hard **$300/month cost cap**.

It complements the existing cloud-agnostic design in
[`architecture-proposals.md`](architecture-proposals.md) — that document defines the
owner/admin/customer model (§4), MFA enforcement (§5) and anti-exfiltration controls (§6–7);
this document is the **Azure implementation** of it.

---

## 1. Requirements traceability

| # | Requirement | How it is met |
|---|-------------|---------------|
| R1 | Azure-native SQL + Web App, internet-facing | App Service (Linux) behind Azure Front Door Standard + WAF; Azure SQL Database (serverless) |
| R2 | Cost cap **$300 USD/month** | Small/serverless SKUs (~$150 typical) + Azure Consumption **Budget = $300** with 50/80/100% alerts and an automation runbook to throttle at 100% |
| R3 | **Zero Trust** | Verify explicitly (Entra auth on every request), least-privilege (managed identity + SQL Entra-only auth, RBAC), assume breach (WAF, private endpoints, TLS 1.2+, Defender, audit logging) |
| R4 | Allow **Entra and C2B IAM** | Two Entra tenants: **workforce** (Entra ID) for staff; **External ID (CIAM / C2B)** for customers and consumer accounts |
| R5 | Admins: **mcancillo@hotmail.com** and **macancil@microsoft.com** | `macancil@microsoft.com` = workforce Entra; `mcancillo@hotmail.com` = Microsoft consumer (MSA) federated into **Entra External ID**; both mapped to the **Admin** app role |
| R6 | **MS Authenticator MFA** | Conditional Access (workforce) + External ID user-flow MFA, both using Microsoft Authenticator (push / passwordless / TOTP) |

---

## 2. Target Azure architecture

```
                              Internet
                                 │  HTTPS (TLS 1.2+)
                    ┌────────────▼─────────────┐
                    │  Azure Front Door Std +   │  WAF (OWASP), rate-limit,
                    │  Web Application Firewall  │  geo-filter, TLS termination
                    └────────────┬─────────────┘
                                 │  Private Link / access restriction
             ┌───────────────────┴────────────────────┐
             │            App Service Plan (Linux)      │
             │  ┌────────────────┐  ┌────────────────┐  │
   Entra ─── │  │ ADMIN web app  │  │ CUSTOMER web   │  │ ── External ID (C2B)
 (workforce) │  │ /admin, curate │  │ app (RO, shared│  │    consumers/customers
             │  │ Easy Auth+role │  │ plots only)    │  │    Easy Auth + MFA
             │  └───────┬────────┘  └───────┬────────┘  │
             └──────────┼───────────────────┼───────────┘
                        │ Managed Identity (no secrets)  │
                        ▼                                ▼
            ┌───────────────────────┐        ┌────────────────────────┐
            │  Azure Key Vault      │        │  Azure SQL Database      │
            │  (RBAC, secrets/certs)│        │  Serverless GP, spatial  │
            └───────────────────────┘        │  Entra-only auth + RLS   │
                        ▲                     │  Private Endpoint only   │
                        │                     └────────────────────────┘
            ┌───────────┴───────────┐        ┌────────────────────────┐
            │ Log Analytics +        │        │ Storage (Blob) for      │
            │ App Insights + Defender│        │ cache/exports, PE only  │
            └───────────────────────┘        └────────────────────────┘
```

**Deployment shape:** one **Linux App Service Plan** hosts two web apps (`admin` and
`customer`) as separate sites so the internal and external audiences are isolated at the
identity and routing layer while sharing compute to stay in budget. Both sit behind a
single **Front Door + WAF** as the only internet ingress; the App Services accept traffic
**only from Front Door** (access restriction on the `AzureFrontDoor.Backend` service tag +
`X-Azure-FDID` header check).

---

## 3. Component mapping

| Current (v2) | Azure-native target | SKU / tier | Notes |
|--------------|---------------------|-----------|-------|
| `server.js` Express API + static | App Service (Linux, Node 20) — **admin** + **customer** web apps | Plan **P0v3** or **B2** | Managed identity; `httpsOnly`, TLS 1.2, FTPS off |
| Internet entry | **Azure Front Door Standard + WAF** | Standard | OWASP ruleset, rate limiting, single public ingress |
| `data/*.json`, ledger, iam | **Azure SQL Database** (spatial types, RLS) | **Serverless GP, 0.5–2 vCore, auto-pause** | Replaces JSON files; per-customer Row-Level Security |
| `cache/`, CSV exports | **Azure Blob Storage** | Standard LRS, private endpoint | Cache + signed, short-TTL export downloads |
| Secrets / API keys | **Azure Key Vault** | Standard, RBAC | PeeringDB/GitHub tokens, no secrets in app settings |
| — | **Managed Identity** | System-assigned | App → SQL, Key Vault, Storage (no passwords) |
| — | **Log Analytics + App Insights** | Pay-as-you-go, 30-day | APM, audit trail, WAF logs |
| — | **Microsoft Defender for Cloud / SQL** | Plan 2 (optional) | Threat detection; can defer to fit budget |

> **Spatial note:** Azure SQL supports native `geography`/`geometry` types, sufficient for
> radius/nearest-IX queries. If full **PostGIS** parity is required, substitute
> **Azure Database for PostgreSQL Flexible Server** (also Azure-native) — see §8 alternative.

---

## 4. Identity & access — Entra + C2B (R4, R5)

Two identity planes, both internet-facing, both MFA-enforced with Microsoft Authenticator:

### 4.1 Workforce plane — Microsoft Entra ID (staff/admins)
- Tenant: the existing corporate Entra tenant (`16b3c013-…`).
- **`macancil@microsoft.com`** signs in here and is granted the **Admin** app role on the
  admin web app's enterprise application.
- MFA and device posture enforced via **Conditional Access** (see §5).

### 4.2 Customer plane — Microsoft Entra External ID (C2B / CIAM)
- A dedicated **External ID (customer) tenant** provides sign-up/sign-in for external
  customers and **consumer accounts**.
- **`mcancillo@hotmail.com`** (a Microsoft consumer/MSA account) is onboarded here — either
  via **Microsoft social identity provider** federation or as an invited external member —
  and mapped to the **Admin** app role so it can reach the admin side as requested.
- Customers self-service sign-in only ever reach the **customer** web app (read-only, only
  shared plots), enforcing the audience split from `architecture-proposals.md` §4.

### 4.3 App roles → tool "admin side"
| Principal | Identity plane | App role | Access |
|-----------|----------------|----------|--------|
| `macancil@microsoft.com` | Entra workforce | **Admin** | Full admin UI, curation, IAM, exports |
| `mcancillo@hotmail.com` | External ID (MSA federated) | **Admin** | Full admin UI (as requested) |
| Customer users | External ID | **Customer** | Read-only, shared plots only |

Authorization is enforced by **App Service Easy Auth** (token validation, zero app code)
**plus** the existing role model in `src/services/iam.js` (owner/admin/customer) backed by
SQL. The enterprise app is set to **assignment required**, so only explicitly assigned
principals can authenticate.

---

## 5. Zero Trust controls (R3)

**Verify explicitly**
- Easy Auth requires a valid Entra / External ID token on **every** request
  (`requireAuthentication: true`, unauthenticated → redirect to login).
- **Conditional Access** (workforce) requires **MFA via Microsoft Authenticator**, compliant
  device, and blocks legacy auth. External ID **user flow** requires MFA (Authenticator
  push / TOTP) for all customer and consumer sign-ins (R6).

**Use least-privilege access**
- **Managed identity** for App → SQL, Key Vault, Storage; **no** connection-string
  passwords. Azure SQL uses **Entra-only authentication** (`azureADOnlyAuthentication`).
- **RBAC** at resource-group scope; Key Vault in RBAC mode; SQL **Row-Level Security** scopes
  customers to their shared plots.
- Enterprise app **assignment required = true**.

**Assume breach**
- **Front Door + WAF** is the only public ingress; App Services restricted to Front Door
  (service tag + FDID header). SQL, Key Vault, Storage reachable **only via Private
  Endpoints** on a VNet; public network access **disabled**.
- **TLS 1.2+**, `httpsOnly`, **FTPS disabled**, SCM locked down.
- **Defender for Cloud/SQL**, diagnostic logs to Log Analytics, immutable audit trail,
  short-TTL SAS for exports (anti-exfiltration, `architecture-proposals.md` §6).

---

## 6. Cost model & the $300/month cap (R2)

**Typical monthly estimate (West Europe, USD, indicative):**

| Service | Config | Est. /mo |
|---------|--------|---------:|
| App Service Plan (Linux) | B2 (2 vCPU, hosts 2 web apps) | ~$26 |
| Azure SQL Database | Serverless GP, 0.5–2 vCore, auto-pause | ~$40–110 |
| Azure Front Door Standard + WAF | base + low traffic | ~$35 |
| Blob Storage | Standard LRS, small | ~$3 |
| Key Vault | Standard, low ops | ~$1 |
| Log Analytics + App Insights | 30-day, low volume | ~$15–30 |
| Private Endpoints | 3 × ~$7 | ~$21 |
| Entra External ID | first 50k MAU free | $0 |
| **Estimated total** | | **~$140–225** |

Headroom is deliberate. Defender for SQL, higher SQL vCore, or bursty Front Door traffic
can be absorbed under the **$300** ceiling.

**Enforcing the cap (not just estimating it):**
1. **Azure Consumption Budget = $300/month**, scoped to the resource group.
2. **Alerts** at 50% / 80% / 100% (actual) and 100% (forecast) → email
   `macancil@microsoft.com` + `mcancillo@hotmail.com` and an **Action Group**.
3. **Automation runbook / Logic App** on the 100% alert to **scale SQL to min vCore and stop
   non-essential apps**, preventing overrun (soft cap — Azure has no hard billing stop).
4. SQL **auto-pause** and App Service **auto-scale off** keep idle cost near-zero.

---

## 7. Migration plan (phased)

| Phase | Work | Outcome |
|-------|------|---------|
| 0 | Provision RG, Budget $300, Log Analytics, Key Vault, VNet | Guardrails first |
| 1 | Azure SQL (serverless) + schema (users, customers, ledger, shares, audit) + RLS; migrate `data/*.json` and `iam.json` | Durable, queryable store |
| 2 | Refactor services (`ledger.js`, `iam.js`, providers) from file I/O to SQL via managed identity | Stateless app tier |
| 3 | Split into **admin** + **customer** web apps; wire **Easy Auth** (workforce + External ID) | Audience isolation + auth |
| 4 | Front Door + WAF; lock App Services to Front Door; Private Endpoints; disable public access on SQL/KV/Storage | Zero Trust ingress |
| 5 | Conditional Access + External ID user flow (Authenticator MFA); assign the two admin identities | MFA + admin access |
| 6 | Defender, alerts, runbook, DR/backup validation | Operational hardening |

---

## 8. Alternatives & decisions

- **Azure SQL vs PostgreSQL Flexible Server** — Azure SQL chosen for native Entra-only auth,
  serverless auto-pause, and built-in spatial types. If the scoring engine needs full
  **PostGIS**, switch to **Azure Database for PostgreSQL Flexible Server** (VNet-injected,
  Entra auth) with no change to the identity/network design.
- **App Service vs Container Apps** — App Service chosen for built-in **Easy Auth** (zero-code
  Entra + External ID), simplest path for a Node app and the fastest way to satisfy R1/R3.
- **Front Door vs App Gateway** — Front Door Standard gives global TLS + WAF + caching at
  lower fixed cost for a single-region internet app.

---

## 9. Open decisions for sign-off

1. Confirm creating a dedicated **Entra External ID (C2B)** tenant for customers/consumers.
2. Confirm **Azure SQL** (native spatial) vs **PostgreSQL Flexible Server** (PostGIS).
3. Confirm whether **Defender for SQL** is in-scope now or deferred to protect budget.
4. Confirm the two admin identities and that `mcancillo@hotmail.com` is federated via the
   Microsoft social provider in External ID.

> On approval, this becomes the basis for `.azure/deployment-plan.md` and the Bicep/azd
> implementation (App Service, SQL, Front Door, Key Vault, budget, auth), following the
> azure-prepare → azure-validate → azure-deploy workflow.
