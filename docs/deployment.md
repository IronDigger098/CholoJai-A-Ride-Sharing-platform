# CholoJai — Deployment

Web on Vercel, API on Render (Docker), PostgreSQL on Neon, Redis on
Upstash — every piece on a free tier. All of them watch `main` and deploy on
merge, which is what "`main` is always deployable" means in practice.

The API was first hosted on Railway (`railway.json` is still here and still
works). Railway's trial ended and paused every service, so the free stack
below replaced it. Nothing in the image is host-specific; moving back is a
matter of pointing a host at the same Dockerfile.

---

## Environments

|            | Local                        | Production                       |
| ---------- | ---------------------------- | -------------------------------- |
| Web        | `next dev` (:3000)           | Vercel (Hobby)                   |
| API        | `nest start --watch` (:4000) | Render free web service (Docker) |
| PostgreSQL | Docker Compose               | Neon free                        |
| Redis      | Docker Compose               | Upstash free (`rediss://`)       |
| Email      | Mailpit (:8025 UI)           | Any SMTP provider                |

**The cost of free.** Render spins a free instance down after about fifteen
minutes without traffic; the next request waits roughly a minute while it
boots and runs `migrate deploy`. Neon suspends idle compute too, adding a
second or two. For a portfolio that is fine. For real riders it is not, and
the first upgrade is an always-on API instance.

## How the browser reaches the API

```
browser ──► https://<web>.vercel.app/api/v1/*  ──(Next.js rewrite)──► https://<api>.onrender.com/api/v1/*
browser ──► wss://<api>.onrender.com/tracking, /notifications   (Socket.IO, direct)
```

REST goes **through the web app's origin**. The refresh token is an
httpOnly `SameSite=Strict` cookie; if the browser called the API's own
host, every request would be cross-site, the cookie would never be sent,
and a page reload would sign the user out. Proxying makes it first-party
without weakening it to `SameSite=None` — which browsers increasingly block
as a third-party cookie regardless. Because the browser sees the cookie
arriving from the web host, `COOKIE_DOMAIN` is the **web** host.

Sockets go **direct**, because a Vercel rewrite cannot carry a WebSocket
upgrade. They authenticate with the access token in the handshake, not the
cookie, so being cross-site costs them nothing. `ConfiguredIoAdapter`
applies the same origin allow-list to them as `enableCors` does to REST.

## Step by step

Do these in order — each step needs a URL from the one before.

### 1. PostgreSQL on Neon

1. neon.tech → sign in with GitHub → create a project, region **Singapore**.
2. Copy the connection string **without** `-pooler` in the host (the
   "direct" one) and make sure it ends with `?sslmode=require`.
   `prisma migrate deploy` does not work through the pooled endpoint.

### 2. Redis on Upstash

1. upstash.com → create a Redis database, region closest to Singapore.
2. Copy the `rediss://default:<password>@<host>:6379` URL.

### 3. Email (Brevo)

Render's free instances block outbound SMTP on ports 25, 465 and 587, so
the API sends mail over Brevo's HTTPS API instead (`BrevoMailerService`,
chosen whenever `BREVO_API_KEY` is set).

1. brevo.com → sign up (free plan) → **Senders, Domains & Dedicated IPs →
   Senders** → add the address you will send from and confirm the email
   Brevo sends it. Any mailbox you own works; no domain is needed.
2. **SMTP & API → API Keys → Generate a new API key**. Copy it.
3. On Render set `BREVO_API_KEY` to that key and `MAIL_FROM` to
   `CholoJai <the verified address>`.

The `SMTP_*` variables are still parsed but unused while the key is set.

### 4. API on Render

1. render.com → sign in with GitHub → **New → Blueprint** → choose this
   repository. Render reads `render.yaml` and proposes `cholojai-api`.
2. It asks for every `sync: false` variable. Fill them in; for the two you
   do not know yet use placeholders and fix them after step 5:
   - `API_BASE_URL` → `https://cholojai-api.onrender.com` (the URL Render shows)
   - `WEB_BASE_URL` → `https://<project>.vercel.app` (placeholder for now)
   - `COOKIE_DOMAIN` → `<project>.vercel.app` (no `https://`)
   - `DATABASE_URL` → from step 1, `REDIS_URL` → from step 2
   - `SMTP_*`, `MAIL_FROM` → from step 3
3. Deploy. The first build takes several minutes. When it is live,
   `https://cholojai-api.onrender.com/health/ready` answers 200.

### 5. Web on Vercel

1. vercel.com → **Add New → Project** → import this repository.
2. **Root Directory: `apps/web`**. `apps/web/vercel.json` supplies the
   install and build commands, which step back to the workspace root so
   `@cholojai/shared` builds first.
3. Environment variables (Production):

   | Variable                   | Value                               |
   | -------------------------- | ----------------------------------- |
   | `NEXT_PUBLIC_API_BASE_URL` | `/api/v1`                           |
   | `API_PROXY_TARGET`         | `https://cholojai-api.onrender.com` |
   | `NEXT_PUBLIC_SOCKET_URL`   | `https://cholojai-api.onrender.com` |
   | `NEXT_PUBLIC_SITE_URL`     | `https://<project>.vercel.app`      |

   All four are read at **build** time; changing one means redeploying.

4. Deploy, note the real `*.vercel.app` URL, and if it differs from the
   placeholder, update `WEB_BASE_URL` and `COOKIE_DOMAIN` on Render. Render
   restarts the API with the new values.

### 6. Seed accounts (optional)

The seed refuses to run with `NODE_ENV=production` — it creates accounts
whose password is published in the README. Register through the site
instead, then grant ADMIN from Neon's SQL editor:

```sql
INSERT INTO role_grants (id, user_id, role)
SELECT gen_random_uuid()::text, id, 'ADMIN' FROM users
WHERE email = 'you@example.com';
```

`id` is supplied by hand because its `cuid()` default lives in the Prisma
client, not in the database. Sign out and back in afterwards: roles travel
in the access token.

## Local setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The one-command goal from the product spec's success metrics: a reviewer
goes from `git clone` to a running stack without reading anything else.

## The API image

`apps/api/Dockerfile`, built with the **repository root** as its context.
That is not a preference — a pnpm workspace package cannot be built in
isolation, because `@cholojai/api` imports `@cholojai/shared` and the
lockfile pinning both lives at the root. `railway.json` points Railway at
the file.

Three stages, each earning its place:

- **deps** copies manifests only and installs. Docker caches a layer until
  its inputs change, so editing a service file rebuilds the app but not the
  dependency tree — the difference between a thirty-second deploy and a
  three-minute one.
- **build** generates the Prisma client, compiles `shared` then `api`, and
  runs `pnpm deploy --prod` to flatten a production-only tree.
- **runtime** copies `dist`, that tree, and `prisma/`. No compiler, no
  devDependencies, and it runs as `node` rather than root.

Two details that are easy to get wrong and expensive to diagnose:

**`CMD` is the exec form.** With the shell form the process is a child of
`/bin/sh`, which does not forward `SIGTERM` — so `enableShutdownHooks()` in
`main.ts` never fires and every deploy severs in-flight requests. The
graceful shutdown that `main.ts` sets up is only real because of this line.

**`openssl` is installed explicitly.** Prisma's query engine links against
it and Alpine does not ship it. Without the package the image builds cleanly
and dies on first query with an error naming a shared object, not a package.

### Why the Prisma CLI is a production dependency

`prisma` moved from `devDependencies` to `dependencies` in M12. It is a
build tool everywhere else, and shipping it makes the image larger — but
`pnpm deploy --prod` strips devDependencies, and the container's start
command runs `prisma migrate deploy` before the server binds. The
alternatives were worse: migrating from CI needs the CI runner to hold
production database credentials, and migrating by hand is a step somebody
eventually skips.

## Release process

Merging to `main` triggers:

- **Web:** Vercel production deploy.
- **API:** Render builds the image and starts it with
  `sh docker-start.sh`, which runs `prisma migrate deploy` and then
  `exec node dist/main.js`. Migrations therefore run
  _before_ the new process takes traffic, and a failed migration means the
  container never becomes healthy — the previous one keeps serving.

Render's health check is `/health/ready`, not `/health`. Liveness answers
"the process is up", which is true of a process that cannot reach its
database; readiness checks Postgres and Redis. Pointing the check at the
weaker probe would route traffic to an instance that 500s on every request.

### Tagging a release

```bash
git tag -a v1.2.0 -m "v1.2.0"
git push origin v1.2.0
```

`.github/workflows/release.yml` publishes a GitHub release with notes
generated from Conventional Commit history — the payoff for commitlint
rejecting messages since M1. It refuses to publish for a commit that is not
an ancestor of `main`, because a tag can be pushed at any commit, including
one that never passed CI.

Releases label; they do not deploy. Deployment already happened at merge.

### Migration safety

Expand-then-contract for destructive changes: add the new column, backfill,
ship code using it, drop the old column in a later release. Never in one
migration — a rollback would otherwise lose data that the new code wrote.

## Configuration

Every variable is declared in `apps/api/src/config/env.schema.ts` and
documented in `docs/environment-variables.md`. The schema refuses to start
in production when:

- `API_BASE_URL` or `WEB_BASE_URL` is not `https://`
- `JWT_ACCESS_SECRET` still contains `change-me` or `example`
- `RATE_LIMIT_ENABLED` is false
- `LOG_LEVEL` is `debug` or `trace`

Three that are wrong by default in production and have to be set:

| Variable                              | Production value          | Why                                                                                                                                                        |
| ------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUSTED_PROXY_HOPS`                  | `2`                       | Vercel's proxy, then Render's. Left at 0, every request appears to come from one of them and the global limit throttles the whole user base as one client. |
| `COOKIE_DOMAIN`                       | the web app's host        | The cookie arrives through the web app's `/api/v1` proxy. Never a parent domain shared with other services — that hands it to every subdomain.             |
| `OSRM_BASE_URL`, `NOMINATIM_BASE_URL` | self-hosted or commercial | The public instances are rate-limited per address and their usage policies forbid production traffic.                                                      |

`NEXT_PUBLIC_*` variables are compiled into the browser bundle and are
public by construction. `NEXT_PUBLIC_SITE_URL` must be set per environment
or preview deployments advertise the production URL as canonical and ask
crawlers to index the wrong host.

## Rollback

**Web:** Vercel instant rollback to the previous deployment.
**API:** roll back to the previous deploy in Render's dashboard.
**Database:** forward-fix by preference. Reverse migrations are written but
treated as a last resort — they can destroy rows written since the deploy,
and a rollback that loses data is worse than the bug it was undoing.

Rolling the API back past a migration is the case with no clean answer,
which is the reason for expand-then-contract above: within that discipline
the old code still runs against the new schema.

## Post-deploy checks

`GET /health` (liveness) and `GET /health/ready` (Postgres + Redis
reachable) must both return 200. Load the marketing page in both languages —
`/` and `/bn` — since the locale middleware is the one piece that behaves
differently behind a CDN than it does locally. Smoke-test one golden journey
by hand after any release touching the ride lifecycle.
