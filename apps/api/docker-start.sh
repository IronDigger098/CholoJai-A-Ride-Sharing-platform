#!/bin/sh
# Container entrypoint: migrate, then serve.
#
# A script rather than a one-line `sh -c "… && …"` in the host's config,
# because hosts disagree about how they parse that line. Render ran it
# without re-splitting the quoted part, so the shell went looking for a
# single program called "node node_modules/… && exec node dist/main.js"
# and exited 127. `sh docker-start.sh` means the same thing everywhere.
#
# `migrate deploy` runs before the server binds: a failed migration means
# the container never becomes healthy and the previous deploy keeps serving.
#
# `exec` replaces this shell with node, so SIGTERM reaches the process and
# `enableShutdownHooks()` in main.ts still runs on every deploy.
set -eu

node node_modules/prisma/build/index.js migrate deploy
exec node dist/main.js
