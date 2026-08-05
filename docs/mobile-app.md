# DC Opportunities — Mobile App Documentation

Cross-platform mobile front end (iOS App Store + Google Play) for the DC
Opportunities backend. Built with **Expo (React Native + TypeScript)**,
**MapLibre GL Native** (offline maps) and **Microsoft Entra ID** sign-in
(MSAL-compatible OAuth2 auth-code + PKCE). Source lives in [`mobile/`](../mobile).

- Source & dev guide: [`mobile/README.md`](../mobile/README.md)
- Store runbooks: [`mobile/store/`](../mobile/store) (Apple, Google, metadata)
- Identity/security plan: [`.azure/deployment-plan.md`](../.azure/deployment-plan.md) (mobile client section)

---

## 1. What it does

- **Invite-only sign-in** with Microsoft Entra ID (enforced by the app
  registration's `appRoleAssignmentRequired` + user assignment).
- Renders the same intelligence layers as the web app on an interactive map:
  **data centers, subsea cables, cable landing points, fiber rings/backbone,
  industrial & commercial real-estate opportunities.**
- **Offline caching**: vector layers are stored in on-device SQLite and the
  base-map tiles are downloaded as a MapLibre **offline pack**, so the app is
  fully usable with no connectivity.

---

## 2. Identity & security

| Item | Value |
|------|-------|
| Tenant | `16b3c013-d300-468d-ac64-7eda0820b6d3` (fdpo.onmicrosoft.com) |
| Mobile app (public client) | `3004922c-9d02-4d3e-8b22-8dd90c4bf78d` (SP `2f9d36ed-75eb-455d-8acc-5a47e6a2cc93`) |
| API scope | `api://0934e54f-36e2-4e8d-8aec-574895e062ef/access_as_user` |
| Bundle ID / package | `com.dcopportunities.app` |
| Redirect URIs | `msauth.com.dcopportunities.app://auth`, `com.dcopportunities.app://auth`, `https://auth.expo.io/@mcancillo/dc-opportunities-mobile` |

**Token flow.** The app acquires an access token for the API scope via PKCE.
App Service **Easy Auth** validates the Bearer token (audience = the Easy Auth
app). Because the mobile client is **pre-authorized** on the API app, there is no
consent prompt for the API scope, and **no separate API gateway is required**.

**Invite-only enforcement (two layers).**
1. Mobile SP `appRoleAssignmentRequired = true` — sign-in itself requires
   assignment. Unassigned users get `AADSTS50105`, which the app renders as the
   *"Access is invite-only"* screen.
2. Easy Auth resource app (`0934e54f`) also has `appRoleAssignmentRequired = true`
   — the API rejects tokens from unassigned users even if sign-in were bypassed.

Currently assigned admins: `macancil@microsoft.com` (`152ac45e-…`) and
`mcancillo@hotmail.com` (`75aa9cc7-…`).

**MFA.** Inherited from the tenant Conditional Access policy + Microsoft
Authenticator auth strength (runbook in [`.azure/ca-mfa/`](../.azure/ca-mfa/README.md)).

### Inviting a new user
1. Invite the user as a B2B guest into `fdpo.onmicrosoft.com` (or add the member).
2. Assign them to **both** service principals (mobile `2f9d36ed-…` and Easy Auth
   `e464d1c7-…`) — default access role `00000000-0000-0000-0000-000000000000`.
3. Ensure they are in scope of the Conditional Access / MFA policy.

---

## 3. Develop locally

```bash
cd mobile
npm install
npx expo start          # requires a dev build (MapLibre needs the dev client,
                        # not Expo Go): eas build --profile development
npm run typecheck       # npx tsc --noEmit — must be clean
```

Runtime IDs/URLs live in [`mobile/app.json`](../mobile/app.json) → `expo.extra`.

---

## 4. Build & submit to the stores (EAS — no Mac required)

> **Manual steps** — these require accounts/credentials that must be provided by
> the account owner; they cannot be automated from CI without secrets.

### 4.1 One-time project setup
```bash
npm install -g eas-cli
eas login
eas build:configure     # writes extra.eas.projectId into app.json
```

### 4.2 Build
```bash
eas build --platform ios     --profile production
eas build --platform android --profile production
```
EAS generates and stores signing certs/keystores for you. After the **first
Android build**, retrieve the signing SHA-1 with `eas credentials` and add the
redirect URI `msauth://com.dcopportunities.app/<url-encoded-base64-sha1>` to the
mobile app registration.

### 4.3 Submit
Fill the `REPLACE_WITH_*` placeholders in [`mobile/eas.json`](../mobile/eas.json)
(`submit.production`), then:
```bash
eas submit --platform ios     --profile production   # -> App Store Connect
eas submit --platform android --profile production   # -> Google Play (internal track)
```

---

## 5. Required manual steps checklist

These cannot be completed from the build environment (no dev-account
credentials / Mac / tenant-admin role). Owner action required:

- [ ] **Apple Developer Program** membership + an **App Store Connect** app
      record (bundle `com.dcopportunities.app`). Fill `appleId`, `ascAppId`,
      `appleTeamId` in `eas.json`. See [`mobile/store/apple-app-store.md`](../mobile/store/apple-app-store.md).
- [ ] **Google Play Console** account + a **service-account JSON key**
      (`mobile/play-service-account.json`, git-ignored) with Release permission.
      See [`mobile/store/google-play.md`](../mobile/store/google-play.md).
- [ ] Run `eas build:configure` to populate `extra.eas.projectId` in `app.json`.
- [ ] Add the **Android signing SHA-1** redirect URI after the first build.
- [ ] Create a **reviewer demo Entra account**, assign it to both SPs, and supply
      its credentials in App Store Connect (App Review Information) and Play
      Console (App content → App access). **Invite-only apps are rejected without
      this.**
- [ ] Provide/host a **Privacy Policy URL** (required by both stores) and complete
      the App Privacy / Data safety questionnaires. See [`mobile/store/metadata.md`](../mobile/store/metadata.md).
- [ ] Replace placeholder `assets/` PNGs (`icon`, `adaptive-icon`, `splash`,
      `favicon`) with branded artwork and capture real store screenshots.
- [ ] When a tenant admin enforces the Conditional Access policy, **add the mobile
      appId `3004922c-…` to the policy's target apps**.

---

## 6. Project layout

```
mobile/
  app.json            Expo config (bundle IDs, scheme, Entra IDs in extra{})
  eas.json            EAS build & submit profiles
  index.ts / App.tsx  Entry + auth gate (SignIn / NotInvited / MainTabs)
  src/
    config.ts         Entra + API + map config (reads app.json extra)
    auth/             useAuth (PKCE), tokenStore (SecureStore), AuthContext
    api/              Typed API client (Bearer token) + types
    cache/            SQLite store (db.ts), sync engine (sync.ts), geo helpers
    screens/          SignIn, NotInvited, Map, Settings/Offline
    components/       LayerToggle, OfflineBanner
    navigation/       Bottom-tab navigator
  store/              Apple + Google submission runbooks and listing metadata
```
