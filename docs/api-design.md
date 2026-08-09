# CholoJai — API Design

> **Status:** Draft for review · **Last updated:** 2026-08-05
>
> Conventions every CholoJai endpoint follows, plus the v1 surface sketch.
> Contracts are Zod schemas in `packages/shared` (ADR-005); Swagger is
> generated from them. This document is the _policy_; the generated OpenAPI
> spec is the _reference_.

---

## 1. Principles

1. **Resource-oriented.** URLs name things (`/rides`), methods name actions
   (`POST` creates). Verbs in URLs (`/createRide`) are forbidden — with the
   one documented exception in §4.
2. **Predictable envelope.** Every success and every failure has the same
   shape. Clients write one response handler, not forty.
3. **Explicit versioning.** `/api/v1` from day one (ADR-007).
4. **Validated at the boundary.** No handler receives unvalidated input.
5. **Documented by construction.** An endpoint without Swagger metadata
   fails review.

---

## 2. Conventions

| Concern     | Convention                                                                   |
| ----------- | ---------------------------------------------------------------------------- |
| Base path   | `/api/v1`                                                                    |
| Casing      | `camelCase` in JSON bodies; `kebab-case` in paths (`/driver-applications`)   |
| IDs         | CUIDs in paths: `/rides/clx7f2k9a0001`                                       |
| Money       | Integer paisa, field suffix `Paisa` (`fareTotalPaisa`) — never floats        |
| Timestamps  | ISO 8601 UTC (`2026-08-05T14:32:00.000Z`)                                    |
| Collections | Always an object, never a bare array (see §3)                                |
| Auth        | `Authorization: Bearer <accessToken>`; only `/auth/refresh` reads the cookie |
| Correlation | `X-Request-Id` echoed on every response and present in logs                  |
| Idempotency | `Idempotency-Key` header honored on `POST /rides` and `POST /payments`       |

### Status codes we actually use

`200` OK · `201` Created (with `Location`) · `204` No Content ·
`400` validation failed · `401` unauthenticated · `403` authenticated but
not permitted · `404` not found · `409` state conflict (e.g. ride already
accepted) · `422` semantically invalid (e.g. expired quote) ·
`429` rate limited · `500` unexpected.

The `401` vs `403` distinction is deliberate: _who are you?_ vs _I know who
you are and you may not do this._ Conflating them is a common review flag.

---

## 3. Response envelopes

**Single resource** — the resource, unwrapped:

```json
{ "id": "clx7f2k9a0001", "status": "ACCEPTED", "fareTotalPaisa": 24500 }
```

**Collection** — always wrapped, so pagination has a home:

```json
{
  "data": [{ "id": "clx7..." }],
  "pageInfo": { "nextCursor": "clx7f2k9a0042", "hasNextPage": true }
}
```

### Pagination: cursor, not offset

`GET /rides?limit=20&cursor=clx7f2k9a0042`

Offset pagination (`?page=3`) has two defects that matter here. It is
**unstable**: if a new ride is inserted while a rider pages through history,
rows shift and they see a duplicate or miss one. And it is **slow at
depth**: `OFFSET 10000` makes Postgres scan and discard 10,000 rows.
Cursor pagination seeks directly on an indexed key — stable results, flat
performance. The cost is no random page access, which our UIs don't need.

Admin tables that genuinely need page numbers (§4, `/admin/*`) may use
offset — a documented exception, not a default.

### Errors — RFC 9457 problem details

Every failure, from every endpoint:

```json
{
  "type": "https://cholojai.app/errors/ride-already-accepted",
  "title": "Ride already accepted",
  "status": 409,
  "detail": "This ride was accepted by another driver 4 seconds ago.",
  "instance": "/api/v1/rides/clx7f2k9a0001/accept",
  "requestId": "01J9X2K3M4N5P6Q7R8S9T0",
  "code": "RIDE_ALREADY_ACCEPTED"
}
```

`code` is the machine-readable contract the frontend switches on — never
parse `title` or `detail`, which are human-facing and translatable.
Validation failures add a field-level array:

```json
{
  "type": "https://cholojai.app/errors/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "errors": [
    { "path": "pickup.lat", "message": "Latitude must be between -90 and 90" }
  ]
}
```

The shape comes from one global exception filter (architecture §5). Handlers
throw typed domain errors; the filter maps them. No handler ever builds an
error body by hand.

---

## 4. v1 surface sketch

Grouped by module. `🔒` requires auth; `🚗` driver role; `🛡` admin role.

### Auth — `/api/v1/auth`

| Method | Path                   | Purpose                                     |
| ------ | ---------------------- | ------------------------------------------- |
| POST   | `/register`            | Create account, send verification email     |
| POST   | `/login`               | Issue access token + refresh cookie         |
| POST   | `/refresh`             | Rotate refresh token, issue access token    |
| POST   | `/logout`              | Revoke current refresh family               |
| POST   | `/verify-email`        | Consume email verification token            |
| POST   | `/resend-verification` | Re-send verification email (rate limited)   |
| POST   | `/forgot-password`     | Send reset link (always 204 — see note)     |
| POST   | `/reset-password`      | Consume reset token, set new password       |
| GET    | `/me` 🔒               | Current user, roles, driver profile summary |

> `/forgot-password` returns `204` whether or not the email exists.
> Returning `404` for unknown emails turns the endpoint into a user
> enumeration oracle.

#### Password recovery

The trade-off here runs the opposite way from registration, which _does_
return `409` for an address already in use. There, telling the truth saves
someone from a broken sign-up. Here the caller's next step — check your
inbox — is identical either way, so honesty buys them nothing and buys an
attacker a way to test a million addresses.

The generic response is only half of it. The mail is dispatched **without
blocking the response**, so a known address and an unknown one take the same
time. A uniform body in front of a measurable timing difference is
decoration, the same reasoning behind hashing a decoy password on login.

Reset links live **one hour**, against twenty-four for email verification.
A verification link activates an account that was just created; a reset link
takes over an existing one. Anyone reaching the mailbox afterwards — a
shared laptop, a synced tablet, a mail archive — holds an account takeover
for exactly as long as that number allows.

Completing a reset **revokes every session**, not just the current one.
People reset a password precisely when they think somebody else has it, so
leaving the other party's refresh token alive would make the whole exercise
theatre. Access tokens already issued survive until they expire, up to
fifteen minutes; that is the standing cost of stateless tokens and is not
specific to this flow.

Redeeming a reset link also marks the address verified if it was not
already. Reaching the mailbox is the same proof email verification asks for,
and demanding it twice for one fact is friction rather than security.

Reset and verification tokens share one table and are separated by a
`purpose` column that every lookup filters on. Without it a verification
link — longer-lived and issued far more freely — would double as an
account-takeover credential.

#### How the two tokens travel

`/login` returns two credentials by two different routes, and the asymmetry
is the entire security design.

The **access token** is a signed JWT in the response body. The client holds
it in memory and sends it as `Authorization: Bearer …`. It is readable by
any script on the page, which is exactly why it lives fifteen minutes and
carries nothing but a user id and roles. It is not revocable — that is the
price of not consulting the database on every request.

The **refresh token** is an opaque random string in an httpOnly,
`SameSite=Strict` cookie scoped to `/api/v1/auth`. JavaScript cannot read
it, so an XSS payload cannot steal it; the browser cannot be tricked into
sending it cross-site, so the CSRF surface that cookie authentication
normally opens stays closed. It lives seven days and _is_ revocable,
because it is a row in `refresh_tokens`.

Neither token should ever be written to `localStorage`.

`/logout` requires no access token, deliberately. The sign-out button must
keep working after the access token has expired — which it does every
fifteen minutes — and the cookie is sufficient proof of which session to
end. It always returns `204`; telling a caller that their cookie was
unrecognised would help someone probing with stolen ones.

`/login` returns one `401` for a wrong password and for an address with no
account. The two paths also spend the same time, by hashing a decoy
password when no user is found — an identical message in front of a
measurable timing difference is decoration, not a defence.

#### Rotation and reuse detection

Every call to `/auth/refresh` retires the token it was given and issues a
successor in the same family. A refresh token is therefore single-use, and
a token presented after it was already exchanged should not exist anywhere.

That is the detection. When one turns up, either an attacker is replaying a
token the user has since rotated past, or the user is replaying one the
attacker rotated first — and nothing in the request distinguishes the two.
So the whole family is revoked. Both parties are signed out, and only the
one who knows the password comes back. A stolen refresh token buys at most
one rotation cycle instead of a week.

Revoking only the replayed row would be worse than useless: it would leave
whoever holds the successor — quite possibly the thief — with a live
session while telling us we had handled the incident.

Three failure codes, and clients must branch on them:

`REFRESH_TOKEN_STALE` is not an attack. Two tabs, or a mobile client
retrying through a tunnel, genuinely send the same token twice, and a
replay within ten seconds of its own rotation is treated as that. Nothing
is revoked and the response does not clear the cookie, because the request
that won the race already set the new one. The client retries once.

`REFRESH_TOKEN_REUSED` means the family was revoked. Tell the user their
session ended for security reasons and send them to sign in.

`REFRESH_TOKEN_INVALID` covers unknown, expired, signed-out, and
past-the-ceiling. Send them to sign in.

The ten-second grace period is a deliberate blind spot — an attacker
replaying inside it gets a 401 and raises no alarm. The alternative is
signing honest users out whenever their connection stutters, which is a
worse trade on the networks this app is built for. Set
`REFRESH_ROTATION_GRACE_SECONDS=0` to run strict.

Sessions are also bounded absolutely. Rotation slides each token's expiry
forward, but never past thirty days from the original sign-in. Without that
clamp, rotation would make sessions _less_ bounded than they were before it
existed: refresh once a week and the session never ends.

Refreshing re-reads the user, so it is also the point at which a role
change takes effect and a deactivated account loses its session.

Failures on protected endpoints distinguish `ACCESS_TOKEN_EXPIRED` from
`INVALID_ACCESS_TOKEN` in `code`. The client refreshes on the first and
sends the user to sign in on the second; collapsing them means the app
logs people out every quarter of an hour.

#### Roles and the two failure codes

`401` and `403` are not interchangeable. `401` means we do not know who you
are — obtain credentials and retry. `403` means we do, and retrying will not
help. A client that treats them alike either loops on a permission error or
gives up on a fixable one.

Roles are a flat set, never a hierarchy. An ADMIN is **not** implicitly a
DRIVER. Hierarchies feel tidy and are a common source of accidental
privilege: the moment ADMIN implies DRIVER, an administrator can accept ride
requests and appear in driver matching. If an admin needs to drive, they get
a DRIVER grant like anyone else — decision D1, one account with additive
roles.

A `403` names neither the role required nor the roles held. That would map
the privilege model for anyone probing, and a legitimate caller cannot act
on it anyway.

### Admin — role management

| Method | Path                                 | Purpose                   |
| ------ | ------------------------------------ | ------------------------- |
| POST   | `/admin/users/:userId/roles` 🛡       | Grant a role, idempotent  |
| DELETE | `/admin/users/:userId/roles/:role` 🛡 | Revoke a role, idempotent |

Two refusals protect invariants rather than permissions, and both answer
`409` because the caller has every permission required.

RIDER cannot be revoked: every account is a rider, and one without it can
sign in and do nothing.

An administrator cannot revoke their **own** ADMIN role. That single rule is
what guarantees the platform never runs out of administrators. With two
admins, either may demote the other, and whoever remains cannot demote
themselves — so the count falls to one and stops, from any starting number.
The alternative, counting remaining admins on each revocation, is slower and
racy: two concurrent revocations could each see "two remain" and both
proceed.

A demotion needs no session revocation. Access tokens carry roles and are
stale for at most their lifetime, and `/auth/refresh` re-reads roles from
the database — so the change lands on the next refresh. That property comes
from M3.5 and is load-bearing here: rebuilding claims from the old token
during refresh would make a demotion last until the user signed out.

### Users — `/api/v1/users`

`PATCH /me` 🔒 (profile) · `POST /me/avatar` 🔒 · `PATCH /me/password` 🔒 ·
`DELETE /me` 🔒 (soft delete) · `GET|POST /me/saved-places` 🔒 ·
`PATCH|DELETE /me/saved-places/:id` 🔒

### Geo — `/api/v1/geo`

`GET /search?q=` (geocoding proxy, M6) · `GET /reverse?lat=&lng=` (M6) ·
`POST /route` 🔒 (distance + duration, **M5**). All proxy Nominatim/OSRM
server-side with caching (ADR-006); the browser never calls a third party.

> **Why routing lands in M5 and geocoding does not.** A fare cannot be priced
> without a distance and a duration, so `POST /route` is a prerequisite of the
> quote endpoint rather than part of the map feature. Geocoding has no
> consumer until there is a map to search on. Same reasoning that moved Redis
> from M2 to M3: infrastructure arrives with its first consumer, not before.

### Fares — `/api/v1/fares`

`POST /quote` 🔒 — pickup + dropoff → priced options per vehicle type with
full breakdown and `expiresAt`.

### Rides — `/api/v1/rides`

| Method | Path                 | Purpose                                        |
| ------ | -------------------- | ---------------------------------------------- |
| POST   | `/` 🔒               | Book: consume a quote, create `REQUESTED` ride |
| GET    | `/` 🔒               | My rides (cursor paginated; role-scoped)       |
| GET    | `/active` 🔒         | Current non-terminal ride, if any              |
| GET    | `/:id` 🔒            | Ride detail (participants + admin only)        |
| POST   | `/:id/cancel` 🔒     | Cancel with reason                             |
| POST   | `/:id/accept` 🔒🚗   | Driver accepts                                 |
| POST   | `/:id/arrive` 🔒🚗   | Driver at pickup                               |
| POST   | `/:id/start` 🔒🚗    | Begin journey                                  |
| POST   | `/:id/complete` 🔒🚗 | End journey                                    |

> **The documented exception to "no verbs in URLs."** These are _state
> transitions_, not resource mutations. `POST /rides/:id/accept` is honest
> about invoking a guarded transition; `PATCH /rides/:id {"status":
"ACCEPTED"}` implies the client may set any status and pushes the state
> machine into the client's hands. Transition-as-sub-resource is the
> standard pattern for state machines over REST — and each of these maps
> exactly to one arrow in the domain model's diagram.

### Drivers — `/api/v1/drivers`

`POST /applications` 🔒 (apply) · `GET /me` 🔒🚗 (profile + stats) ·
`PATCH /me/availability` 🔒🚗 · `GET /me/earnings?from=&to=` 🔒🚗 ·
`GET /me/ride-requests` 🔒🚗 (pending offers)

### Vehicles — `/api/v1/vehicles` 🔒🚗

Full CRUD scoped to the calling driver · `PATCH /:id/activate`

### Payments, Reviews, Coupons, Referrals, Notifications

`POST /payments` 🔒 (settle a completed ride) · `GET /payments/:id` 🔒 ·
`POST /rides/:id/reviews` 🔒 · `GET /drivers/:id/reviews` ·
`POST /coupons/validate` 🔒 · `GET /me/coupons` 🔒 ·
`GET /me/referrals` 🔒 · `POST /referrals/claim` 🔒 ·
`GET /notifications` 🔒 · `PATCH /notifications/:id/read` 🔒 ·
`POST /notifications/read-all` 🔒

### Admin — `/api/v1/admin` 🛡

`GET /users` · `PATCH /users/:id/status` ·
`GET /driver-applications` · `POST /driver-applications/:id/approve` ·
`POST /driver-applications/:id/reject` ·
`GET /rides` (live monitor) · `GET /analytics/overview` ·
`GET|POST|PATCH /coupons` · `PATCH /reviews/:id/moderate` ·
`GET|POST|PATCH /blog-posts` · `GET|POST /career-listings` ·
`GET /job-applications` · `GET /contact-messages`

### Health — unversioned

`GET /health` (liveness) · `GET /health/ready` (DB + Redis reachable)

---

## 5. Realtime events (Socket.IO)

Namespace `/rt`, JWT-authenticated on handshake. Rooms: `ride:{rideId}`,
`driver:{driverProfileId}`.

| Event                  | Direction       | Payload                                             |
| ---------------------- | --------------- | --------------------------------------------------- |
| `ride.status_changed`  | server → client | `{ rideId, status, at }`                            |
| `ride.driver_location` | server → client | `{ rideId, lat, lng, headingDeg }`                  |
| `ride.request_offered` | server → driver | `{ rideId, pickup, dropoff, farePaisa, expiresAt }` |
| `driver.location_ping` | driver → server | `{ lat, lng, headingDeg }`                          |

REST remains the source of truth; sockets are a notification channel. A
client that misses an event and refetches must see identical state — so
every socket event has a REST equivalent. This makes the UI resilient to
dropped connections, which on a Dhaka mobile network is not hypothetical.

---

## 6. Rate limits (initial)

| Scope                            | Limit                | Status |
| -------------------------------- | -------------------- | ------ |
| Global, per IP                   | 100 req / min        | M3.6   |
| `POST /auth/login`               | 5 / 15 min per email | M3.6   |
| `POST /auth/login`               | 20 / 15 min per IP   | M3.6   |
| `POST /auth/register`            | 10 / hour per IP     | M3.6   |
| `POST /auth/resend-verification` | 3 / hour per email   | M3.6   |
| `POST /auth/resend-verification` | 10 / hour per IP     | M3.6   |
| `POST /auth/refresh`             | 120 / hour per IP    | M3.6   |
| `POST /auth/verify-email`        | 30 / hour per IP     | M3.6   |
| `POST /auth/forgot-password`     | 3 / hour per email   | M3.8   |
| `POST /auth/forgot-password`     | 10 / hour per IP     | M3.8   |
| `POST /auth/reset-password`      | 20 / hour per IP     | M3.8   |
| `GET /geo/search`                | 30 / min per user    | M6     |
| `POST /fares/quote`              | 60 / min per user    | M6     |

Backed by Redis counters (ADR-004), and `/health` is exempt.

**Why two rules on the sensitive endpoints.** Neither key alone is enough.
A per-IP limit misses a distributed attack on one account, and a per-email
limit misses one machine working through a wordlist across many accounts.
The per-IP numbers are deliberately the looser of the pair: an office, a
university, or a mobile carrier can put hundreds of legitimate users behind
one address, so a limit tight enough to stop a determined attacker also
locks out a whole building.

Earlier drafts of this table said 5 per 15 minutes _per IP_ on login and 3
per hour per IP on register. Both were revised in M3.6 for exactly that
reason — the numbers looked strict on paper and would have been a support
queue in Dhaka.

Every response carries `RateLimit-Limit`, `RateLimit-Remaining`, and
`RateLimit-Reset` for the rule closest to rejecting — not the loosest one,
which would tell a client "97 remaining" while login is one attempt from
cutting it off. A 429 adds `Retry-After`.

The 429 body never names the rule that was hit or how long its window is.
That would hand an attacker the exact shape of the wall they need to stay
under, and a legitimate client already has the headers.

**When Redis is down, requests are allowed.** Rate limiting exists to make
abuse expensive, not to decide who may act, so failing closed would turn a
cache outage into a platform-wide sign-in outage — a better result for an
attacker than the abuse being prevented. The degradation logs at `warn`
with the rule name so it is alertable rather than silent. Authentication
and authorisation fail closed; this does not.

---

## 7. Rules for adding an endpoint

1. Define the Zod request/response schemas in `packages/shared`.
2. Add the controller method with Swagger decorators; validate via the
   shared schema.
3. Put logic in the service; the controller only translates HTTP.
4. Add authorization guards explicitly — **never rely on obscurity**.
5. Write an integration test for the happy path and each failure mode.
6. Update this document if a new convention was introduced.
