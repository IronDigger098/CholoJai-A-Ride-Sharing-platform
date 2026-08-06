# CholoJai — Environment Variables

> Every variable, its purpose, and where it is required. Config is validated
> by a Zod schema at boot — a missing or malformed variable crashes the app
> immediately with a readable message, rather than failing mysteriously in
> production at 2 a.m. (`architecture.md` §5).
>
> **Status:** planned surface — populated as M1–M3 land. `.env.example` in
> the repo root is the machine-readable source of truth and must stay in
> sync with this table.

---

## Where `.env` lives

**One file, at the monorepo root** — not one per app. `apps/api` loads it at
startup via `src/config/load-dotenv.ts`, resolved from the compiled file's
own location rather than the working directory (which varies with how the
process was launched). Next.js reads the root `.env` natively.

Loading is skipped entirely when `NODE_ENV=production`: there,
configuration comes from the platform's secret store. Reading a file from
disk in production would put secrets on the filesystem and could silently
mask a missing platform variable during a deploy.

## Rules

1. **Never commit `.env`.** Only `.env.example`, with placeholder values.
2. **No secrets in code.** Ever. Not in tests, not in seeds, not "temporarily".
3. **Client-exposed variables must be prefixed `NEXT_PUBLIC_`** — and must
   therefore contain nothing sensitive, because they ship in the browser
   bundle. This prefix is a public-disclosure declaration, not a convenience.
4. **Every new variable** is added to `.env.example`, this table, and the
   Zod config schema in the same commit.

## `apps/api`

| Variable                    | Purpose                               | Example / default        | Milestone |
| --------------------------- | ------------------------------------- | ------------------------ | --------- |
| `NODE_ENV`                  | Runtime mode                          | `development`            | M2        |
| `PORT`                      | API listen port                       | `4000`                   | M2        |
| `API_BASE_URL`              | Public API origin (links in emails)   | `http://localhost:4000`  | M2        |
| `WEB_BASE_URL`              | Public web origin (CORS, email links) | `http://localhost:3000`  | M2        |
| `DATABASE_URL`              | PostgreSQL connection string          | `postgresql://…`         | M2        |
| `REDIS_URL`                 | Redis connection string               | `redis://localhost:6379` | M2        |
| `JWT_ACCESS_SECRET`         | Signs access tokens                   | 32+ random bytes         | M3        |
| `JWT_ACCESS_TTL`            | Access token lifetime                 | `15m`                    | M3        |
| `JWT_REFRESH_SECRET`        | Signs refresh tokens                  | 32+ random bytes         | M3        |
| `JWT_REFRESH_TTL`           | Refresh token lifetime                | `7d`                     | M3        |
| `COOKIE_DOMAIN`             | Refresh cookie scope                  | `localhost`              | M3        |
| `SMTP_HOST` / `SMTP_PORT`   | Mail transport (Mailpit in dev)       | `localhost` / `1025`     | M3        |
| `MAIL_FROM`                 | Sender identity                       | `no-reply@cholojai.app`  | M3        |
| `RESEND_API_KEY`            | Production email provider             | —                        | M12       |
| `CLOUDINARY_URL`            | Image storage                         | —                        | M7        |
| `NOMINATIM_BASE_URL`        | Geocoding upstream                    | public instance          | M6        |
| `OSRM_BASE_URL`             | Routing upstream                      | public instance          | M6        |
| `RATE_LIMIT_GLOBAL_PER_MIN` | Global throttle                       | `100`                    | M2        |
| `SWAGGER_ENABLED`           | Serve API docs at /api/docs           | on unless production     | M2        |
| `LOG_LEVEL`                 | pino level                            | `info`                   | M2        |

## `apps/web`

| Variable                   | Purpose                      | Example / default              | Milestone |
| -------------------------- | ---------------------------- | ------------------------------ | --------- |
| `NEXT_PUBLIC_API_BASE_URL` | Browser → API origin         | `http://localhost:4000/api/v1` | M2        |
| `NEXT_PUBLIC_WS_URL`       | Socket.IO endpoint           | `http://localhost:4000/rt`     | M6        |
| `NEXT_PUBLIC_SITE_URL`     | Canonical URL (SEO, sitemap) | `http://localhost:3000`        | M4        |
| `NEXT_PUBLIC_MAP_TILE_URL` | OSM tile template            | OSM default                    | M6        |

## Secrets management

Local development uses `.env` (gitignored). Production secrets live in the
platform's secret store — Vercel project settings for the web app, Railway
variables for the API — never in the repository, and never in CI logs.
Rotation procedure is documented in `deployment.md`.
