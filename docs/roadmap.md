# CholoJai — Product Roadmap

> **Status legend:** 🔲 Not started · 🟡 In progress · ✅ Complete
>
> This roadmap is a living document. Milestones are sequenced so that each one
> produces something shippable and reviewable. We do not begin a milestone
> until the previous one is complete and approved.

| #   | Milestone                       | Scope                                                                                                                                                                                 | Status |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M0  | Product & Architecture Planning | Product spec, domain model, architecture + ADRs, core ERD, API design, docs skeleton                                                                                                  | ✅     |
| M1  | Monorepo Foundation             | Turborepo + pnpm workspaces, strict TypeScript config, ESLint/Prettier, Husky + Commitlint, CI skeleton                                                                               | ✅     |
| M2  | Backend Foundation              | NestJS bootstrap, validated env config, centralized error handling, logging, Swagger, API versioning, Docker Compose, Prisma schema + migrations, health probes, GitHub governance    | ✅     |
| M3  | Authentication & Authorization  | Register/login, JWT + refresh token rotation, email verification, forgot password, RBAC (rider / driver / admin), **Redis + rate limiting**, **CI integration-test job**, seed script | ✅     |
| M4  | Design System & Marketing Site  | Next.js app scaffold, Tailwind v4 tokens, dark mode, type scale, primitives, landing page, SEO foundation                                                                             | ✅     |
| M5  | Ride Booking Core               | Booking workflow, fare estimation engine, ride lifecycle state machine, **routing proxy**                                                                                             | ✅     |
| M6  | Rider Web App                   | Web data layer, auth UI, geocoding proxy, booking flow, ride history, Leaflet map                                                                                                     | ✅     |
| M7  | Driver Side & Live Tracking     | Driver applications, vehicle management, ride acceptance flow, Socket.IO driver-location tracking                                                                                     | ✅     |
| M8  | Admin & Analytics               | Admin dashboard, user/driver management, analytics                                                                                                                                    | 🔲     |
| M9  | Content & Growth                | Blog CMS, careers, contact, notifications, reviews, coupons, referrals                                                                                                                | 🔲     |
| M10 | Payments & Polish               | Mock payment integration, settings, search, i18n-ready architecture                                                                                                                   | 🔲     |
| M11 | Quality Hardening               | Test coverage push, Lighthouse optimization, accessibility audit                                                                                                                      | 🔲     |
| M12 | Production Deployment           | Vercel + Railway, GitHub Actions pipelines, release process                                                                                                                           | 🔲     |

## Sequencing rationale

**Schema evolves per feature, not up front.** The core domain (users, roles,
drivers, vehicles, rides) is designed in M0; every later feature adds its own
tables via Prisma migrations. This mirrors how real products evolve and keeps
each migration reviewable.

**Auth before UI.** Every dashboard and workflow depends on identity and
roles. Building authentication early means all later features are built
against real authorization from day one instead of having security bolted on
at the end.

**Foundations before features.** M1–M2 look unglamorous but they are what
make every later milestone fast: consistent tooling, one-command local
environment, and a CI pipeline that catches regressions from the first
feature commit.

**Infrastructure arrives with its first consumer.** Redis and the CI
integration-test job were originally scoped into M2 and moved to M3 —
deliberately, not by omission. Redis lands with login rate limiting, which
is the first thing that needs it; the integration-test job lands with the
first endpoints worth testing against a real database. Building either
earlier would have meant a module with no caller and a test job with
nothing to run, which `contributing.md` explicitly forbids
("no new abstraction without a second caller"). They are written into M3's
scope above so they are tracked rather than remembered.

The routing proxy moved M6 → M5 for the same reason. `estimateFare` takes a
distance and a duration, so a fare quote cannot be honest without a route —
the alternative is letting the client supply both, which lets a rider price
their own journey. Geocoding stayed in M6 because nothing searches for a
place until there is a map to search on. The milestone that owns a piece of
infrastructure is the one containing its first consumer, and splitting `geo`
across two milestones is the honest consequence of that rule rather than an
exception to it.

**M5 is a backend milestone, and saying so is the correction.** Its three
scoped items — booking workflow, fare estimation, lifecycle state machine —
are all server-side, and they are done. A rider-facing booking screen was
never in M5's scope, and building one here would have meant a form with two
pairs of latitude and longitude boxes: enough to demonstrate the endpoints,
not enough for anyone to use. Choosing a pickup point is a map, and the map
is M6.

**Authentication had a user interface nowhere in this table.** M3 built the
whole auth API — register, login, refresh rotation, verification, reset — and
M4 built the design system and the marketing site. Neither owned the screens,
so a plan that read as complete described a product no one could sign in to.
That is now M6's, along with the API client and query layer every
authenticated screen needs. It is recorded here rather than quietly built,
because a gap found late is cheaper than a gap found by a reviewer.

**Live tracking moved M6 → M7, because it had nothing to track.** M6 built
the rider's side of the product; a ride it books stays `REQUESTED`, since no
driver exists to accept it until M7 adds applications, approval, vehicles and
the accept endpoint. Building a location feed in M6 would have meant
simulating a driver that cannot exist, and then rewriting it against the real
one a milestone later. The same rule as the routing proxy, pointing the other
way: infrastructure arrives with its first consumer, and tracking's first
consumer is a driver who has actually accepted a ride.

**Accessibility is a build step, not a review step.** The design tokens are
checked against WCAG contrast ratios by a unit test that reads the stylesheet,
and the rendered page is audited with axe in both colour schemes. Those two
catch different things, which is the argument for having both: the unit test
found nothing wrong with a caption that axe then failed at 4.23:1, because the
test only compared text against the page surface and never against the raised
surface that cards actually use. A checker that runs against real rendered DOM
sees the combinations that actually occur.

**Integration tests are a separate suite, not a slower unit suite.** The
unit tests run against in-memory adapters and need nothing installed, so they
stay in every commit hook and every developer's inner loop. The `*.int-spec.ts`
suites run against a real PostgreSQL because a handful of the system's most
important guarantees — refresh-token rotation staying atomic under genuinely
concurrent transactions, the partial unique indexes actually firing, cascade
deletes reaching every dependent row — are properties of the database, not of
our code, and a fake can only pretend at them. Keeping the two separate means
neither compromises: the fast suite stays fast, and the slow one is allowed to
be honest about what it needs.
