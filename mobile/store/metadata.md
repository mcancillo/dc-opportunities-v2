# Store Listing Metadata & Assets Checklist

Shared copy/metadata for both stores. Keep the tone factual — this is an
internal/enterprise, invite-only tool.

## Names
- **App name:** DC Opportunities
- **Subtitle (iOS, 30 chars):** Data center site intelligence
- **Short description (Play, 80 chars):** Map data centers, subsea cables, fiber & real-estate opportunities offline.

## Full description
```
DC Opportunities is an invite-only intelligence tool for data center site
selection and digital-infrastructure planning.

Explore an interactive map of:
• Existing data centers
• Subsea cables and cable landing points
• Fiber rings and backbone routes
• Industrial and commercial real-estate opportunities

Everything works offline: maps and layer data are cached on your device, so the
field team can review sites with no connectivity.

Access requires a Microsoft Entra ID invitation. Sign-in is protected by your
organization's multi-factor authentication and conditional-access policies.
```

## Keywords (iOS, 100 chars, comma-separated)
`data center,datacenter,fiber,subsea cable,real estate,infrastructure,site selection,map,offline`

## Category
- Primary: **Business**
- Secondary (iOS): **Navigation**

## Support / URLs
- **Support URL:** (org support page or mailto)
- **Marketing URL:** (optional)
- **Privacy Policy URL:** REQUIRED on both stores. Must state: Microsoft Entra ID
  is used for authentication; the app stores name/email from the signed-in
  account and caches map/site data locally on the device; data is transmitted
  only to the organization's backend over HTTPS; no third-party tracking/ads.

## Age rating
4+ / Everyone. No objectionable content.

## Privacy declarations (both stores)
| Data | Collected | Purpose | Shared | Tracking |
|------|-----------|---------|--------|----------|
| Name, email (Entra) | Yes | App functionality (auth) | No | No |
| Device identifiers | Yes | App functionality | No | No |
| Location (map view only) | Optional | App functionality | No | No |

## Required visual assets
| Asset | Spec | Store |
|-------|------|-------|
| App icon | 1024×1024 PNG (no alpha) | iOS |
| App icon | 512×512 PNG (32-bit, alpha ok) | Play |
| Feature graphic | 1024×500 PNG/JPG | Play |
| iPhone 6.7" screenshots | 1290×2796, 3–10 imgs | iOS |
| iPhone 6.5" screenshots | 1242×2688 | iOS |
| Phone screenshots | 1080×1920+ (min 2) | Play |

### Suggested screenshot shot list
1. Map with all layers + legend
2. Layer toggle panel (data centers + subsea cables on)
3. Feature detail sheet (a data center or property)
4. Offline & Account screen showing "cached for offline"
5. Sign-in screen (Microsoft)

> The `assets/` PNGs in this repo are **placeholders**. Replace `icon.png`,
> `adaptive-icon.png`, `splash.png` and `favicon.png` with branded artwork
> before release, and capture real screenshots from a device/simulator.

## App Review demo account (CRITICAL for both stores)
Because the app is invite-only, reviewers cannot get past sign-in without a
working account. Invite a dedicated **reviewer test user** into the Entra tenant,
assign it to the mobile app, and put its credentials in:
- iOS: App Store Connect → App Review Information → Sign-In Information
- Play: Play Console → App content → App access → provide credentials
Without this, expect rejection (Apple Guideline 2.1 / Google App access policy).
