# Azure Deployment Plan — DC Opportunities v2 (Azure-Native)

> **Status:** Deployed

Generated: 2026-07-22 · Deployed: 2026-07-22 (Sweden Central)

> **Deployment Result (2026-07-22):** ✅ Live. All 14 resources provisioned to `rg-dcopps-prod` in **Sweden Central** (moved from West Europe due to a subscription SQL provisioning restriction there). Both App Services deployed and returning HTTP 200 via Front Door.
>
> | Endpoint | URL | Health |
> |----------|-----|--------|
> | Admin | https://admin-m4b2vdcrzbbii-bpcvbueqhfbjbeef.b01.azurefd.net | ✅ 200 |
> | Customer | https://customer-m4b2vdcrzbbii-hhhtb7dfc0ecf5e9.b01.azurefd.net | ✅ 200 |
>
> SQL: `sql-m4b2vdcrzbbii.database.windows.net` / db `dcopportunities` (Entra-only auth, private endpoint). Both app managed identities verified with **Key Vault Secrets User** + **Storage Blob Data Contributor**.
>
> **SCM note:** `scmIpSecurityRestrictionsUseMain` set to `false` so the Kudu deploy endpoint (Entra/publishing-auth protected) is reachable for `azd deploy`; the runtime app site remains locked to Front Door only. Basic publishing auth is disabled on Kudu.

Implements [`docs/azure-native-architecture-proposal.md`](../docs/azure-native-architecture-proposal.md).

---

## 1. Project Overview

**Goal:** Deploy DC Opportunities v2 as an internet-facing, Azure-native solution using
**Azure App Service (Web App)** and **Azure SQL Database**, with Zero Trust, dual identity
(Entra + C2B), Microsoft Authenticator MFA, and a **$300/month** cost cap.

**Path:** Modernize Existing (file-backed single app → App Service + Azure SQL)

---

## 2. Requirements

| Attribute | Value |
|-----------|-------|
| Classification | Production-lite / internal + external |
| Scale | Small |
| Budget | Cost-Optimized (hard cap $300/month) |
| **Subscription** | 6cbb5372-2516-4048-b672-a3e0a36fac8b (MCAPS-Hybrid-REQ-105009-2024-macancil) ✅ |
| **Location** | West Europe (westeurope) ✅ |

**Admin identities:** `macancil@microsoft.com` (workforce Entra, SQL Entra admin) and
`mcancillo@hotmail.com` (MSA federated via Entra External ID) — both mapped to Admin role.
Workforce admin object ID: `152ac45e-e0f3-4c02-96bc-4fe700f205cd`, tenant `16b3c013-d300-468d-ac64-7eda0820b6d3`.

---

## 3. Components Detected

| Component | Type | Technology | Path |
|-----------|------|------------|------|
| dc-opportunities | API + static + IAM | Node.js 20 / Express 4 | `.` (server.js, src/, public/) |
| Data (ledger, iam, sources) | File store → SQL | JSON files | `data/*.json` |

---

## 4. Recipe Selection

**Selected:** AZD (Bicep, modular)

**Rationale:** Existing simple Node app, no prior IaC. azd provisions the full topology
(App Service ×2, SQL, Front Door, Key Vault, Storage, budget) and deploys the same codebase
to the `admin` and `customer` sites.

---

## 5. Architecture

**Stack:** App Service (Linux) + Azure SQL + Azure Front Door

### Service Mapping

| Component | Azure Service | SKU |
|-----------|---------------|-----|
| admin web app | App Service (Linux, Node 20) | Plan B2 |
| customer web app | App Service (Linux, Node 20) | shares plan B2 |
| Internet ingress | Azure Front Door Standard + WAF | Standard |
| Data store | Azure SQL Database (serverless, spatial, RLS) | GP_S_Gen5_2, auto-pause |
| Secrets | Azure Key Vault (RBAC, private endpoint) | Standard |
| Cache/exports | Azure Blob Storage (private endpoint) | Standard LRS |
| Monitoring | Log Analytics + Application Insights | PAYG, 30-day |
| Cost cap | Consumption Budget | $300/mo + alerts |

### Zero-Trust Controls
- Front Door + WAF only public ingress; App Services restricted to `AzureFrontDoor.Backend` service tag.
- SQL/Key Vault/Storage: `publicNetworkAccess: Disabled`, Private Endpoints + private DNS, VNet integration.
- SQL **Entra-only auth** (`azureADOnlyAuthentication: true`), no SQL login/password.
- System-assigned managed identity per app; no secrets in app settings.
- `httpsOnly`, TLS 1.2+, FTPS disabled, SCM inherits main restrictions.
- Easy Auth (post-deploy `AUTH_CLIENT_ID`) requires authentication; MFA via Conditional Access + External ID user flow (Microsoft Authenticator).

### Post-Deploy (identity-plane) — Progress 2026-07-22

**Approach chosen:** Option A — B2B guest invitation into the existing workforce tenant `fdpo.onmicrosoft.com` (single Entra app registration, both admins under one tenant). Full External ID / CIAM (C2B) for the customer side deferred to a later phase.

1. ✅ **B2B guest invite** — `mcancillo@hotmail.com` invited as guest (object ID `75aa9cc7-d02d-4de8-9783-b0ba3b6ed579`, UPN `mcancillo_hotmail.com#EXT#@fdpo.onmicrosoft.com`). **Status: PendingAcceptance — user must redeem the invitation email.** `macancil@microsoft.com` already a guest (object ID `152ac45e-...`).
2. ✅ **Entra app registration + Easy Auth** — App reg `DC Opportunities v2 (Easy Auth)`, **appId `0934e54f-36e2-4e8d-8aec-574895e062ef`**, SP `e464d1c7-...`. Redirect URIs registered for both Front Door hostnames. `AUTH_CLIENT_ID` set; Easy Auth enabled on both apps (`requireAuthentication`, `/health` excluded). **`appRoleAssignmentRequired = true`; both admins assigned.** Verified: unauthenticated root → 302 login; redirect_uri correctly uses the Front Door host (via `httpSettings.forwardProxy.convention: Standard`).
3. ⛔ **Conditional Access / Microsoft Authenticator MFA** — **BLOCKED: requires a tenant admin** (Global / Security / Conditional Access Administrator) in `fdpo.onmicrosoft.com`. The deployment account is a guest with no directory role. **Ready-to-run runbook + JSON provided in [`.azure/ca-mfa/`](ca-mfa/README.md)** (custom auth strength limited to Microsoft Authenticator, CA policy targeting the app + both users, report-only first then enforce).
4. ⏸️ **SQL `CREATE USER FROM EXTERNAL PROVIDER` + RLS** — **DEFERRED.** The app currently uses local JSON files, not Azure SQL (SQL data migration is a future phase). SQL has `publicNetworkAccess: Disabled` (private endpoint only), so grants must be run from inside the VNet (or via a temporary firewall rule) as the Entra SQL admin once the app targets SQL.
5. ◻️ **Customer-side C2B / External ID** — deferred; customer app is currently locked to the same assigned admins (interim hardening) until a CIAM tenant + user flow is stood up.

### Mobile client (iOS + Android) — added 2026-08-05

Invite-only cross-platform app (`mobile/`, Expo + MapLibre) that reuses this same identity plane. Caches map layers + base-map tiles for offline field use.

| Item | Value |
|------|-------|
| App registration | `DC Opportunities Mobile` — appId **`3004922c-9d02-4d3e-8b22-8dd90c4bf78d`**, SP `2f9d36ed-75eb-455d-8acc-5a47e6a2cc93` (public/native client, PKCE) |
| Bundle ID / package | `com.dcopportunities.app` |
| Redirect URIs | `msauth.com.dcopportunities.app://auth`, `com.dcopportunities.app://auth`, `https://auth.expo.io/@mcancillo/dc-opportunities-mobile` |
| API scope | `api://0934e54f-36e2-4e8d-8aec-574895e062ef/access_as_user` (scope id `505ef247-8911-425e-b81d-798dd4b927d7`), mobile client **pre-authorized** on the Easy Auth app → no consent prompt |
| Token flow | OAuth2 auth-code + PKCE → access token audience = Easy Auth app → **App Service Easy Auth validates mobile tokens natively** (no separate API gateway) |

**Invite-only enforcement (two layers):**
1. ✅ Mobile SP `appRoleAssignmentRequired = true` — sign-in itself requires assignment. Both admins assigned (`Marco Cancillo` 152ac45e-…, `mcancillo` 75aa9cc7-…). Unassigned users get `AADSTS50105`, which the app renders as the *"Access is invite-only"* screen.
2. ✅ Easy Auth resource app `0934e54f` also has `appRoleAssignmentRequired = true` with the same two users assigned — the API rejects tokens from unassigned users even if sign-in were bypassed.

**MFA:** inherited from the tenant Conditional Access + Microsoft Authenticator auth strength (runbook in [`.azure/ca-mfa/`](ca-mfa/README.md)); the mobile client is covered by the same CA policy targeting these users. Add the mobile appId to the CA policy's target apps when the policy is enforced by a tenant admin.

**Store submission:** documented runbooks in [`mobile/store/`](../mobile/README.md) (Apple App Store + Google Play). Requires Apple Developer + Google Play Console accounts and a **reviewer demo Entra account** (invite-only apps are rejected without one). Cannot be published from this environment (no dev-account credentials).

---

## 6. Provisioning Limit Checklist

### Phase 1 & 2: Inventory + Capacity (West Europe)

| Resource Type | Deploy | Total After | Limit/Quota | Notes |
|---------------|:------:|:-----------:|-------------|-------|
| Microsoft.Web/serverfarms | 1 | 2 | 100 per RG/region | Resource Graph: 1 existing |
| Microsoft.Web/sites | 2 | 3 | bound by plan | Resource Graph: 1 existing |
| Microsoft.Sql/servers | 1 | +1 | 250 per sub/region | Official docs |
| Microsoft.Sql/servers/databases | 1 | +1 | per server | Serverless GP |
| Microsoft.Cdn/profiles (Front Door Std) | 1 | +1 | 500 per sub | Official docs |
| Microsoft.KeyVault/vaults | 1 | +1 | soft | — |
| Microsoft.Storage/storageAccounts | 1 | +1 | 250 per region | — |
| Microsoft.Network/virtualNetworks | 1 | +1 | 1000 per sub | — |
| Microsoft.Network/privateEndpoints | 3 | +3 | soft | KV, SQL, Storage |
| Microsoft.OperationalInsights/workspaces | 1 | +1 | soft | — |
| Microsoft.Insights/components | 1 | +1 | soft | — |
| Microsoft.Consumption/budgets | 1 | 1 | soft | $300/mo |

**Status:** ✅ All resources within limits (App Service confirmed via Resource Graph; others below documented service limits).

---

## 7. Execution Checklist

### Phase 1: Planning
- [x] Analyze workspace
- [x] Gather requirements
- [x] Confirm subscription and location
- [x] Prepare resource inventory
- [x] Validate capacity
- [x] Scan codebase
- [x] Select recipe
- [x] Plan architecture
- [ ] **User approved this plan**

### Phase 2: Execution
- [x] Generate infrastructure files (main.bicep + 7 modules)
- [x] azure.yaml (admin + customer services)
- [x] main.parameters.json
- [x] Bicep compiles (`bicep build` OK)
- [ ] Configure Easy Auth client ID (post-deploy)
- [x] Update plan status to "Ready for Validation"

### Phase 3: Validation
- [ ] Invoke azure-validate skill
- [ ] All checks pass
- [ ] Update status to "Validated"

### Phase 4: Deployment
- [ ] Invoke azure-deploy skill
- [ ] Report endpoint URLs
- [ ] Update status to "Deployed"

---

## 8. Files Generated

| File | Purpose | Status |
|------|---------|--------|
| `.azure/deployment-plan.md` | This plan | ✅ |
| `azure.yaml` | AZD config (admin + customer) | ✅ |
| `infra/main.bicep` | Subscription-scope entrypoint | ✅ |
| `infra/main.parameters.json` | AZD parameters | ✅ |
| `infra/modules/monitoring.bicep` | Log Analytics + App Insights | ✅ |
| `infra/modules/network.bicep` | VNet + subnets | ✅ |
| `infra/modules/keyvault.bicep` | Key Vault + private endpoint | ✅ |
| `infra/modules/storage.bicep` | Blob storage + private endpoint | ✅ |
| `infra/modules/sql.bicep` | Azure SQL serverless + private endpoint | ✅ |
| `infra/modules/appservice.bicep` | Plan + admin/customer apps + Easy Auth | ✅ |
| `infra/modules/frontdoor.bicep` | Front Door Standard + WAF | ✅ |
| `infra/modules/budget.bicep` | $300 budget + alerts | ✅ |

---

## 9. Validation Proof

| Check | Command | Result | Timestamp |
|-------|---------|--------|-----------|
| Bicep compile | `bicep build infra/main.bicep` | ✅ Pass (benign warnings only) | 2026-07-22 13:35 |
| Auth | `azd auth login` / az CLI credential | ✅ macancil@microsoft.com | 2026-07-22 13:39 |
| Env | `azd env new dcopps-prod` (sub + westeurope) | ✅ Set | 2026-07-22 13:37 |
| Provision preview | `azd provision --preview --no-prompt` | ✅ 14 resources planned, ARM accepted | 2026-07-22 13:39 |
| Build | `npm install` + `node --check` | ✅ up to date, syntax OK | 2026-07-22 13:40 |
| Package | `azd package --no-prompt` | ✅ admin + customer packaged | 2026-07-22 13:41 |

**Role Assignment Verification:** ✅ Verified — added `infra/modules/rbac.bicep` granting each app's system-assigned identity **Key Vault Secrets User** (on the vault) and **Storage Blob Data Contributor** (on the storage account), least-privilege scoped. SQL data-plane access (`CREATE USER FROM EXTERNAL PROVIDER`) remains a post-deploy step (§5).

**Validated by:** azure-validate skill · **Timestamp:** 2026-07-22 13:41

## 9. Next Steps

> Current: Deployed — live in Sweden Central

1. ✅ Validated (azure-validate)
2. ✅ Deployed (azure-deploy) — Sweden Central
3. Complete post-deploy identity/MFA/SQL steps (§5): Entra External ID (C2B) tenant, federate `mcancillo@hotmail.com`, app registration + `AUTH_CLIENT_ID` app setting to enable Easy Auth, Conditional Access + MS Authenticator MFA, and `CREATE USER FROM EXTERNAL PROVIDER` grants for both app identities in SQL.
