# KEKE Manager — Google Play submission checklist

**Last updated:** June 9, 2026

Use this checklist before `eas build --platform android` and Play Console release.

---

## 1. Legal & privacy (same as iOS)

- [x] Privacy Policy mentions camera, odometer, GPS, chat (EN/KA)
- [x] In-app legal bundles synced (`npm run legal:sync`)
- [x] Account deletion in-app (Settings → Delete account)
- [x] Blocked accounts cannot sign in (`is_blocked`)
- [ ] Deploy web so `https://kekemanager.com/legal/privacy-policy` shows updated text

**Privacy Policy URL (Play Console):**  
`https://kekemanager.com/legal/privacy-policy`

**Support email:**  
`akachibaia1410@gmail.com`

**Target audience:** Business users 18+ — **not designed for children**

---

## 2. Data safety form (Play Console)

Declare data **collected**, **shared** only as needed for app functionality, **not sold**, **not used for ads/tracking**:

| Data type | Collected | Purpose | Notes |
|-----------|-----------|---------|-------|
| Name, email, phone | Yes | Account, bookings | Contact info |
| Precise location | Yes | Live GPS during active trip only | Not collected when tracking off |
| Photos / videos | Yes | Odometer (tours), verification, vehicle, profile | Camera + gallery |
| Messages | Yes | In-app chat | User-generated content |
| Device or other IDs | Yes | Push notification token | Expo push |
| Financial info | Optional | Driver IBAN (optional profile field) | Shown on voucher to company |
| Government ID | Yes | Driver verification uploads | Stored in Supabase Storage |

**Encryption in transit:** Yes (HTTPS)  
**Users can request deletion:** Yes (in-app)

Match declarations to `docs/privacy-policy-en.md` Section 3–4.

---

## 3. Sensitive permissions (high rejection risk)

### Background location

The app requests `ACCESS_BACKGROUND_LOCATION` only while a driver runs GPS on an **active trip** (after tapping Start).

**Play Console actions:**

1. **App content → Sensitive app permissions → Location** — complete declaration
2. Explain: B2B live driver tracking for assigned tour/transfer bookings only
3. Prepare a **short screen recording**: driver starts tour → odometer photo → GPS → company sees pin → complete trip → tracking stops
4. Declare **foreground service** type: Location (`FOREGROUND_SERVICE_LOCATION`)

### Notifications (Android 13+)

- `expo-notifications` handles `POST_NOTIFICATIONS` at runtime
- Test on Android 13+ device: booking alert after granting permission

### Camera & photos

- Odometer capture on **tours only** (not transfers)
- Verification and vehicle uploads use camera or gallery
- Test on Android 13+ with gallery picker

---

## 4. Android build

```bash
# Production AAB (Play Store)
npm run build:android

# After build succeeds
npm run submit:android
```

Or:

```bash
npx eas-cli build --platform android --profile production
npx eas-cli submit --platform android --profile production
```

**Package name:** `com.akuna.kekemanager`  
**Version:** `app.json` → `android.versionCode` (increment each release)

### Pre-submit device QA

- [ ] Sign in as company + driver (demo or real accounts)
- [ ] Driver: Start **tour** → odometer camera → background GPS → Complete → second photo
- [ ] Driver: **Transfer** — no odometer required
- [ ] Company: live map pin during active trip
- [ ] Settings → Delete account
- [ ] Push notification (physical device, not Expo Go only)

---

## 5. Store listing

| Field | Suggestion |
|-------|------------|
| App name | KEKE Manager |
| Category | Business |
| Short description | B2B tour & transfer booking for companies and drivers in Georgia |
| Content rating | Complete questionnaire — business app, location, UGC chat |
| Data safety | See Section 2 |

---

## 6. Supabase migrations (production)

Before release, confirm these are applied in Supabase Dashboard → Database → Migrations:

- `20260703120000_driver_reject_booking_rpc.sql`
- `20260704120000_bookings_driver_payout_gel.sql`

Run locally to list all migration files:

```bash
npm run db:migrations
```

---

## 7. Web hosting (Cloudflare Pages)

Production site: **Cloudflare Pages** (not Netlify).

```bash
# Full web build
npm run build

# Manual deploy (requires CLOUDFLARE_API_TOKEN)
npx wrangler pages deploy dist --project-name=kekemanager
```

**Cloudflare Pages env vars (Production + Preview):**

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

---

## 8. Optional improvements (post-v1)

- In-app “Report” for chat messages (Play UGC policy)
- `support@kekemanager.com` instead of personal Gmail
- Private storage bucket + signed URLs for verification photos (security hardening)

---

## 9. Commands reference

```bash
npm run legal:sync
npm run review:apple          # demo accounts (Supabase service role)
npm run build:android
npm run submit:android
git push origin master        # triggers Cloudflare Pages build
```
