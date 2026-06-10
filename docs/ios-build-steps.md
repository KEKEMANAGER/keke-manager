# iOS production build — step by step

Run these in **your own terminal** (interactive prompts required; Cursor agent cannot complete Apple login).

## Prerequisites

- Apple Developer Program membership (paid)
- App Store Connect app record for bundle ID `com.akuna.kekemanager`
- Logged into EAS: `npx eas-cli whoami` → `kekemanager`

## 1. Demo accounts (once)

```powershell
cd d:\keke-manager-app
# Load .env with SUPABASE_SERVICE_ROLE_KEY, then:
npm run review:apple
```

Credentials for App Review: see `docs/apple-review-notes.txt`

## 2. Configure Apple credentials on EAS (once)

```powershell
npx eas-cli credentials:configure-build --platform ios --profile production
```

Choose:

- **Let EAS manage credentials** (recommended)
- Sign in with Apple ID (`akachibaia1410@gmail.com` or team owner)
- Select your **Team** and **Distribution Certificate**

## 3. Production build

```powershell
npm run build:ios
```

Or:

```powershell
npx eas-cli build --platform ios --profile production
```

Wait ~15–25 min. Download IPA from the Expo dashboard or install via TestFlight after submit.

## 4. TestFlight QA (real iPhone)

- [ ] Sign in as company + driver (demo accounts)
- [ ] Driver: Start tour → camera (odometer) → GPS → Complete → second photo
- [ ] Company: dashboard shows odometer photos
- [ ] Settings → Delete account (smoke test)
- [ ] Push notification (optional)

## 5. App Store Connect metadata

| Field | Value |
|-------|--------|
| Privacy Policy URL | `https://kekemanager.com/legal/privacy-policy` |
| Support URL | `https://kekemanager.com` |
| Support email | `akachibaia1410@gmail.com` |
| Review Notes | Copy from `docs/apple-review-notes.txt` |
| Privacy labels | See `docs/app-store-ios-checklist.md` §2 |

Export compliance: **No** custom encryption (HTTPS only) — matches `ITSAppUsesNonExemptEncryption: false` in `app.json`.

## 6. Submit to App Store

After build succeeds:

```powershell
npm run submit:ios
```

First time: EAS will ask for App Store Connect API key or Apple ID app-specific password.

Optional `eas.json` (fill after creating the app in ASC):

```json
"submit": {
  "production": {
    "ios": {
      "appleId": "akachibaia1410@gmail.com",
      "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID",
      "appleTeamId": "YOUR_TEAM_ID"
    }
  }
}
```

## 7. Web deploy (Cloudflare Pages)

Privacy Policy URL must be live before App Store submit.

```powershell
git push origin master
```

Cloudflare builds `npm run build` and publishes `dist/`. Or manual:

```powershell
npm run build
npx wrangler pages deploy dist --project-name=kekemanager
```

Verify: `https://kekemanager.com/legal/privacy-policy`

Android / Play Console: see `docs/google-play-checklist.md`.

## Troubleshooting

| Error | Fix |
|-------|-----|
| Credentials not set up | Run step 2 interactively |
| Bundle ID not registered | Create app in App Store Connect with `com.akuna.kekemanager` |
| Push capability | EAS enables during credential setup; ensure notifications plugin in `app.json` |
| Privacy URL 404 | Wait for Cloudflare deploy Success after `git push` |
