#!/usr/bin/env bash
# Devcontainer / Codespaces bootstrap. Runs as postCreateCommand, so Postgres and Redis are
# already healthy (compose `depends_on` gates container creation).
#
# Every step is tolerant: a failure here should leave you with a usable editor and a clear
# message, not a broken Codespace. The geo smoke test in particular needs none of the
# database steps below.
set -uo pipefail

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33m    %s\033[0m\n' "$1"; }

cd "$(dirname "$0")/.."

step "Node / npm versions"
node --version
npm --version
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  warn "WARNING: this repo requires Node >= 22.12. The devcontainer image pins 22,"
  warn "so seeing this means the image was overridden."
fi

step "Generating .env files"
node scripts/codespace-env.mjs

step "Installing dependencies (npm ci)"
# Prisma's engines download at install time; Codespaces has normal egress so this works,
# unlike a network-restricted sandbox.
if ! npm ci; then
  warn "npm ci failed. Retrying with --ignore-scripts (skips the Prisma engine download)."
  npm ci --ignore-scripts || warn "Install failed — run `npm ci` manually to see why."
fi

step "Building @atlas/contracts (required before any typecheck or test)"
npm run build --workspace @atlas/contracts || warn "contracts build failed"

step "Generating the Prisma client"
npm run db:generate || warn "prisma generate failed — API tests that load Prisma will fail"

step "Applying migrations"
# `migrate deploy` rather than `migrate dev`: non-interactive, and it will not try to create
# a new migration if the schema and migrations disagree.
npm run db:deploy --if-present || warn "migrations not applied — run: npm run db:migrate"

cat <<'BANNER'

──────────────────────────────────────────────────────────────────────────────
  Atlas AI is ready.

  Fastest useful check — verifies the free geo providers really answer, with no
  database and no auth involved:

      cd apps/api && npm run test:geo-smoke

  Full stack:

      npm run db:seed        # optional sample data
      npm run dev:api        # API on port 4000
      npm run dev            # API + mobile together

  Read the port-visibility notes in docs/codespaces.md before sharing a demo.
──────────────────────────────────────────────────────────────────────────────
BANNER
