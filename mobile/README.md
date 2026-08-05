# DC Opportunities — Mobile App (iOS + Android)

Cross-platform mobile front end for the DC Opportunities backend. Built with
**Expo (React Native + TypeScript)**, **MapLibre GL Native** (offline maps) and
**Entra ID sign-in** (MSAL-compatible OAuth2 auth-code + PKCE). Ships to the
**Apple App Store** and **Google Play** from one codebase.

## What it does
- Signs users in with Microsoft Entra ID — **invite-only** (enforced by the app
  registration's `appRoleAssignmentRequired` + B2B invitation).
- Renders the same intelligence layers as the web app on an interactive map:
  **data centers, subsea cables, cable landing points, fiber rings/backbone,
  industrial & commercial real-estate opportunities.**
- **Caches maps and data for offline use**: vector layers are stored in SQLite
  and the base-map tiles are downloaded as a MapLibre **offline pack**, so the
  app is fully usable with no connectivity.

## Project layout
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
```

## Identity / security integration
| Item | Value |
|------|-------|
| Tenant | `16b3c013-d300-468d-ac64-7eda0820b6d3` (fdpo.onmicrosoft.com) |
| Mobile app (public client) | `3004922c-9d02-4d3e-8b22-8dd90c4bf78d` |
| API scope | `api://0934e54f-36e2-4e8d-8aec-574895e062ef/access_as_user` |
| Bundle ID / package | `com.dcopportunities.app` |
| Redirect URIs | `msauth.com.dcopportunities.app://auth`, `com.dcopportunities.app://auth` |

Flow: the app acquires an access token for the API scope via PKCE. App Service
**Easy Auth** validates the Bearer token (audience = the Easy Auth app). Because
the mobile client is **pre-authorized** on the API app, no consent prompt is
needed for the API scope. **Invite-only** is enforced centrally: unassigned
users get `AADSTS50105`, which the app surfaces as the *"Access is invite-only"*
screen.

> Android note: after the first EAS build, add the **Android signing-key SHA-1
> hash** redirect URI to the mobile app registration:
> `msauth://com.dcopportunities.app/<url-encoded-base64-sha1>`
> (get it from `eas credentials`).

## Develop
```bash
cd mobile
npm install
npx expo start          # scan QR with a dev build (MapLibre needs a dev client,
                        # not Expo Go). Build one with: eas build --profile development
npm run typecheck
```

## Build for the stores (EAS — no Mac required)
```bash
npm install -g eas-cli
eas login
eas build:configure                 # sets extra.eas.projectId in app.json
eas build --platform ios --profile production
eas build --platform android --profile production
```

## Submit
Fill the `REPLACE_WITH_*` placeholders in `eas.json` (`submit.production`) and
provide store credentials, then:
```bash
eas submit --platform ios --profile production        # -> App Store Connect
eas submit --platform android --profile production     # -> Google Play (internal track)
```
See `store/` for the full per-store submission runbooks and metadata checklists.

## Configuration
Runtime IDs/URLs live in `app.json` → `expo.extra`. To point at a different
backend or map style, edit those values (or override per-build with an
`app.config.ts`). Placeholders to replace before release:
`extra.eas.projectId`, and the `submit.production` block in `eas.json`.
