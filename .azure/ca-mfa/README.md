# Conditional Access — Microsoft Authenticator MFA runbook

Enforces MFA (Microsoft Authenticator only) on the **DC Opportunities v2** Easy Auth app
for the two admin users. Requires **Entra ID P1** and a **Conditional Access Administrator**
(or Security / Global Admin) in tenant `fdpo.onmicrosoft.com` (`16b3c013-d300-468d-ac64-7eda0820b6d3`).

## Target objects
| Item | Value |
|------|-------|
| App (client) ID | `0934e54f-36e2-4e8d-8aec-574895e062ef` |
| macancil@microsoft.com (guest) | `152ac45e-e0f3-4c02-96bc-4fe700f205cd` |
| mcancillo@hotmail.com (guest)  | `75aa9cc7-d02d-4de8-9783-b0ba3b6ed579` |

## Prerequisites
1. Enable Microsoft Authenticator: Entra ID → Protection → Authentication methods → Microsoft Authenticator → Enable / Target = All users.
2. Both users register Authenticator at https://aka.ms/mfasetup (guest must redeem the B2B invite first).

## Apply (PowerShell, admin signed in via `az login`)

```powershell
cd .azure\ca-mfa

# 1) Create the custom authentication strength (Microsoft Authenticator only)
$strength = az rest --method POST `
  --uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/authenticationStrength/policies" `
  --headers "Content-Type=application/json" `
  --body "@authstrength.json" | ConvertFrom-Json
$strengthId = $strength.id
Write-Output "Auth strength id: $strengthId"

# 2) Inject the strength id into the CA policy body
(Get-Content ca-policy.json -Raw).Replace("REPLACE_WITH_AUTH_STRENGTH_ID", $strengthId) |
  Set-Content ca-policy.ready.json -Encoding utf8

# 3) Create the Conditional Access policy (starts in report-only)
az rest --method POST `
  --uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" `
  --headers "Content-Type=application/json" `
  --body "@ca-policy.ready.json"
```

## Validate, then enforce
1. Leave `state = enabledForReportingButNotEnforced` (report-only) for a short period.
2. Review: Entra ID → Protection → Conditional Access → Insights / Sign-in logs → confirm the policy
   would apply to both users on the app and that Authenticator satisfies it.
3. Flip to enforced — get the policy id from the create output (`$policyId`), then:

```powershell
$patch = '{ "state": "enabled" }'
$patch | Set-Content enable.json -Encoding utf8
az rest --method PATCH `
  --uri "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies/<POLICY_ID>" `
  --headers "Content-Type=application/json" `
  --body "@enable.json"
```

## Notes
- `allowedCombinations` in `authstrength.json`:
  - `password,microsoftAuthenticatorPush` = password + Authenticator push (classic MFA).
  - `deviceBasedPush` = Authenticator passwordless phone sign-in (single-step MFA).
  - This restricts MFA satisfaction to Microsoft Authenticator only.
- Simpler alternative (any MFA, not Authenticator-specific): in `ca-policy.json` set
  `grantControls.builtInControls = ["mfa"]` and remove `authenticationStrength`.
- Recommended: exclude a break-glass/emergency-access account from this policy.
- To also cover the customer app later, add its app ID to `applications.includeApplications`
  (or target the customer C2B External ID user flow instead).
