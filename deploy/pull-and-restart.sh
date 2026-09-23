#!/usr/bin/env bash
# Pull the latest images from GHCR and restart the stack. Idempotent — safe to
# run again if it fails halfway.
#
#   cd /srv/maqaaxi && git pull && bash deploy/pull-and-restart.sh
#
# Images are built by GitHub Actions; nothing is compiled on this box.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file .env.docker)

for f in .env.docker deploy/api.env; do
  [ -f "$f" ] || { echo "missing $f — copy it from ${f}.example and fill it in" >&2; exit 1; }
done

echo "==> pulling images"
"${COMPOSE[@]}" pull

echo "==> starting"
"${COMPOSE[@]}" up -d --remove-orphans

echo "==> waiting for the API to report healthy"
for _ in $(seq 1 60); do
  status=$("${COMPOSE[@]}" ps --format '{{.Health}}' api 2>/dev/null | head -1)
  [ "$status" = "healthy" ] && { echo "    api healthy"; break; }
  sleep 2
done
if [ "${status:-}" != "healthy" ]; then
  echo "api did not become healthy — last 50 log lines:" >&2
  "${COMPOSE[@]}" logs --tail=50 api >&2
  exit 1
fi

echo "==> reclaiming disk from old images"
docker image prune -f

"${COMPOSE[@]}" ps

cat <<'NOTE'

Done. Two things this script deliberately does NOT do:

  Migrations (never run on boot — run them yourself when a release has one):
    docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
      --env-file .env.docker run --rm api npm run db:deploy

  Rollback (find the sha tag in the GitHub Actions run, then):
    API_IMAGE=ghcr.io/ismalure12/maqaaxi-api:sha-abc1234 \
    WEB_IMAGE=ghcr.io/ismalure12/maqaaxi-web:sha-abc1234 \
      bash deploy/pull-and-restart.sh
NOTE
