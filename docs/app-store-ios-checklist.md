# KEKE Manager — Apple App Store submission checklist

**Last updated:** July 2, 2026

Use this checklist before `eas submit` to App Store Connect.

---

## 1. Legal & privacy (code + deploy)

- [x] Privacy Policy mentions **camera** and **odometer photos** (EN/KA markdown + HTML)
- [x] In-app legal bundles synced (`npm run legal:sync`)
- [x] Account deletion in-app (Settings → Delete account)
- [x] Blocked accounts cannot sign in (`is_blocked`)
- [x] Run demo setup: `npm run review:apple` (needs `SUPABASE_SERVICE_ROLE_KEY`)
- [ ] Deploy web so `https://kekemanager.com/legal/privacy-policy` shows updated text

**Privacy Policy URL (App Store Connect):**  
`https://kekemanager.com/legal/privacy-policy`

**Support URL:**  
`https://kekemanager.com`

**Support email:**  
`akachibaia1410@gmail.com`

---

## 2. App Privacy (Nutrition Labels)

Declare data **linked to the user**, purpose **App Functionality**, **not used for tracking**:

| Data type | Collected | Notes |
|-----------|-----------|-------|
| Contact Info | Yes | Name, email, phone |
| Location | Yes | Precise — active trip GPS only |
| Photos or Videos | Yes | Camera + gallery; odometer, verification, vehicle |
| User Content | Yes | Chat messages |
| Identifiers | Yes | User ID, push token |
| Financial Info | Optional | Driver IBAN (optional field) |
| Other Data | Yes | Gov ID / license images (verification) |

**Tracking:** No  
**Third-party advertising:** No

---

## 3. iOS build

**Step-by-step (Georgian/English):** `docs/ios-build-steps.md`

**First build must be interactive** (Apple credentials not yet on EAS):

```bash
npx eas-cli credentials:configure-build --platform ios --profile production
npm run build:ios
npm run submit:ios
```

Follow prompts to sign in with Apple Developer and let EAS create Distribution Certificate + Provisioning Profile. After that, CI/non-interactive builds work.

- [ ] Apple Developer account + App Store Connect app record
- [ ] Push Notifications capability (Expo/EAS credentials)
- [ ] TestFlight internal test on real device
- [ ] Camera + Location + Photos permissions tested on device

**Export compliance:** Uses standard HTTPS only → exempt encryption (typical).

---

## 4. Metadata

| Field | Suggestion |
|-------|------------|
| Name | KEKE Manager |
| Subtitle | Tour & transfer booking |
| Category | Business (primary), Travel (secondary) |
| Age rating | 17+ or 12+ (business app with location + chat) |
| Screenshots | Company dashboard, driver bookings, GPS, odometer, voucher |

---

## 5. Review Notes (paste into App Store Connect)

```
KEKE Manager is a B2B platform for tour companies and professional drivers in Georgia.

Demo accounts (after `npm run review:apple`):
- Company: apple.review.company@kekemanager.app / KekeAppleReview2026!
- Driver: apple.review.driver@kekemanager.app / KekeAppleReview2026!

Full text: copy from `docs/apple-review-notes.txt`

Driver tour test flow:
1. Sign in as driver → accept a tour booking
2. Tap Start tour → camera opens for odometer photo → allow camera
3. Allow location → GPS tracking screen opens (background location only during active trip)
4. Tap Complete → second odometer photo

Transfers do NOT require odometer photos.

Background location is used ONLY while a trip is in_progress after the driver taps Start.
Location stops when the trip is completed.

Account deletion: Settings → Delete account (type confirmation word).

Support: akachibaia1410@gmail.com
```

Replace `[EMAIL]` / `[PASSWORD]` with real demo accounts before submit. (Already configured — see credentials above.)

---

## 6. Optional improvements (post-v1)

- In-app “Report” for chat messages (Guideline 1.2)
- Background location demo video if Apple requests it
- iPad layout smoke test (`supportsTablet: true`)

---

## 7. Commands reference

```bash
# Sync legal docs into app bundle
npm run legal:sync

# Production web deploy (Netlify auto on push to master)
git push origin master

# iOS production build
eas build --platform ios --profile production
```
