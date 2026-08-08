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

### Users — `/api/v1/users`

`PATCH /me` 🔒 (profile) · `POST /me/avatar` 🔒 · `PATCH /me/password` 🔒 ·
`DELETE /me` 🔒 (soft delete) · `GET|POST /me/saved-places` 🔒 ·
`PATCH|DELETE /me/saved-places/:id` 🔒

### Geo — `/api/v1/geo`

`GET /search?q=` (geocoding proxy) · `GET /reverse?lat=&lng=` ·
`POST /route` (distance + duration). All proxy Nominatim/OSRM server-side
with caching (ADR-006); the browser never calls a third party.

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

| Scope                                         | Limit                                               |
| --------------------------------------------- | --------------------------------------------------- |
| Global per IP                                 | 100 req / min                                       |
| `/auth/login`, `/auth/forgot-password`        | 5 req / 15 min per IP + per email                   |
| `/auth/register`, `/auth/resend-verification` | 3 req / hour per IP                                 |
| `/geo/search`                                 | 30 req / min per user (protects upstream Nominatim) |
| `POST /fares/quote`                           | 60 req / min per user                               |

Backed by Redis counters (ADR-004). Responses include
`RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset`.

---

## 7. Rules for adding an endpoint

1. Define the Zod request/response schemas in `packages/shared`.
2. Add the controller method with Swagger decorators; validate via the
   shared schema.
3. Put logic in the service; the controller only translates HTTP.
4. Add authorization guards explicitly — **never rely on obscurity**.
5. Write an integration test for the happy path and each failure mode.
6. Update this document if a new convention was introduced.
