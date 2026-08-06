# CholoJai — Deployment

> **Status:** planned — fully written and exercised in M12. Recorded now so
> later milestones are built against the deployment reality rather than
> retrofitted to it.

---

## Environments

|            | Local                        | Production                      |
| ---------- | ---------------------------- | ------------------------------- |
| Web        | `next dev` (:3000)           | Vercel                          |
| API        | `nest start --watch` (:4000) | Railway                         |
| PostgreSQL | Docker Compose               | Railway managed (daily backups) |
| Redis      | Docker Compose               | Railway managed                 |
| Email      | Mailpit (:8025 UI)           | Resend                          |
| Images     | Cloudinary (dev folder)      | Cloudinary (prod folder)        |

No staging environment in v1. PR previews on Vercel cover frontend review;
the API is validated by integration tests in CI. If the project grows a
second contributor, staging becomes the first addition.

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

## CI (GitHub Actions)

On every pull request, in order: install with a pnpm cache, check
formatting, lint, typecheck, run unit tests, run integration tests against
Postgres and Redis service containers, build both apps, run Playwright E2E
over the golden journeys, and check the Lighthouse budget on marketing
routes. A separate job validates that every commit in the PR follows
Conventional Commits — hooks can be bypassed with `--no-verify`, CI cannot.

Turborepo caching means unchanged packages skip their steps. All checks are
required for merge.

**Current state (M1):** install, format, lint, typecheck, test, build, and
commit validation are live. Integration, E2E, and Lighthouse stages are
added by the milestones that first need them (M2, M5, M11).

## Release process

`main` is always deployable. Merging to `main` triggers:

- **Web:** Vercel production deploy (automatic).
- **API:** Railway deploy — runs `prisma migrate deploy` _before_ the new
  process takes traffic.

Semantic versioning with tagged releases (`v1.2.0`) and generated release
notes from Conventional Commit history.

**Migration safety:** expand-then-contract for destructive changes — add the
new column, backfill, ship code using it, drop the old column in a later
release. Never in one migration; a rollback would otherwise lose data.

## Rollback

Web: Vercel instant rollback to the previous deployment. API: redeploy the
previous image on Railway. Database: forward-fix by preference — reverse
migrations are written but treated as a last resort, since they can destroy
rows written since the deploy.

## Post-deploy checks

`GET /health` (liveness) and `GET /health/ready` (Postgres + Redis
reachable) must return 200. Smoke-test one golden journey manually after a
release touching the ride lifecycle.
