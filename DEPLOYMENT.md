# Deploying Maqaaxi Pos

**Target:** `https://menu.kfggalkacyo.com` on a 1 GB AWS Lightsail box (Ubuntu, amd64).

**How it works:** GitHub Actions builds both images and pushes them to GHCR. The server only
*pulls*. Nothing is ever compiled on the box — it does not have the RAM.

```
GitHub push  →  Actions builds  →  ghcr.io/ismalure12/maqaaxi-{api,web}
                                            ↓  docker compose pull
Browser  →  nginx (host, TLS)  →  web :3100  +  api :4000  →  postgres :5432
                                   (all three bound to 127.0.0.1)
```

---

## A. One-time setup

### 1. DNS and firewall

- Point an **A record** for `menu.kfggalkacyo.com` at the Lightsail **static IP**
  (attach a static IP first, or the address changes on reboot).
- In the Lightsail networking tab allow **22, 80, 443** only. Postgres, the API and the web
  app are bound to `127.0.0.1` and must never be reachable from outside.
- Wait for DNS to resolve before step 6 — certbot fails otherwise:
  `dig +short menu.kfggalkacyo.com`

### 2. Prepare the server

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# nginx + certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# 2 GB swap — 1 GB RAM runs Postgres + API + Next + nginx with no headroom
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# The repo (for the compose files, nginx conf and scripts — not for building)
sudo mkdir -p /srv && sudo chown $USER /srv
git clone <your-repo-url> /srv/maqaaxi && cd /srv/maqaaxi
```

### 3. Log in to GHCR (packages are private)

On GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic)**,
scope **`read:packages`** only.

```bash
echo '<PASTE_TOKEN>' | docker login ghcr.io -u Ismalure12 --password-stdin
```

### 4. Fill in the secrets

```bash
cd /srv/maqaaxi
printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -base64 24)" > .env.docker
cp deploy/api.env.example deploy/api.env
nano deploy/api.env
```

In `deploy/api.env` set every `CHANGE_ME`:

| Variable | Value |
|---|---|
| `DATABASE_URL` | same password as `.env.docker`, host stays `postgres:5432` |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `SIFALO_API_USER` / `SIFALO_API_KEY` | from Sifalo |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob (menu images) |
| `EMAIL_USER` / `EMAIL_APP_PASSWORD` | Gmail app password |

`PUBLIC_APP_URL` is already `https://menu.kfggalkacyo.com`. Both files are gitignored — they
never get committed.

### 5. Database

```bash
cd /srv/maqaaxi
docker compose --env-file .env.docker up -d postgres

# One-off copy from Neon. Reads Neon only, and refuses to restore over a non-empty DB.
# Needs the Neon URL in apps/api/.env.
bash scripts/copy-neon-to-docker.sh

# Apply migrations
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  --env-file .env.docker run --rm api npm run db:deploy
```

> **Never run `npm run db:seed` against this database** — it deletes and recreates the menu.

### 6. Start the app, then get the certificate

```bash
bash deploy/pull-and-restart.sh

sudo cp deploy/nginx/menu.kfggalkacyo.com.conf /etc/nginx/sites-available/
sudo ln -sf /etc/nginx/sites-available/menu.kfggalkacyo.com.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# Install over plain HTTP first (above), THEN issue the cert. certbot edits the
# file in place: it adds the TLS listener and the port-80 redirect itself.
sudo certbot --nginx -d menu.kfggalkacyo.com
```

Renewal is automatic (`certbot.timer`). Check with `sudo certbot renew --dry-run`.

Once HTTPS works, uncomment the `Strict-Transport-Security` line in the nginx conf and
reload. Do this only after TLS is confirmed — HSTS is hard to undo.

### 7. Nightly backups

```bash
crontab -e
# add:
15 3 * * * cd /srv/maqaaxi && bash scripts/backup-db.sh >> backups/backup.log 2>&1
```

Copy `backups/*.dump` off the box — a backup on the same disk is not a backup.

---

## B. Every deploy after that

```bash
cd /srv/maqaaxi && git pull && bash deploy/pull-and-restart.sh
```

Push to `main` first and wait for the **Build images** workflow to finish.

**If the release contains a migration**, run it after the pull:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml \
  --env-file .env.docker run --rm api npm run db:deploy
```

**Rollback** — take the `sha-` tag from the Actions run:

```bash
API_IMAGE=ghcr.io/ismalure12/maqaaxi-api:sha-abc1234 \
WEB_IMAGE=ghcr.io/ismalure12/maqaaxi-web:sha-abc1234 \
  bash deploy/pull-and-restart.sh
```

Code rolls back; **migrations do not**. That is why only backward-compatible migrations
(new tables, nullable columns, indexes) go to the live database.

---

## C. Verify it works

```bash
curl -sI https://menu.kfggalkacyo.com                    # 200
curl -s  https://menu.kfggalkacyo.com/api/health         # {"ok":true,...}
curl -N  https://menu.kfggalkacyo.com/api/admin/events   # 401 unless signed in
```

In a browser:

- [ ] `/` — the menu loads, categories and dish images render
- [ ] `/admin/login` — sign in
- [ ] **Orders badge updates without a refresh** — this is the SSE path. If it only updates
      on a manual reload, nginx is buffering: check the `location = /api/admin/events` block.
- [ ] Ring up one test sale on the Register and print a receipt
- [ ] Scan the QR on a real phone

Useful commands:

```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file .env.docker ps
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml --env-file .env.docker logs -f api
free -h && df -h /
```

---

## D. Before taking real money — owner checklist

- [ ] **`FIXED_CHARGE_USD` in `apps/api/src/lib/payments/sifalo.ts` is still `'0.01'`.**
      Every online checkout charges 1 cent instead of the order total. Set it to `null`,
      commit, and redeploy when you are ready. The API prints
      `Sifalo TEST CHARGE active` at boot for as long as it is set — check the logs.
- [ ] Confirm Sifalo accepts `https://menu.kfggalkacyo.com` as the return URL.
- [ ] Settings → Money: opening balances and the opening date.
- [ ] Inventory: an opening stock count.
- [ ] Settings: staff wallet numbers (they print on receipts).
- [ ] **Only after this deploy is live and stable**, apply the held migration
      `apps/api/prisma/held/01_drop_banners_period_shifts.sql` (move it into
      `prisma/migrations/<timestamp>_drop_banners_period_shifts/migration.sql`, then
      `db:deploy`). Applying it earlier breaks the currently deployed build.

---

## E. Notes

- **`API_ORIGIN` is baked at image build time.** `next.config.mjs` fixes the `/api` rewrite
  destination during `next build`, so it is a build-arg in the workflow, not a runtime
  variable. In production nginx routes `/api` straight to the API and Next's rewrite is only
  a backstop.
- **`TRUST_PROXY=1`** matches exactly one proxy hop (host nginx). With the wrong value the
  payment rate limits either see every request as one IP or can be faked with a header.
- **Migrations never run on container boot** — deliberately. You run them.
- **The API drains on SIGTERM** (open SSE streams, in-flight requests). `stop_grace_period`
  is 130s in the compose file; do not shorten it.
