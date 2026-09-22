#!/usr/bin/env bash
# Nightly Postgres backup for the Docker database (Lightsail).
#   bash scripts/backup-db.sh                 # writes backups/maqaaxi-YYYY-MM-DD-HHMM.dump, keeps 14
# cron (as the deploy user):  15 3 * * *  cd /srv/maqaaxi && bash scripts/backup-db.sh >> backups/backup.log 2>&1
# A backup on the same disk is not a backup: copy the file off the box after
# (e.g. `aws s3 cp` / rclone), and test a restore now and then:
#   docker exec -i maqaaxi-postgres-1 createdb -U maqaaxi restore_test
#   docker exec -i maqaaxi-postgres-1 pg_restore -U maqaaxi -d restore_test --no-owner < backups/<file>.dump
set -euo pipefail
export MSYS_NO_PATHCONV=1

CONTAINER=${CONTAINER:-maqaaxi-postgres-1}
KEEP=${KEEP:-14}
DIR="$(pwd)/backups"
mkdir -p "$DIR"
FILE="$DIR/maqaaxi-$(date +%F-%H%M).dump"

docker exec "$CONTAINER" pg_dump -U maqaaxi -d maqaaxi -Fc --no-owner --no-acl > "$FILE.part"
mv "$FILE.part" "$FILE"
echo "$(date -Is) backup ok: $FILE ($(du -h "$FILE" | cut -f1))"

# Keep the newest $KEEP dumps.
ls -1t "$DIR"/maqaaxi-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm --
