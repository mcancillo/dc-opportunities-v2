# Apple App Store — Submission Runbook

> Prerequisites you (the account owner) must provide — the agent cannot create
> these: an **Apple Developer Program** membership ($99/yr), an **Apple ID** with
> two-factor auth, and an **App Store Connect** app record.

## 1. One-time account setup
1. Enroll in the Apple Developer Program → https://developer.apple.com/programs/
2. In **App Store Connect** → **Apps** → **+** → **New App**:
   - Platform: iOS
   - Name: **DC Opportunities**
   - Primary language: English (U.S.)
   - Bundle ID: **com.dcopportunities.app** (register it first under
     *Certificates, Identifiers & Profiles → Identifiers* if not listed)
   - SKU: `dc-opportunities-ios`
3. Note these three values for `eas.json`:
   - **Apple ID** (login email) → `appleId`
   - **App Store Connect App ID** (the numeric `App ID` on the app's App
     Information page) → `ascAppId`
   - **Apple Team ID** (Membership page) → `appleTeamId`

## 2. Fill eas.json
```jsonc
"submit": {
  "production": {
    "ios": {
      "appleId": "REPLACE_WITH_APPLE_ID_EMAIL",
      "ascAppId": "REPLACE_WITH_APP_STORE_CONNECT_APP_ID",
      "appleTeamId": "REPLACE_WITH_APPLE_TEAM_ID"
    }
  }
}
```

## 3. Build + submit
```bash
eas build   --platform ios --profile production   # EAS manages signing certs
eas submit  --platform ios --profile production   # uploads the .ipa
```
`eas build` will offer to generate the Distribution Certificate and Provisioning
Profile for you (recommended) — no Mac or manual Keychain work required.

## 4. App Store Connect — before you can submit for review
- **Privacy policy URL** (required). Host one describing Entra sign-in + offline
  cache. See `metadata.md`.
- **App Privacy** questionnaire: declare *Contact Info (email/name via Entra)*
  and *Identifiers*; data is used for **App Functionality** and **not** for
  tracking.
- **Sign-in required** → provide a **demo Entra account** in *App Review
  Information* (App Review must be able to log in — invite an internal reviewer
  test user and supply the credentials, or Apple will reject the invite-only
  app). This is the single most common rejection cause for gated apps.
- Screenshots: 6.7" and 6.5" iPhone (see `metadata.md` for the shot list).
- Category: **Business** (secondary: Navigation).
- Age rating: complete questionnaire (no objectionable content → 4+).

## 5. Submit for review
Select the uploaded build under the version → **Add for Review** → **Submit**.
Typical review: 24–48 h. Address any *Guideline 2.1 / 4.0* feedback about the
invite-only login by pointing reviewers at the supplied demo account.
