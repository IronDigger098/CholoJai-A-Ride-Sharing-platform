# CholoJai — Deployment

> **Status:** planned — fully written and exercised in M12. Recorded now so
> later milestones are built against the deployment reality rather than
> retrofitted to it.

---

## Environments

| | Local | Production |
| --- | --- | --- |
| Web | `next dev` (:3000) | Vercel |
| API | `nest start --watch` (:4000) | Railway |
| PostgreSQL | Docker Compose | Railway managed (daily backups) |
| Redis | Docker Compose | Railway managed |
| Email | Mailpit (:8025 UI) | Resend |
| Images | Cloudinary (dev folder) | Cloudinary (prod folder) |

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

On every pull request:

1. Install (pnpm cache) → 2. Lint → 3. Typecheck → 4. Unit tests →
5. Integration tests (Postgres + Redis service containers) → 6. Build both
apps → 7. Playwright E2E on the golden journeys → 8. Lighthouse CI budget
check on marketing routes.

Turborepo caching means unchanged packages skip their steps. All checks are
required for merge.

## Release process

`main` is always deployable. Merging to `main` triggers:

- **Web:** Vercel production deploy (automatic).
- **API:** Railway deploy — runs `prisma migrate deploy` *before* the new
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
