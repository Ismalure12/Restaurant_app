#!/usr/bin/env bash
# Pull the images GitHub Actions pushed to GHCR and restart the stack.
# Idempotent — safe to run again if it fails halfway.
#
#   bash deploy/pull-and-restart.sh                # :latest (the newest main build)
#   bash deploy/pull-and-restart.sh sha-abc1234    # pin / roll back to one build
#
# The server holds no source code — only docker-compose.yml, .env and these
# scripts (see DEPLOYMENT.md). Nothing is ever built on this box.
set -euo pipefail

cd "$(dirname "$0")/.."
[ -f docker-compose.yml ] || { echo "missing docker-compose.yml next to deploy/" >&2; exit 1; }
[ -f .env ] || { echo "missing .env — copy .env.example and fill it in" >&2; exit 1; }

# A tag argument overrides API_IMAGE/WEB_IMAGE from .env for this run.
if [ $# -gt 0 ]; then
  export API_IMAGE="ghcr.io/ismalure12/maqaaxi-api:$1"
  export WEB_IMAGE="ghcr.io/ismalure12/maqaaxi-web:$1"
fi
COMPOSE=(docker compose)

echo "==> pulling images"
"${COMPOSE[@]}" pull api web

echo "==> starting"
"${COMPOSE[@]}" up -d --no-build --remove-orphans

echo "==> waiting for the API to report healthy"
status=
for _ in $(seq 1 60); do
  status=$("${COMPOSE[@]}" ps --format '{{.Health}}' api 2>/dev/null | head -1)
  [ "$status" = "healthy" ] && { echo "    api healthy"; break; }
  sleep 2
done
if [ "$status" != "healthy" ]; then
  echo "api did not become healthy — last 50 log lines:" >&2
  "${COMPOSE[@]}" logs --tail=50 api >&2
  exit 1
fi

echo "==> reclaiming disk from old images"
docker image prune -f

"${COMPOSE[@]}" ps
echo "==> running images"
"${COMPOSE[@]}" images api web

cat <<'NOTE'

Done. Two things this script deliberately does NOT do:

  Migrations (never on boot — run them when a release has one; they ship inside the api image):
    docker compose run --rm api npm run db:deploy

  Keep a rollback in place: pass the tag again next time, or set API_IMAGE/WEB_IMAGE in .env.
NOTE
