# CholoJai — Product Specification (v1)

> **Document owner:** Asib · **Status:** Draft for review · **Last updated:** 2026-08-05
>
> CholoJai ("চলো যাই" — *let's go*) is a ride-sharing platform for Bangladesh's
> urban market. This document defines **what** we are building and **for whom**.
> The **how** lives in `architecture.md`; the data design lives in
> `database-erd.md`.
>
> **Originality note:** CholoJai is inspired by the *publicly observable*
> experience of ride-sharing products. All code, branding, UI, content, and
> architecture in this repository are original work.

---

## 1. Vision

Getting around Dhaka is unpredictable: fares are negotiated, availability is
luck, and safety is opaque. CholoJai makes urban transport **predictable**:
upfront fares, verified drivers, live tracking, and a booking experience that
works equally well in Bangla and English.

**One-line pitch:** Book a verified ride with an upfront fare in under 30
seconds.

### Product principles

1. **Predictable over cheap.** An upfront, honest fare beats a fluctuating one.
2. **Trust is a feature.** Verification, ratings, and tracking are first-class,
   not add-ons.
3. **Fast on real networks.** The product must feel fast on a mid-range phone
   on a congested mobile network.
4. **Two languages, one experience.** Bangla and English are equal citizens
   (v1 ships English with i18n-ready architecture; Bangla content follows).

---

## 2. Personas

### Nabila — the Rider

- 24, master's student at Dhaka University; commutes daily, often after dark.
- Uses a mid-range Android phone on a 4G connection that fluctuates.
- **Goals:** know the fare before booking, see who is picking her up, share her
  live ride with family.
- **Frustrations:** haggling with drivers, no-show pickups, not knowing if a
  driver is legitimate.
- **Success looks like:** she opens the app, sees a fare, books, and tracks
  her driver approaching — without a single phone call.

### Rafiq — the Driver

- 35, owns his motorcycle; drives ~6 hours a day to supplement family income.
- Comfortable with apps but not with English-heavy interfaces.
- **Goals:** steady stream of ride requests, transparent earnings, fast
  onboarding for himself and his vehicle.
- **Frustrations:** opaque commission math, apps that drain his battery,
  rejection without explanation during signup.
- **Success looks like:** he sees a request, accepts in one tap, and can see
  exactly what he earned today and this week.

### Shahana — the Operations Admin

- 29, operations manager at CholoJai HQ.
- **Goals:** approve driver applications quickly but safely, monitor platform
  health, intervene on flagged rides and reviews, manage promotions.
- **Frustrations:** digging through raw data to answer "how many rides
  completed today?", no audit trail of who changed what.
- **Success looks like:** a dashboard that answers the top ten operational
  questions at a glance, with drill-down when something looks wrong.

---

## 3. Feature scope (MoSCoW)

### Must have (v1 core — the product is not credible without these)

| Feature | Persona | Notes |
| --- | --- | --- |
| Email/password auth with verification | All | JWT + refresh rotation, forgot password |
| Role-based access (rider / driver / admin) | All | One account, role-scoped capabilities |
| Marketing website | Public | Landing, how-it-works, safety, fare info |
| Ride booking workflow (demo) | Rider | Pickup/destination → fare quote → book → matched → track → complete |
| Fare estimation | Rider | Distance + time + vehicle-type based, transparent breakdown |
| Real-time driver tracking (simulated) | Rider | Socket.IO; simulated driver movement |
| Driver onboarding & vehicle management | Driver | Application, document placeholders, vehicle CRUD, admin approval |
| Ride acceptance flow | Driver | See request → accept/decline → run the ride lifecycle |
| Rider dashboard | Rider | Ride history, active ride, profile, saved places |
| Driver dashboard | Driver | Earnings summary, ride history, availability toggle |
| Admin dashboard | Admin | User/driver management, driver approval queue, ride monitor |
| Reviews & ratings | Rider ↔ Driver | Mutual post-ride rating, admin moderation |
| Mock payment flow | Rider | Payment method selection, mock charge, receipt |
| Responsive, accessible, dark-mode UI | All | WCAG-conscious, keyboard navigable |

### Should have (v1 if schedule allows, else v1.1)

| Feature | Notes |
| --- | --- |
| Coupons & promo codes | Admin creates, rider applies at booking |
| Referral system | Rider invites rider; both earn credit |
| In-app notification center | Ride events, promos; email for critical events |
| Analytics dashboard (admin) | Rides/day, revenue, active drivers, cancellation rate |
| Blog CMS | Admin-authored posts, public blog with SEO |
| Careers page + application form | Public listings, applications land in admin |
| Contact system | Public form → admin inbox |
| Search | Riders: places & history; Admin: users, rides |

### Could have (nice to have, only after Should is done)

- Scheduled (future) rides
- Multi-stop rides
- Driver heatmap of demand
- Rider fare-split with a friend
- Export ride history (PDF/CSV)

### Won't have (v1 — explicitly out of scope)

- Real payment processing (we mock; architecture keeps a provider seam)
- Native mobile apps (responsive web only)
- Real driver document verification (KYC) — placeholder workflow only
- Real-world dispatch/matching at scale — matching is simulated
- Live customer-support chat

> **Why "Won't have" matters:** scoping *out* is what makes a project
> finishable. Each excluded item has an architectural seam (e.g., a
> `PaymentProvider` interface) so adding it later is an extension, not a
> rewrite.

---

## 4. Core user journeys

### J1 — Rider books a ride (the golden path)

1. Nabila signs in and lands on the booking screen with the map centered on
   her area.
2. She enters pickup and destination (search or map pin).
3. She sees vehicle options (bike, CNG, car) each with an **upfront fare** and
   ETA; she picks one and optionally applies a coupon.
4. She confirms. The system requests a match; a simulated driver accepts.
5. She sees the driver's name, photo placeholder, vehicle, plate, rating, and
   a live map of the driver approaching.
6. Ride runs pickup → in progress → completed. She sees the fare breakdown and
   pays with a mock payment method.
7. She rates Rafiq; Rafiq rates her. The ride appears in her history.

**Journey success criteria:** steps 2–4 in under 30 seconds; every state
change visible without refresh.

### J2 — Driver goes online and completes a ride

1. Rafiq applies as a driver: profile, license placeholder, vehicle details.
2. Shahana reviews and approves his application; he is notified.
3. Rafiq toggles **Available**. A ride request appears with pickup,
   destination, and fare.
4. He accepts, drives to pickup (simulated movement), starts the ride,
   completes it.
5. His earnings dashboard updates: today, this week, per-ride breakdown with
   the platform commission shown transparently.

### J3 — Admin operates the platform

1. Shahana signs in to the admin dashboard.
2. She sees today at a glance: rides, revenue, active drivers, cancellations.
3. She works the driver approval queue (approve / reject with reason).
4. She investigates a low-rated ride, reads both reviews, and can flag or
   moderate.
5. She creates a weekend promo coupon and publishes a blog post announcing it.

---

## 5. Non-functional requirements

| Category | Requirement |
| --- | --- |
| Performance | Lighthouse ≥ 95 (Performance, SEO, Best Practices) on marketing pages; booking flow interactive < 3s on Fast 3G |
| Accessibility | Lighthouse Accessibility ≥ 95; keyboard-navigable flows; WCAG 2.1 AA color contrast |
| Security | OWASP-conscious: hashed passwords (argon2/bcrypt), JWT + refresh rotation, rate limiting, input validation on every endpoint, no secrets in code |
| Reliability | Ride state transitions are atomic; no ride can reach an invalid state |
| Realtime | Tracking updates ≤ 2s apart during an active ride |
| i18n | All user-facing strings externalized from day one; locale-aware formatting |
| Testing | Unit + integration on backend business logic; E2E on the three golden journeys (J1–J3) |
| Observability | Structured logs with request IDs; health endpoints |

---

## 6. Success metrics (for a portfolio project)

Since CholoJai is a demonstration platform, "success" means engineering
quality that is *measurable*:

- All three golden journeys pass as Playwright E2E suites in CI.
- Lighthouse budget met (§5) and enforced in CI.
- Zero `any` types; strict TypeScript across the monorepo.
- Every schema change is a reviewed Prisma migration.
- A reviewer can go from `git clone` to a running local stack with one
  documented command.

---

## 7. Open questions

Tracked here until resolved; each resolution becomes an ADR or spec update.

| # | Question | Resolution |
| --- | --- | --- |
| Q1 | Map provider: Leaflet + OpenStreetMap vs Google Maps vs Mapbox | ✅ **Resolved** — Leaflet + OSM, with Nominatim/OSRM proxied behind our `/geo/*` endpoints. See `architecture.md` ADR-006. |
| Q2 | Driver simulation: seeded bot drivers vs a second real account | ✅ **Resolved** — both. Seeded bot drivers ship in the seed script (`database-erd.md` §5) and move via the `ride-simulation` BullMQ queue (`architecture.md` §5); E2E uses a real driver account. |
| Q3 | Email delivery in dev/prod | ✅ **Resolved** — Mailpit locally via Docker Compose, Resend free tier in production. See `architecture.md` §7. |

No open questions remain for M0. New questions are appended here as they
arise and must be resolved before the milestone that depends on them.
