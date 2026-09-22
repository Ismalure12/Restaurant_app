#!/usr/bin/env bash
# One-off: copy the whole Neon database into the local Docker Postgres.
# Neon is only READ (pg_dump). Run from the repo root with Docker running:
#   bash scripts/copy-neon-to-docker.sh
# Needs: apps/api/.env with the Neon DATABASE_URL, .env.docker with POSTGRES_PASSWORD.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: don't rewrite /paths

CONTAINER=maqaaxi-postgres-1
DUMP_DIR="$(pwd)/.db-dumps"
mkdir -p "$DUMP_DIR"

# Direct (non-pooled) Neon URL: pg_dump needs a session, not PgBouncer.
NEON_URL=$(grep '^DATABASE_URL' apps/api/.env | sed -E 's/^DATABASE_URL=//; s/^"//; s/"$//; s/-pooler//; s/&channel_binding=require//')
case "$NEON_URL" in *neon.tech*) ;; *) echo "apps/api/.env DATABASE_URL is not the Neon URL — aborting" >&2; exit 1 ;; esac

docker compose --env-file .env.docker up -d postgres
until docker exec "$CONTAINER" pg_isready -U maqaaxi -d maqaaxi >/dev/null 2>&1; do sleep 1; done

existing=$(docker exec "$CONTAINER" psql -U maqaaxi -d maqaaxi -Atc "select count(*) from pg_tables where schemaname='public'")
if [ "$existing" != "0" ]; then
  echo "Local database 'maqaaxi' already has $existing tables — refusing to restore over it." >&2
  exit 1
fi

if [ -s "$DUMP_DIR/neon.dump" ] && [ "${FRESH_DUMP:-0}" != "1" ]; then
  echo "Using existing .db-dumps/neon.dump (FRESH_DUMP=1 to dump Neon again)"
else
echo "Dumping Neon (read-only)…"
docker run --rm -e PGURL="$NEON_URL" -v "$DUMP_DIR:/out" postgres:18-alpine \
  sh -c 'pg_dump "$PGURL" -Fc --no-owner --no-acl -f /out/neon.dump'
fi

echo "Restoring into Docker…"
# Piped through stdin: no host-path translation (Git Bash / Windows paths).
docker exec -i "$CONTAINER" pg_restore -U maqaaxi -d maqaaxi --no-owner --no-acl --exit-on-error < "$DUMP_DIR/neon.dump"

echo "Row counts — Neon vs local (must match):"
COUNT_SQL="select string_agg(format('%s=%s', table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text), E'\n' order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
docker run --rm -e PGURL="$NEON_URL" -e SQL="$COUNT_SQL" postgres:18-alpine sh -c 'psql "$PGURL" -Atc "$SQL"' > "$DUMP_DIR/neon-counts.txt"
docker exec "$CONTAINER" psql -U maqaaxi -d maqaaxi -Atc "$COUNT_SQL" > "$DUMP_DIR/local-counts.txt"
if diff "$DUMP_DIR/neon-counts.txt" "$DUMP_DIR/local-counts.txt"; then
  echo "OK — every table has the same number of rows. Dump kept at .db-dumps/neon.dump"
else
  echo "MISMATCH — see the diff above." >&2
  exit 1
fi
