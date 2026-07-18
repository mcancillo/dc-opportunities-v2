# DC Opportunities — Client/Server & Multi-Platform Architecture Proposals

How to evolve DC Opportunities v2 from a single-process Express app (server-rendered
static SPA) into a proper **client/server product** with **web, Android and iOS** clients.

The tool has **two distinct audiences**:

- **Owner / Admin (internal)** — run searches, curate the opportunity ledger, and decide
  **which properties are shared with which customers**. Full access to sources, scores,
  exports, and configuration.
- **Customers (external)** — only ever see the **specific properties the owner has shared
  with them**, in a restricted, read-only, MFA-protected view. They must not be able to
  discover un-shared plots, export data in bulk, or reach the source code / raw data feeds.

This document covers the platform architecture (§1–3), the **owner-curated per-customer
sharing model** (§4), **customer MFA enforcement** (§5), **data-exfiltration prevention**
(§6), and **source-code / IP protection** (§7).

---

## 1. Where we are today

- **Backend:** Node.js + Express (`server.js`) serving a REST API under `/api` and static
  assets from `public/`.
- **Frontend:** Vanilla JS + Leaflet single-page app, no build step, no auth.
- **Data:** JSON files + on-disk `cache/`; live pulls from PeeringDB, Overpass, PDOK,
  Spanish Cadastre, ENTSO-E.
- **State:** New **opportunity ledger** persisted as `data/ledger.json` (single file,
  process-local).

**Constraints for going multi-user / multi-platform**
- No authentication or authorization.
- Ledger and API credentials are global/process-local (not per user/tenant).
- No shared, queryable datastore — a JSON file won't scale to concurrent writers.
- Frontend is not packaged for app stores.

---

## 2. Target architecture (recommended)

```
        ┌───────────────────────────┐        ┌───────────────────────────┐
        │  INTERNAL app (owner/admin)│        │  CUSTOMER app (external)   │
        │  full ledger, curation UI  │        │  only SHARED plots, RO     │
        └─────────────┬─────────────┘        └─────────────┬─────────────┘
                      │  HTTPS + JWT (MFA-gated for customers)  │
                      └──────────────────┬──────────────────────┘
                               ┌─────────▼─────────┐
                               │   API Gateway      │  (TLS, CORS allowlist,
                               │  + WAF / rate limit│   per-role rate limits)
                               └─────────┬─────────┘
                     ┌───────────────────┼───────────────────────┐
             ┌───────▼───────┐  ┌────────▼─────────┐   ┌──────────▼─────────┐
             │  Auth service  │  │  Core API (Node)  │   │  Ingestion workers │
             │  Clerk/Auth0/  │  │  Express/Fastify  │   │  (cron: PeeringDB, │
             │  Supabase      │  │  + entitlements   │   │  OSM, grid, news)  │
             │  (MFA policy)  │  │  + audit log      │   └──────────┬─────────┘
             └───────┬───────┘  └────────┬─────────┘              │
                     │          ┌────────▼──────────────────────────────────┐
                     │          │  PostgreSQL + PostGIS (Row-Level Security) │
                     │          │  users, orgs, invites, ledger_entries,     │
                     └─────────►│  property_shares, audit_log                │
                                │  Redis (cache, rate-limit, sessions)       │
                                └────────────────────────────────────────────┘
```

**Two separately-deployed front ends** (internal vs customer) that talk to the **same API**
but hit **different, role-scoped endpoints**. The customer app is a thin read-only client;
all curation logic and raw data live behind the API.

### Key moves
1. **Split the API from the web app**, and split the web app into **two builds**: an internal
   admin app and a locked-down customer app. Serve each from separate hosts/CDNs.
2. **Introduce a real database.** Move `ledger.json`, curated properties, and credentials into
   **PostgreSQL + PostGIS** with **Row-Level Security (RLS)** so the database itself refuses to
   return a plot to a customer it wasn't shared with.
3. **Add an auth layer** (see §4–5) issuing **JWTs**; every `/api` route validates the token and
   scopes data to the user/organization/role. **Customers are forced through MFA.**
4. **Curation & sharing layer.** The owner explicitly links ledger entries to specific customers
   via a `property_shares` table; customers can only ever read what is shared (see §4).
5. **Move heavy/slow external calls to background workers.** The current in-request Overpass call
   can take 60–120s. Pre-fetch on a schedule so client requests are fast — and so customers never
   trigger (or observe) upstream data-source calls.

---

## 3. Client strategy: web + Android + iOS

Three realistic options, cheapest-to-richest:

### Option A — Responsive PWA (fastest, lowest cost) ✅ recommended first step
- Package the existing (or a rebuilt React) web app as a **Progressive Web App**: add a
  manifest + service worker, installable on Android/iOS home screens.
- **Pros:** one codebase, no app-store friction, instant updates, reuses current Leaflet UI.
- **Cons:** iOS PWA limits (limited background, push only since iOS 16.4, no store presence).
- **Effort:** low. Good for an invite-only beta.

### Option B — React Native (Expo) shared with React web ✅ recommended for real apps
- Rebuild the frontend in **React**; share business logic/hooks with **React Native (Expo)**
  for iOS + Android. Maps via `react-native-maps`/MapLibre on native; Leaflet stays on web.
- **Pros:** true native apps in both stores, push notifications, one language (TS),
  ~70–80% code reuse.
- **Cons:** map layer differs web vs native; app-store review + Apple Developer ($99/yr) &
  Google Play ($25 one-time).
- **Effort:** medium.

### Option C — Native (Swift + Kotlin)
- Only if you need deep platform features (offline geodata, ARKit, heavy map performance).
- **Cons:** 3 codebases (web + iOS + Android). Highest cost. Not recommended now.

**Recommendation:** ship **Option A (PWA)** for the invite-only beta immediately, then invest
in **Option B (Expo + React web)** once product-market fit is validated.

> ⚠️ **Customer app hardening note:** the customer client must be a *separate, minimal build*
> (see §6–7). Do **not** ship the internal admin bundle to customers — it would expose curation
> logic, endpoints, and field names.

### Map rendering across platforms
- **Web:** keep Leaflet, or migrate to **MapLibre GL** for vector tiles + better perf.
- **Native:** **MapLibre Native** or `react-native-maps` — unifies with web on MapLibre.
- Basemap: current CARTO dark tiles work everywhere; consider self-hosted vector tiles at scale.

---

## 4. Roles & owner-curated per-customer sharing

This is the core behavioural change: **the owner decides, per property, which customer(s)
may see it.** Nothing is visible to a customer unless it has been explicitly shared.

### Role model

| Role | Who | Can |
|------|-----|-----|
| **owner** | You | Everything admins can, **plus** manage admins, billing, and global config |
| **admin** | Internal staff | Run searches, curate the ledger, **create shares**, manage customers/invites, configure data feeds, export |
| **customer** | External client | See **only** properties shared with them; read-only map + detail; **no export, no search, no sources feed** |

Owner and admin use the **internal app**; customers use the **customer app**. Role lives in
the JWT (`role` claim) *and* is re-checked server-side against the DB on every request.

### Sharing model (entitlements)

A **share** is an explicit grant linking one ledger entry to one customer (or a customer group),
created by an owner/admin. Customers query only through the shares table — never the raw ledger.

```sql
-- A customer belongs to a customer account (company); users can be grouped.
customers(id, org_id, name, created_at)
customer_users(id, customer_id, user_id, role)          -- customer-side seats

-- The heart of it: which ledger entry is shared with which customer.
property_shares(
  id, ledger_entry_id, customer_id,
  shared_by,                 -- owner/admin user id
  visible_fields jsonb,      -- optional per-share field allowlist (redaction)
  can_view_sources boolean default false,
  note text,                 -- owner's message to the customer about this plot
  shared_at, revoked_at      -- revocation = soft delete; audit-preserved
)
```

**How the owner curates (internal app UI):**
- In the 📒 Ledger, each entry gets a **“Share with…”** action → pick one or more customers.
- Bulk share: select N plots → share with a customer in one action.
- Optional **redaction per share**: hide exact address / owner / sources, or share a
  “teaser” (score + city + why-interesting) while withholding precise coordinates until a deal
  progresses.
- **Revoke** at any time → the plot instantly disappears from that customer’s view.

**What the customer sees (customer app):**
- Only their shared plots, on the map + as cards, with the owner’s note and the (allowed)
  reasons/score. No “search”, no radius tool, no ledger of everything, no CSV.

### Enforcement — defence in depth (all three layers)

1. **Database (authoritative): PostgreSQL Row-Level Security.**
   A customer’s DB role can only `SELECT` ledger entries that have a matching, non-revoked row
   in `property_shares`. Even a bug in the API cannot leak un-shared plots.
   ```sql
   ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
   CREATE POLICY customer_sees_only_shared ON ledger_entries FOR SELECT
     USING (
       current_setting('app.role') = 'internal'
       OR EXISTS (
         SELECT 1 FROM property_shares s
         JOIN customer_users cu ON cu.customer_id = s.customer_id
         WHERE s.ledger_entry_id = ledger_entries.id
           AND s.revoked_at IS NULL
           AND cu.user_id = current_setting('app.user_id')::uuid
       )
     );
   ```
2. **API (scoped endpoints).** Customers use a **different route surface** — e.g.
   `GET /api/portfolio` returns *only* shared plots (joined through `property_shares`, applying
   `visible_fields` redaction). The internal `/api/ledger`, `/api/properties`, `/api/commercial`
   endpoints reject any non-internal JWT.
3. **Client (least-capability build).** The customer app has no UI or code paths for search,
   export, or raw sources — so there is nothing to tamper with client-side.

### Suggested consolidated schema
```sql
users(id, email, name, global_role, created_at, last_login, mfa_enrolled bool)
orgs(id, name, plan)                          -- the internal org (you)
invites(id, email, token_hash, target_type, target_id, role, invited_by, expires_at, accepted_at)
customers(id, org_id, name)
customer_users(id, customer_id, user_id, role)
ledger_entries(id, org_id, plot_key, name, country, lat, lng, address,
               score, tier, for_sale, reasons jsonb, sources jsonb,
               first_seen, last_seen, seen_count)
property_shares(id, ledger_entry_id, customer_id, shared_by, visible_fields jsonb,
                can_view_sources bool, note, shared_at, revoked_at)
audit_log(id, actor_user_id, action, target_type, target_id, ip, user_agent, created_at)
```

---

## 5. MFA enforcement for customers

**All customer accounts must complete MFA — no exceptions, no opt-out.**

### Enforcement (use the managed auth provider’s policy)
- **Clerk / Auth0 / Supabase / Entra External ID** all support **organization/role-scoped MFA
  requirement**. Configure a policy: *role = customer ⇒ MFA required*.
- Preferred factors, in order: **WebAuthn / passkeys** (phishing-resistant) → **TOTP**
  (authenticator app) → SMS only as a last-resort fallback (SIM-swap risk).
- **Enrollment gate:** a customer who has not enrolled a factor lands on a forced-enrollment
  screen and can do nothing else until enrolled.

### Belt-and-braces server check (don’t trust the client)
Even with provider policy, verify on the API side. The provider stamps the JWT with an
authentication-methods claim (`amr`) and/or an MFA flag:
```js
// Customer-scoped middleware
function requireCustomerMFA(req, res, next) {
  const { role, amr = [], mfa } = req.auth;           // from verified JWT
  if (role !== 'customer') return next();
  const satisfied = mfa === true ||
    amr.some(m => ['mfa', 'otp', 'hwk', 'webauthn', 'totp'].includes(m));
  if (!satisfied) return res.status(401).json({ error: 'mfa_required' });
  next();
}
```
- **Step-up MFA** for sensitive actions (e.g. revealing exact coordinates or an owner’s
  contact): require a fresh factor within the last N minutes (`auth_time` check).
- **Short-lived sessions** for customers (e.g. 30–60 min access tokens, refresh with re-check);
  bind sessions to device where the provider supports it.

---

## 6. Preventing data exfiltration

Customers can, by design, *view* the plots shared with them — so the goal is to prevent **bulk
extraction**, **scraping**, and **leakage of the underlying dataset/sources**. Layered controls:

### Minimize what leaves the server
- **Least-data responses.** The customer API returns only fields needed to render — omit raw
  `sources`, upstream URLs, internal `plot_key`, scoring internals, and anything under
  `visible_fields` redaction. Never return the full ledger or “nearby” un-shared plots.
- **No bulk/export for customers.** CSV export and the `/api/ledger` list are **internal-only**.
  Customers have no “download” and no “export all”.
- **Coordinate fuzzing / staged reveal.** Optionally share an approximate location (rounded
  lat/lng or a zone) until a deal advances; reveal exact coordinates only via a step-up-MFA,
  audited action.
- **Server-side rendering of sensitive values** (or signed, short-lived, watermarked map tiles/
  images) so precise data isn’t sitting in a JSON payload the browser can dump.

### Make scraping expensive and detectable
- **Per-user & per-IP rate limits** (Redis / gateway) sized to human browsing, not bulk pulls.
- **Anomaly detection & alerts** on the audit log (e.g. a customer viewing 500 detail records
  in a minute) → auto-throttle / lock + notify owner.
- **Pagination caps** and no “return everything” query params.

### Deter & trace leaks
- **Per-customer watermarking** — overlay the customer’s name/email/timestamp on detail views,
  exported PDFs (if ever allowed), and map snapshots, so a screenshot is traceable.
- **Comprehensive audit log** — every view/reveal/share/login with user, IP, and user-agent;
  retained and reviewable. Ties a leak back to an account.
- **Legal layer** — click-through NDA/ToS on customer onboarding; watermark + audit make it
  enforceable.

### Platform DLP / hardening
- Serve over HTTPS only; strict **CORS allowlist** (customer app origin only); **CSP** headers.
- **Disable source maps** in the customer build; no verbose errors/stack traces to clients.
- Move **all API credentials** (ENTSO-E token, etc.) server-side into a **secrets manager** —
  never in any client bundle or in-memory-from-browser store (today’s `/api/credentials` flow
  must be removed for customers).
- Optional enterprise DLP: SSO + conditional access, download restrictions, watermarked email.

> **Reality check:** anyone who can *see* data can, in theory, retype or screenshot it. These
> controls prevent *bulk automated* exfiltration and make manual leakage low-volume, traceable,
> and legally actionable — which is the achievable, industry-standard goal.

---

## 7. Protecting the source code & business logic (IP)

The scoring model, data-source integrations, and curation logic are the product’s IP. Keep them
off the client entirely.

### Keep logic server-side
- **All scoring, data-source calls, and curation run only in the backend.** The client renders
  results; it never contains the algorithm, API keys, or source endpoints. (Today `scoring.js`
  is already server-side — keep it that way; never port it to the client.)
- The **customer app is a thin renderer** — a leaked customer bundle reveals no algorithm and no
  data feeds, only generic view code.

### Protect what does ship to the browser
- **No source maps** in production customer/admin builds; **minify + obfuscate** (e.g. esbuild/
  terser, optionally `javascript-obfuscator` for the customer bundle).
- **No secrets in any bundle** — enforce with a CI secret-scanner (gitleaks/trufflehog) that
  fails the build if a token appears in client code.
- **Split bundles** — the internal admin app (with curation UI + endpoints) is deployed to an
  access-restricted host (VPN/SSO/IP-allowlist), **never** to customers.

### Protect the repository & infrastructure
- **Private repos**, branch protection, least-privilege collaborator access, signed commits.
- **CI/CD secret scanning + dependency/SAST scanning** (CodeQL, Dependabot).
- **Secrets in a manager** (Doppler / Vault / cloud KMS), injected at deploy — not in `.env`
  committed anywhere.
- **Least-privilege DB roles**: the API’s customer connection uses a role that only sees data
  through RLS; no `SELECT *` on raw tables; no direct DB access from clients.
- **Infrastructure access** behind SSO + MFA; production admin surface on a private network /
  bastion, IP-allowlisted.

---


## 8. Suggested phased roadmap

| Phase | Goal | Work |
|-------|------|------|
| **0 — now** | Ledger persistence ✅ | Done: `data/ledger.json`, sources + reasons, CSV export |
| **1** | Multi-user backend | Postgres+PostGIS with **RLS**, move ledger/properties to DB, add auth (Clerk/Supabase), invites, roles (owner/admin/customer) |
| **2** | **Sharing & MFA** | `property_shares` + curation UI, `/api/portfolio` customer endpoint, **enforced customer MFA**, audit log |
| **3** | **Anti-exfiltration & IP** | Split internal vs customer builds, least-data responses, rate limits/anomaly alerts, watermarking, server-side secrets, no source maps, obfuscation |
| **4** | Web apps v2 | Internal admin app + locked-down customer app (React/Vite, MapLibre); customer app shipped as **PWA** |
| **5** | Mobile apps | **Expo (React Native)** iOS + Android customer app (MFA, push for newly-shared plots) |
| **6** | Scale/polish | Vector tiles, staged coordinate reveal, deal workflow, saved searches (internal), alerts, team workspaces |

---

## 9. Concrete next steps (low-risk, incremental)

1. **DB migration:** introduce PostgreSQL+PostGIS **with Row-Level Security**; write a small
   adapter so `ledger.js` uses Postgres instead of the JSON file (persistence is already isolated
   behind `load`/`flush`).
2. **Auth + roles + MFA:** wire **Clerk/Auth0/Supabase** in front of `/api`; add JWT middleware
   with `owner/admin/customer` roles and a **customer-MFA-required policy** + server-side check.
3. **Sharing MVP:** `customers`, `customer_users`, `property_shares` tables; a **“Share with…”**
   action in the internal Ledger UI; a read-only **`/api/portfolio`** endpoint for customers.
4. **Split the front end:** build/deploy the **customer app separately** (thin, read-only, no
   search/export, no source maps, obfuscated) from the internal admin app.
5. **Harden:** move ENTSO-E / API tokens server-side; add `express-rate-limit` + Redis + anomaly
   alerts; per-customer watermarking; full audit logging; CSP + CORS allowlist.

> The current codebase is well-positioned: the API is isolated under `src/routes/api.js`,
> services are modular, **scoring already runs server-side**, and the ledger separates its
> persistence layer (`load`/`flush`) — so adding RLS-backed sharing and swapping the JSON file
> for Postgres is a contained change.
