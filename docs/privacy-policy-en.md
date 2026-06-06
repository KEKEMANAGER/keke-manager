# KEKE Manager — Privacy Policy

**Last updated:** May 22, 2026  
**Effective date:** May 22, 2026

---

## 1. Introduction

This Privacy Policy explains how **KEKE Manager** (“**we**”, “**us**”, “**our**”) collects, uses, stores, shares, and protects personal data when you use our mobile application **KEKE Manager** and related services (collectively, the “**Service**”).

By creating an account or using the Service, you acknowledge that you have read this Privacy Policy. If you do not agree, please do not use the Service.

**Data controller**

| | |
|---|---|
| **Legal name / brand** | KEKE Manager |
| **Location** | Tbilisi, Georgia |
| **Founders** | Akaki Kachibaia, Ani Kekelia |
| **Privacy contact** | [akachibaia1410@gmail.com](mailto:akachibaia1410@gmail.com) |

We **do not sell** your personal data to third parties. We **do not send marketing emails** for promotional purposes.

---

## 2. Who this policy applies to

The Service is designed for business users in the transportation and tour-management sector. Account types include:

| Role | Description |
|------|-------------|
| **Company** | Creates and manages bookings, tracks drivers, chats with drivers, rates completed trips |
| **Driver with own vehicle** | Accepts bookings, shares GPS during active trips, manages vehicle and verification documents, may host sub-drivers |
| **Driver (hired)** | Works under a host driver; limited vehicle/fleet features; job-board visibility |
| **Administrator** | Internal operators who verify users, moderate accounts, view operational data |

You must be **at least 18 years old** to use the Service.

---

## 3. Data we collect

We collect only data necessary to operate the Service, as reflected in our application and database design.

### 3.1 Account and identity data

- Full name  
- Email address  
- Password (stored by our authentication provider as a **one-way cryptographic hash** — never in plain text; industry-standard hashing such as **bcrypt** via Supabase Auth)  
- Account role (company, driver, admin)  
- Phone number (where provided)  
- Profile photo (avatar)  
- Bio, spoken languages, years of experience (drivers)  
- Company name, company email, company phone, company identification code, director name (companies)  
- Hired-driver status and job-board availability preferences  
- Account verification status, block status, subscription-related fields shown in the app  

### 3.2 Driver verification documents

For drivers, we collect images and metadata for identity and compliance, including:

- Driver’s license (front/back)  
- National ID (front/back)  
- Vehicle technical passport / registration (front/back)  
- Legacy single-photo fields where applicable  

Documents are uploaded to secure cloud storage and linked to your user profile. **Camera and photo-library access** on your device is used **only** to capture or select images for verification and profile/vehicle photos—not for unrelated purposes.

### 3.3 Vehicle data

- Vehicle type and class  
- Model, color, year, license plate  
- Vehicle photographs (multiple angles)  
- Active vehicle selection for matching and notifications  

### 3.4 Booking and trip data

- Pickup/drop-off locations, routes, tour descriptions, itinerary (including multi-day tours)  
- Dates and times  
- Passenger count  
- Flight numbers and transfer details  
- Passenger name and phone (for transfers)  
- Pricing: client price, commission, driver payment (GEL), payment timing  
- Voucher codes, operator/staff name who created the booking  
- Required driver languages  
- Booking status (pending, accepted, in progress, completed, cancelled, rejected)  
- Assigned driver and company identifiers  

### 3.5 Location data (GPS)

- **Latitude and longitude** while you actively run GPS tracking in the app during an **active trip**  
- We store the **current** driver location pin for live tracking (not a long-term GPS history trail in the app design)  
- Location is **not collected** when GPS tracking is off or no trip is active  

Background location on Android may use a **foreground service notification** while tracking is enabled.

### 3.6 Communications

- In-app chat messages (text), sender/receiver IDs, optional booking link, read status  
- In-app notification records (title, body, type, metadata such as booking or chat references)  
- Push notification device tokens (Expo push token stored on your profile)  

### 3.7 Ratings and feedback

- Star rating and optional text review after completed bookings  
- Optional feedback messages submitted from the profile screen  

### 3.8 Fleet and job board (drivers)

- Host–sub-driver fleet relationships  
- Vehicle assignments for sub-drivers  
- Job-board profile views and hire-status notifications  

### 3.9 Technical and local data

- Authentication session tokens (stored locally via secure async storage patterns)  
- App language preference (stored on device)  
- Temporary local keys for background GPS session state (driver ID, active booking ID)  

We do **not** use third-party advertising or analytics SDKs in the current application build.

---

## 4. Device permissions

The app may request the following permissions. You can deny some permissions, but related features will not work.

| Permission | Purpose |
|------------|---------|
| **Location (foreground)** | Show maps and send live position during active GPS tracking |
| **Location (background)** | Continue trip tracking when the app is minimized (drivers only, during active tracking) |
| **Notifications** | Booking alerts, chat messages, verification and job-board notices |
| **Photos / media library** | Upload avatar, vehicle photos, and verification documents |
| **Camera** (where declared by the OS) | Optional capture path for document photos; primary flow uses the photo library |

---

## 5. How we use your data

We use personal data to:

1. Create and authenticate accounts  
2. Match companies with suitable drivers (vehicle type/class, languages, availability, verification)  
3. Operate bookings end-to-end (create, assign, accept, complete, cancel)  
4. Display live driver tracking to authorized companies and administrators  
5. Deliver chat and push notifications  
6. Verify driver and company identities  
7. Calculate and display ratings and operational statistics  
8. Administer the platform (moderation, user support, fraud prevention)  
9. Comply with legal obligations and enforce our Terms of Service  

**Automated decisions:** Matching drivers to bookings uses rules (vehicle, language, schedule overlap, verification). No solely automated legal decisions with significant effects are intended.

---

## 6. Legal bases (summary)

Where the GDPR or similar laws apply (e.g., because data is hosted in the EU), we rely on:

- **Contract** — providing the Service you signed up for  
- **Legitimate interests** — security, fraud prevention, improving reliability  
- **Consent** — where required for optional permissions (location, notifications, photos)  
- **Legal obligation** — when law requires retention or disclosure  

---

## 7. Third-party services and processors

We use trusted providers who process data on our instructions:

| Provider | Role | Data involved |
|----------|------|----------------|
| **Supabase** (EU — **Frankfurt, Germany** region) | Authentication, PostgreSQL database, file storage, realtime subscriptions, Edge Functions | Account data, bookings, messages, locations, document URLs, push tokens |
| **Expo / Expo Application Services (EAS)** | App builds, push notification delivery (`exp.host` API), optional OTA updates infrastructure | Push tokens, notification payloads |
| **Apple / Google** | App distribution (App Store, Google Play) | Per their store policies |
| **Apple Maps / Google Maps** (via `react-native-maps`) | Map display on iOS/Android | Map tiles; location shown on device maps |

We do **not** authorize these providers to use your data for their own marketing. Contracts and industry-standard safeguards apply.

**Admin operations:** You can delete your own account in the app (see Section 10). Administrators may also remove accounts for moderation via a secured Supabase Edge Function (`admin-delete-user`) using server-side credentials never embedded in the mobile app.

---

## 8. Storage, security, and confidentiality

- Data is stored in **Supabase** infrastructure in the **Frankfurt (Germany)** region, within the European Union data-center footprint.  
- Connections use **TLS/HTTPS** encryption in transit.  
- Passwords are stored as **hashes**, not readable text.  
- Row Level Security (RLS) and role-based access limit database access by authenticated user role.  
- Verification and media files are stored in a cloud storage bucket; URLs may be public if shared—access is still gated by app authorization for listing.  

No method of transmission or storage is 100% secure. We apply reasonable technical and organizational measures appropriate to the risk.

---

## 9. Who can access your data

Access depends on your role and the feature:

| Data | Company | Driver | Admin |
|------|---------|--------|-------|
| Own profile | Yes | Yes | Yes |
| Other users’ directory (names, roles for matching/chat) | Limited | Limited | Full |
| Bookings you participate in | Yes | Yes | Full |
| Passenger details on bookings | If company creator | If assigned driver | Full |
| Live GPS of drivers | Assigned/active context | Own only | Full map |
| Chat threads | Participants only | Participants only | Moderation access |
| Verification documents | Own | Own | Review |

Administrators can block accounts, change roles, approve verification, delete messages, and delete accounts per operational policy.

---

## 10. Data retention

| Data type | Retention |
|-----------|-----------|
| Active account data | While account is active |
| **Account deletion** | When you delete your account in the app (**Settings → Delete account**, or from the **driver verification screen**), your profile and associated app data are removed **immediately** and permanently. No administrator approval or 30-day waiting period applies. Short-lived backup copies at our hosting provider may exist only per their technical retention policies. Where law requires keeping specific records (e.g. tax or accounting), only those legally required items are retained. |
| **GPS location** | Current pin only during active tracking; removed when tracking stops |
| **Driver verification documents** | Must be **refreshed every 3 months**; outdated documents may invalidate verification status |
| Bookings, messages, ratings | While your account is active, retained for operational needs; **deleted with your account** when you use in-app deletion |
| Logs and backups | Limited retention per provider policies |

---

## 11. Your rights

Subject to applicable law (including Georgian personal data law and, where relevant, GDPR), you may have the right to:

- Access your personal data  
- Correct inaccurate data (via profile or by contacting us)  
- Delete your account at any time in the app (**Settings → Delete account**, or from the **driver verification screen**); deletion is **immediate and permanent** (no admin confirmation step)
- Restrict or object to certain processing  
- Withdraw consent for permissions (via device settings)  
- Lodge a complaint with a supervisory authority  

To exercise rights, email **akachibaia1410@gmail.com**. We will respond within a reasonable time.

---

## 12. Children

The Service is not directed to anyone under **18**. We do not knowingly collect data from minors. If you believe a minor has registered, contact us for deletion.

---

## 13. International transfers

Primary storage is in **Germany (EU)**. If you access the Service from Georgia or elsewhere, your data may be processed in the EU and in Georgia (our operations). We take steps to ensure appropriate safeguards where required.

---

## 14. Changes to this policy

We may update this Privacy Policy. The “Last updated” date will change. Material changes may be notified in-app or by email where appropriate. Continued use after the effective date constitutes acceptance of the updated policy.

---

## 15. Contact

**KEKE Manager**  
Tbilisi, Georgia  

**Privacy & data requests:** [akachibaia1410@gmail.com](mailto:akachibaia1410@gmail.com)  

**Founders:** Akaki Kachibaia, Ani Kekelia  

---

*This document is provided for App Store and Google Play compliance and user transparency. It should be read together with our Terms of Service.*
