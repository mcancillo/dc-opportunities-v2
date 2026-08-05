# Google Play — Submission Runbook

> Prerequisites you (the account owner) must provide: a **Google Play Console**
> account (one-time $25), and a Google Cloud **service account** JSON key for
> automated `eas submit`.

## 1. One-time account setup
1. Create a Play Console account → https://play.google.com/console/signup
2. **Create app**:
   - App name: **DC Opportunities**
   - Default language: English (United States)
   - App or game: **App**
   - Free or paid: **Free**
3. Package name is **com.dcopportunities.app** (locked once the first build is
   uploaded — must match `app.json` `android.package`).

## 2. Service account for automated submit
1. In the linked **Google Cloud project** → *IAM & Admin → Service Accounts* →
   create one, then create a **JSON key**. Save it as
   `mobile/play-service-account.json` (already git-ignored).
2. In **Play Console → Users and permissions → Invite new users**, add the
   service-account email and grant **Release** permissions (Admin for the app).
3. Point `eas.json` at the key:
```jsonc
"submit": {
  "production": {
    "android": {
      "serviceAccountKeyPath": "./play-service-account.json",
      "track": "internal"          // start on the internal track, promote later
    }
  }
}
```

## 3. Build + submit
```bash
eas build   --platform android --profile production   # produces an .aab
eas submit  --platform android --profile production
```
EAS generates and stores the **upload keystore** for you. Retrieve the signing
**SHA-1** with `eas credentials` and add the Entra redirect URI:
`msauth://com.dcopportunities.app/<url-encoded-base64-sha1>`.

## 4. Play Console — required before production release
- **Privacy policy URL** (required) — see `metadata.md`.
- **Data safety** form: collects *Personal info (name, email via Entra)* and
  *App info/identifiers*; encrypted in transit; **not shared**, **no tracking**.
- **App content**: target audience (18+), ads = No, content rating
  questionnaire (→ Everyone), news app = No.
- Store listing: short + full description, app icon (512×512), feature graphic
  (1024×500), phone screenshots (see `metadata.md`).
- **App access**: because sign-in is **invite-only**, add *All or some
  functionality is restricted* and provide **demo Entra credentials** so the
  review team can sign in — otherwise the release is rejected.

## 5. Release
Start on the **Internal testing** track (fastest, add tester emails), validate,
then **Promote to Production**. First production review can take a few days.
