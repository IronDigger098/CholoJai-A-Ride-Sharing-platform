# CholoJai API — production image.
#
# The build context is the *repository root*, not `apps/api`. A pnpm
# workspace package cannot be built in isolation: `@cholojai/api` imports
# `@cholojai/shared`, and the lockfile that pins both lives at the root.
# Railway is told where this file is via `railway.json`.
#
# Multi-stage, and the reason is size rather than tidiness. The build needs
# TypeScript, the Nest CLI and every devDependency; the running container
# needs none of them. Shipping one stage would mean a production image
# carrying its own compiler — more to download on every deploy, and a
# larger surface for anything that gets found in a build tool later.

# ─── Base ────────────────────────────────────────────────────────────────
# Pinned to a minor version, never `latest` or a bare major. `node:22` moves
# under you: the image that built a release is not the image that rebuilds
# it a month later, and "works on the previous deploy" is not a debuggable
# state. Alpine for size; the API compiles nothing native at runtime.
FROM node:22.14-alpine AS base

# OpenSSL is not in the Alpine base image and Prisma's query engine links
# against it. Without this the container builds cleanly and then dies on
# first connection with an error that names a shared object, not a package.
RUN apk add --no-cache openssl

# Corepack pins pnpm to the version in package.json's `packageManager`
# field, so the image resolves dependencies exactly as CI and every
# developer machine did. Installing pnpm globally would float.
RUN corepack enable

WORKDIR /app

# ─── Dependencies ────────────────────────────────────────────────────────
# Manifests only, before any source. Docker caches a layer until its inputs
# change, so editing a service file re-runs the build but *not* the
# install — which is the difference between a thirty-second deploy and a
# three-minute one. Copying source first would invalidate the install on
# every commit.
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/

# `--frozen-lockfile` fails rather than silently resolving a different tree
# when the lockfile and manifests disagree. In CI and in a deploy that is
# the only acceptable behaviour: a deploy that quietly upgrades a transitive
# dependency is a deploy nobody reviewed.
#
# `--ignore-scripts` because `apps/api` has a `postinstall` that generates
# the Prisma client, and the schema has not been copied yet. It runs
# explicitly in the build stage below, where the schema exists.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Build ───────────────────────────────────────────────────────────────
FROM deps AS build

COPY tsconfig.json turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api

# Before the TypeScript build: the generated client is what `PrismaService`
# imports, so without it the API does not compile.
RUN pnpm --filter @cholojai/api exec prisma generate

# The shared package first — the API's build reads its emitted types, not
# its source. Turbo would order this itself, but naming both explicitly
# keeps the image independent of the task graph's configuration.
RUN pnpm --filter @cholojai/shared build
RUN pnpm --filter @cholojai/api build

# Drop everything the running process does not need. `--prod` re-resolves
# the tree without devDependencies; `deploy` flattens the workspace into a
# single self-contained directory, which is what makes it copyable into a
# stage that has no workspace root.
RUN pnpm --filter @cholojai/api deploy --prod --legacy /app/pruned

# ─── Runtime ─────────────────────────────────────────────────────────────
FROM base AS runtime

ENV NODE_ENV=production

# Not root. A process that never writes to its own image has no reason to
# be able to, and `node` already exists in the base image with a home
# directory — creating another user would be ceremony.
USER node

WORKDIR /app

COPY --from=build --chown=node:node /app/pruned/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./package.json

# The migration files and schema travel with the image. `migrate deploy`
# runs at container start (see `railway.json`), and it needs the migrations
# folder — an image without it starts against whatever the database
# happens to look like.
COPY --from=build --chown=node:node /app/apps/api/prisma ./prisma

# Documentation, not a binding. The platform decides the real port through
# PORT, which `env.schema.ts` reads; EXPOSE only tells a human — and
# `docker run -P` — what to expect.
EXPOSE 4000

# Exec form, no shell. With the shell form the process runs as a child of
# `/bin/sh`, which does not forward SIGTERM — so `enableShutdownHooks()` in
# `main.ts` never fires, in-flight requests are severed, and every deploy
# drops connections. This one line is what makes graceful shutdown real.
CMD ["node", "dist/main.js"]
