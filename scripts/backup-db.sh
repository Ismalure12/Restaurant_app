#!/usr/bin/env bash
# Nightly Postgres backup for the Docker database (Lightsail).
#   bash scripts/backup-db.sh                 # writes backups/maqaaxi-YYYY-MM-DD-HHMM.dump, keeps 14,
#                                             # then copies it to S3 (private, encrypted): backups/<file>
#   BACKUP_S3=off bash scripts/backup-db.sh   # local copy only
# cron (as the deploy user):  15 3 * * *  cd /srv/maqaaxi && bash scripts/backup-db.sh >> backups/backup.log 2>&1
# Run it from the folder that holds docker-compose.yml and .env (the S3 copy
# runs in the api image with the .env AWS keys — nothing to install).
# S3 keeps the old copies until its lifecycle rule deletes them (DEPLOYMENT.md §8).
# Test a restore now and then:
#   docker exec -i maqaaxi-postgres-1 createdb -U maqaaxi restore_test
#   docker exec -i maqaaxi-postgres-1 pg_restore -U maqaaxi -d restore_test --no-owner < backups/<file>.dump
set -euo pipefail
export MSYS_NO_PATHCONV=1

CONTAINER=${CONTAINER:-maqaaxi-postgres-1}
KEEP=${KEEP:-14}
DIR="$(pwd)/backups"
mkdir -p "$DIR"
NAME="maqaaxi-$(date +%F-%H%M).dump"
FILE="$DIR/$NAME"

docker exec "$CONTAINER" pg_dump -U maqaaxi -d maqaaxi -Fc --no-owner --no-acl > "$FILE.part"
mv "$FILE.part" "$FILE"
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the newest $KEEP dumps on this disk.
ls -1t "$DIR"/maqaaxi-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm --

# Off-site copy. A failure keeps the local dump and exits 1 so the log shows it.
if [ "${BACKUP_S3:-on}" = "off" ]; then
  echo "$(date -Is) S3 copy skipped (BACKUP_S3=off)"
  exit 0
fi
[ -f docker-compose.yml ] || { echo "$(date -Is) S3 copy FAILED: run from the folder with docker-compose.yml" >&2; exit 1; }
if docker compose run --rm -T --no-deps api node dist/cli/uploadBackup.js "$NAME" < "$FILE"; then
  echo "$(date -Is) S3 copy ok: backups/$NAME"
else
  echo "$(date -Is) S3 copy FAILED for $NAME — the local copy is kept in backups/" >&2
  exit 1
fi
