# KEKE Manager — Launch checklist (unified)

**Last updated:** June 11, 2026  
**Goal:** Soft launch → App Store + Play Store → first paying B2B clients.

Use `[ ]` / `[x]` as you complete each item. Detailed store guides: [`app-store-ios-checklist.md`](./app-store-ios-checklist.md), [`google-play-checklist.md`](./google-play-checklist.md), [`ios-build-steps.md`](./ios-build-steps.md).

---

## Phase 0 — Prerequisites

| Item | Detail |
|------|--------|
| Project ref | `brrjuxgxmpgvkddcuaad` |
| Bundle / package | `com.akuna.kekemanager` |
| EAS project | `42888595-a62e-427b-9446-680bf289be23` |
| Production web | `https://kekemanager.com` |
| Privacy URL | `https://kekemanager.com/legal/privacy-policy` |
| Terms URL | `https://kekemanager.com/legal/terms` |
| Support email | `akachibaia1410@gmail.com` |

- [ ] Apple Developer account ($99/yr)
- [ ] Google Play Developer account ($25 one-time)
- [ ] Expo account linked to EAS project
- [ ] `.env` in UTF-8 (not UTF-16 — breaks Supabase CLI)
- [ ] `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` in Cloudflare Pages env

---

## Phase 1 — Supabase (production backend)

### 1.1 Link & migrations

```bash
npx supabase login
npx supabase link --project-ref brrjuxgxmpgvkddcuaad
npm run db:migrations   # list all SQL files in order
```

- [ ] All migrations applied on **production** (Dashboard → Database → Migrations, or `supabase db push`)
- [ ] No failed migration in history

### 1.2 Critical migrations (verify manually if unsure)

| File | Why |
|------|-----|
| `20260624160000_rls_auth_uid_hardening.sql` | RLS security |
| `20260630120000_account_deletion.sql` | Delete account (App Store) |
| `20260630250000_pre_submission_hardening.sql` | Pre-launch hardening |
| `20260703120000_driver_reject_booking_rpc.sql` | Driver reject pending job |
| `20260704120000_bookings_driver_payout_gel.sql` | Driver payout field |
| `20260711120000_available_drivers_admin_access.sql` | Emergency search for admin accounts |

- [ ] `list_available_drivers_in_city` allows `role IN ('company', 'admin')`
- [ ] `reject_pending_booking_as_driver` RPC exists
- [ ] Edge Function `admin-delete-user` deployed (if using admin panel delete)

### 1.3 Auth & storage

- [ ] Auth redirect URLs include production web + mobile scheme `kekemanager://`
- [ ] Storage buckets: `media`, verification docs, odometer photos, pickup signs — public read where intended
- [ ] RLS smoke test: company cannot read another company's bookings

### 1.4 Secrets (hosted Supabase only — never in app)

- [ ] `SUPABASE_SERVICE_ROLE_KEY` only on server / Edge Functions / local scripts — **not** in `app.config.js`

---

## Phase 2 — Web (Cloudflare Pages)

```bash
npm run build
# verify dist references entry-*.js that exists under dist/_expo/static/js/web/
git push origin master   # auto-deploy if Git connected
```

- [ ] `https://kekemanager.com` loads app (not white page / MIME error)
- [ ] Hard refresh: JS bundle returns `application/javascript`
- [ ] `dist/_redirects`, `_headers`, `_routes.json` present after build
- [ ] Legal pages live: `/legal/privacy-policy`, `/legal/terms`
- [ ] Cloudflare env: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Sign-up / sign-in works on web

**Manual deploy (if needed):**

```bash
npx wrangler pages deploy dist --project-name=kekemanager
```

---

## Phase 3 — End-to-end QA (real phones)

Run at least **one full path** on **physical** iOS + Android (not web-only).

### 3.1 Company flow

- [ ] Register / sign in as company
- [ ] Create **transfer** booking (from → to, comfort class)
- [ ] Create **day tour** booking (structured from/to)
- [ ] Create **multi-day tour** (optional arrival transfer)
- [ ] See booking on dashboard; open tracking when driver active

### 3.2 Freelance driver flow

- [ ] Verified driver sees open job → accept (or targeted accept without fleet picker error)
- [ ] **Start trip** → GPS tab opens, tracking ON
- [ ] **Google/Apple Maps** opens to pickup (external nav — no Supabase change)
- [ ] Pickup / destination nav buttons work on GPS tab + Active booking
- [ ] Company sees **live pin** on GPS / tracking map
- [ ] **Complete trip** → rating / payment confirm if applicable
- [ ] **Transfer:** no odometer required
- [ ] **Tour:** odometer photo start + end

### 3.3 Hired / fleet sub driver flow

- [ ] Hired driver: dashboard voucher card (not open job pool)
- [ ] **Start tour** → GPS + Maps pickup (same as freelance)
- [ ] Nav buttons on dashboard when `accepted` / `in_progress`
- [ ] **GPS ტრეკინგი + რუკა** opens GPS with `bookingId`

### 3.4 Admin / ops

- [ ] Admin account: emergency replacement finds Tbilisi drivers (after SQL fix)
- [ ] Admin GPS map shows fleet pins
- [ ] Driver voucher: driver sees **company** card + chat (not own driver card)

### 3.5 Account & legal

- [ ] Settings → Delete account works
- [ ] Blocked user cannot sign in
- [ ] Push notification on physical device (not Expo Go only for final check)

- [ ] **E2E pass recorded** (date / devices): _______________

---

## Phase 4 — iOS (App Store)

See [`ios-build-steps.md`](./ios-build-steps.md) and [`app-store-ios-checklist.md`](./app-store-ios-checklist.md).

```bash
npm run legal:sync
npm run review:apple          # demo accounts (needs SUPABASE_SERVICE_ROLE_KEY locally)
npx eas-cli credentials:configure-build --platform ios --profile production   # first time
npm run build:ios
npm run submit:ios
```

- [ ] App Store Connect app record (`com.akuna.kekemanager`)
- [ ] Privacy Policy URL + Support URL set
- [ ] App Privacy labels filled (location, photos, chat — no tracking)
- [ ] TestFlight internal test on real iPhone
- [ ] Review notes + demo accounts (`docs/apple-review-notes.txt`)
- [ ] Test: tour odometer + background GPS + account deletion
- [ ] **New build after `LSApplicationQueriesSchemes`** (Google Maps deep links) — commit `d13e75b+`

---

## Phase 5 — Android (Google Play)

See [`google-play-checklist.md`](./google-play-checklist.md).

```bash
npm run build:android
npm run submit:android
```

- [ ] Play Console app created
- [ ] Data safety form completed (matches privacy policy)
- [ ] Background location declaration + short screen recording prepared
- [ ] Internal testing track: install AAB on real device
- [ ] Same E2E as Phase 3 on Android
- [ ] `versionCode` incremented in `app.json` before each upload

---

## Phase 6 — Soft launch (business)

Technical launch ≠ revenue. After stores are live or in TestFlight/open testing:

- [ ] **3 pilot tour companies** onboarded (hand demo + voucher)
- [ ] **15–30 verified drivers** in Tbilisi (mix freelance + hired)
- [ ] Written **pricing / commission** matrix shared with partners
- [ ] SLA: accept time, GPS mandatory during trip, cancellation rules
- [ ] Support channel (email / WhatsApp) for companies
- [ ] First **10 real paid bookings** completed end-to-end
- [ ] Collect feedback → fix top 3 pain points before marketing spend

---

## Phase 7 — Post-launch (optional, not blockers)

- [ ] Multi-day tour: per-day navigation legs (currently pickup + final destination only)
- [ ] Emergency assign: vehicle class UX (economy vs comfort)
- [ ] Hotel preset lat/lng for sharper Maps pins
- [ ] Analytics (Plausible / PostHog)
- [ ] `support@kekemanager.com` instead of personal Gmail
- [ ] Blog + Google Search Console
- [ ] Batumi / Kutaisi driver pool expansion

---

## Quick command reference

```bash
npm run legal:sync
npm run db:migrations
npm run build                  # web → dist/
npm run build:ios
npm run submit:ios
npm run build:android
npm run submit:android
git push origin master         # Cloudflare web deploy
npm run review:apple           # Apple review demo users
```

---

## Recent product features (verify in QA)

| Feature | Commit area | Supabase SQL? |
|---------|-------------|---------------|
| Cloudflare MIME / deploy fix | `_headers`, `_redirects`, verify-dist | No |
| Driver voucher → company card | `CompanyBookingVoucher` | No |
| Emergency driver search (admin) | `EmergencyReplacementModal` | Yes — `20260711120000_...` |
| Full name label i18n | locales | No |
| External Maps navigation | `openExternalNavigation.ts`, GPS tab | No |
| Hired driver nav + tracking | `HiredDriverActivePanel` | No |

---

**When all Phase 1–5 boxes are checked:** you are **store-ready**.  
**When Phase 6 boxes are checked:** you are **business-ready**.
