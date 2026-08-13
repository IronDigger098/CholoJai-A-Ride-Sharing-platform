# CholoJai — Deployment

Web on Vercel, API and its data stores on Railway. Both watch `main` and
deploy on merge, which is what "`main` is always deployable" means in
practice.

---

## Environments

|            | Local                        | Production                      |
| ---------- | ---------------------------- | ------------------------------- |
| Web        | `next dev` (:3000)           | Vercel                          |
| API        | `nest start --watch` (:4000) | Railway (Docker)                |
| PostgreSQL | Docker Compose               | Railway managed (daily backups) |
| Redis      | Docker Compose               | Railway managed                 |
| Email      | Mailpit (:8025 UI)           | Resend                          |
| Images     | Cloudinary (dev folder)      | Cloudinary (prod folder)        |

No staging environment. PR previews on Vercel cover frontend review; the API
is validated by integration tests in CI against a real Postgres. If the
project grows a second contributor, staging becomes the first addition.

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
- **API:** Railway builds the image and starts it with
  `prisma migrate deploy && node dist/main.js`. Migrations therefore run
  _before_ the new process takes traffic, and a failed migration means the
  container never becomes healthy — the previous one keeps serving.

Railway's healthcheck is `/health/ready`, not `/health`. Liveness answers
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

| Variable                              | Production value          | Why                                                                                                                                                 |
| ------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TRUSTED_PROXY_HOPS`                  | `1`                       | Railway puts one proxy in front. Left at 0, every request appears to come from it and the global limit throttles the whole user base as one client. |
| `COOKIE_DOMAIN`                       | the API's own host        | Never a parent domain shared with other services — that hands the refresh cookie to every subdomain.                                                |
| `OSRM_BASE_URL`, `NOMINATIM_BASE_URL` | self-hosted or commercial | The public instances are rate-limited per address and their usage policies forbid production traffic.                                               |

`NEXT_PUBLIC_*` variables are compiled into the browser bundle and are
public by construction. `NEXT_PUBLIC_SITE_URL` must be set per environment
or preview deployments advertise the production URL as canonical and ask
crawlers to index the wrong host.

## Rollback

**Web:** Vercel instant rollback to the previous deployment.
**API:** redeploy the previous image on Railway.
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
