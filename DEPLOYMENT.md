# Deploying Maqaaxi Pos

**Target:** `https://menu.kfggalkacyo.com` on a 1 GB AWS Lightsail box (Ubuntu, amd64).

**How it works:** every push to `main` makes GitHub Actions (`.github/workflows/build-images.yml`)
typecheck + test, then build both images and push them to GHCR. The server holds **no source
code** — just the compose file, one `.env` and a few scripts — and only ever *pulls* images.
Nothing is compiled on the box; it does not have the RAM.

```
git push main ─► Actions: typecheck · tests · build ─► ghcr.io/ismalure12/maqaaxi-api:{latest,sha-xxxxxxx}
                                                       ghcr.io/ismalure12/maqaaxi-web:{latest,sha-xxxxxxx}
                                                                     │  bash deploy/pull-and-restart.sh
                                                                     ▼
Browser ─► nginx (host, TLS) ─► web :3100 ─┐
                             └► api :4000 ─┴─► postgres :5432      (all bound to 127.0.0.1)
```

- **`latest`** = the newest `main` build. **`sha-<7 chars>`** = one exact commit — use it to pin
  or roll back.
- The images are only as new as what is **pushed**. Local, uncommitted work is never on GHCR.
- Migrations ship **inside the api image** (`apps/api/prisma/migrations`), so the server runs
  them without a checkout.

### What lives on the server

```
/srv/maqaaxi/
├── docker-compose.yml               # from the repo
├── .env                             # from .env.example, filled in — never leaves the box
├── deploy/
│   ├── pull-and-restart.sh          # the deploy command
│   └── nginx/menu.kfggalkacyo.com.conf
├── scripts/
│   ├── backup-db.sh                 # nightly cron
│   └── copy-neon-to-docker.sh       # one-off, first install only
└── backups/                         # created by backup-db.sh
```

These files change rarely. When a commit touches one of them, copy it up again (step A.2).

---

## A. One-time setup

### 1. DNS and firewall

- Point an **A record** for `menu.kfggalkacyo.com` at the Lightsail **static IP**
  (attach a static IP first, or the address changes on reboot).
- In the Lightsail networking tab allow **22, 80, 443** only. Postgres, the API and the web
  app are bound to `127.0.0.1` and must never be reachable from outside.
- Wait for DNS to resolve before step 7 — certbot fails otherwise:
  `dig +short menu.kfggalkacyo.com`

### 2. Prepare the server and copy the files up

On the server:

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

sudo mkdir -p /srv/maqaaxi/deploy/nginx /srv/maqaaxi/scripts && sudo chown -R $USER /srv/maqaaxi
```

From your machine, in the repo root (`KEY` = the Lightsail SSH key, `HOST` = `ubuntu@<static-ip>`):

```bash
scp -i KEY docker-compose.yml .env.example               HOST:/srv/maqaaxi/
scp -i KEY deploy/pull-and-restart.sh                    HOST:/srv/maqaaxi/deploy/
scp -i KEY deploy/nginx/menu.kfggalkacyo.com.conf        HOST:/srv/maqaaxi/deploy/nginx/
scp -i KEY scripts/backup-db.sh scripts/copy-neon-to-docker.sh HOST:/srv/maqaaxi/scripts/
```

`.gitattributes` keeps these LF even on a Windows checkout — a CRLF shell script fails on
Ubuntu with `$'\r': command not found`.

### 3. Log in to GHCR (packages are private)

On GitHub: **Settings → Developer settings → Personal access tokens → Tokens (classic)**,
scope **`read:packages`** only.

```bash
echo '<PASTE_TOKEN>' | docker login ghcr.io -u Ismalure12 --password-stdin
```

Docker keeps the login in `~/.docker/config.json`; you do this once.

### 4. Fill in the secrets

```bash
cd /srv/maqaaxi
cp .env.example .env && chmod 600 .env
nano .env
```

One `.env` for the whole stack. Set every `CHANGE_ME`, and:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `POSTGRES_PASSWORD` | `openssl rand -base64 24` |
| `DATABASE_URL` | same password, `@localhost:5433` (host-side tools only). The api container builds its own `postgres:5432` URL. |
| `JWT_SECRET` | `openssl rand -base64 48` |
| `PUBLIC_APP_URL` | `https://menu.kfggalkacyo.com` |
| `PAYMENT_RECONCILER` / `TRUST_PROXY` | `on` / `1` |
| `SIFALO_API_USER` / `SIFALO_API_KEY` | from Sifalo |
| `AWS_*` / `S3_BUCKET_NAME` | the S3 bucket for menu images (bucket policy: public `s3:GetObject`) |
| `EMAIL_USER` / `EMAIL_APP_PASSWORD` | Gmail app password |
| `API_HOST_PORT` / `WEB_HOST_PORT` | `4000` / `3100` (what nginx proxies to) |
| `NEON_DATABASE_URL` | the Neon URL — only for step 5, delete it afterwards |
| Seed accounts, `API_ORIGIN` | leave empty / as is — not used on the server |

The API refuses to boot in production if a Sifalo, `PUBLIC_APP_URL` or S3 variable is
missing. The web container gets nothing from this file — its only setting
(`API_ORIGIN=http://api:4000`) is baked into the image.

### 5. Database

```bash
cd /srv/maqaaxi
docker compose up -d postgres

# One-off copy from Neon. Reads Neon only, refuses to restore over a non-empty DB,
# and compares row counts table by table at the end.
bash scripts/copy-neon-to-docker.sh

# Pull the images and apply any migrations newer than the copy
docker compose pull api web
docker compose run --rm api npm run db:deploy
```

> **Never run `npm run db:seed` against this database** — it deletes and recreates the menu.

### 6. Start the app

```bash
bash deploy/pull-and-restart.sh
```

### 7. nginx, then the certificate

```bash
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

### 8. Nightly backups

```bash
crontab -e
# add:
15 3 * * * cd /srv/maqaaxi && bash scripts/backup-db.sh >> backups/backup.log 2>&1
```

Copy `backups/*.dump` off the box — a backup on the same disk is not a backup.

---

## B. Every deploy after that

1. **Push to `main`** and wait for the **Build images** workflow to go green
   (GitHub → Actions). Note the short sha — it is the image tag `sha-<sha>`.
2. **On the server:**

   ```bash
   cd /srv/maqaaxi && bash deploy/pull-and-restart.sh
   ```

   It pulls `:latest`, restarts, waits until the API is healthy (prints its logs and fails
   if not), prunes old images and shows which image each service runs.
3. **If the release contains a migration** (a new folder in `apps/api/prisma/migrations`):

   ```bash
   docker compose run --rm api npm run db:deploy
   ```

   Only backward-compatible migrations (new tables, nullable columns, indexes) go to the
   live database, so running it right after the restart is safe.
4. **If the commit changed** `docker-compose.yml`, `.env.example`, `deploy/*` or `scripts/*`,
   `scp` the changed file up (A.2) before step 2 — and add any new `.env` variable by hand.

### Pin or roll back

```bash
bash deploy/pull-and-restart.sh sha-abc1234     # that exact build, this run only
```

To keep a pin across later runs, set it in `.env` instead:

```
API_IMAGE=ghcr.io/ismalure12/maqaaxi-api:sha-abc1234
WEB_IMAGE=ghcr.io/ismalure12/maqaaxi-web:sha-abc1234
```

(and remove both lines to go back to `:latest`). Code rolls back; **migrations do not** — the
reason migrations must stay backward-compatible.

---

## C. Test the production images locally first

Same compose file, same `.env` shape, but built from your working tree:

```bash
docker compose up -d --build          # host ports from .env: API_HOST_PORT / WEB_HOST_PORT
docker compose ps                     # api + web → (healthy)
curl -s localhost:4300/api/health     # {"ok":true,...}
curl -sI localhost:3300/              # 200 — then open it in a browser
docker compose run --rm api npx prisma migrate status
docker compose down                   # the postgres volume is kept
```

Locally `API_HOST_PORT`/`WEB_HOST_PORT` are `4300`/`3300` (4000/3100 are often taken).
`docker compose pull` on your machine replaces the locally built `:latest` with the last
pushed build — run `up -d --build` again afterwards to get your own code back.

---

## D. Verify it works

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
docker compose ps
docker compose images api web         # which tag/digest is running
docker compose logs -f api
free -h && df -h /
```

---

## E. Before taking real money — owner checklist

- [ ] **`FIXED_CHARGE_USD` in `apps/api/src/lib/payments/sifalo.ts` is still `'0.01'`.**
      Every online checkout charges 1 cent instead of the order total. Set it to `null`,
      commit, push, and deploy when you are ready. The API prints
      `Sifalo TEST CHARGE active` at boot for as long as it is set — check the logs.
- [ ] Confirm Sifalo accepts `https://menu.kfggalkacyo.com` as the return URL.
- [ ] Settings → General: turn **online ordering** on when checkout should open.
- [ ] Settings → Money: opening balances and the opening date.
- [ ] Inventory: an opening stock count.
- [ ] Settings: staff wallet numbers (they print on receipts).
- [ ] **Only after this deploy is live and stable**, apply the held migration
      `apps/api/prisma/held/01_drop_banners_period_shifts.sql` (move it into
      `prisma/migrations/<timestamp>_drop_banners_period_shifts/migration.sql`, push, deploy,
      then `db:deploy`). Applying it earlier breaks the currently deployed build.

---

## F. Notes

- **`API_ORIGIN` is baked at image build time.** `next.config.mjs` fixes the `/api` rewrite
  destination during `next build`, so it is a build-arg in the workflow, not a runtime
  variable. In production nginx routes `/api` straight to the API and Next's rewrite is only
  a backstop.
- **`TRUST_PROXY=1`** matches exactly one proxy hop (host nginx). With the wrong value the
  payment rate limits either see every request as one IP or can be faked with a header.
- **Migrations never run on container boot** — deliberately. You run them.
- **The API drains on SIGTERM** (open SSE streams, in-flight requests). `stop_grace_period`
  is 130s in the compose file; do not shorten it.
- **GHCR packages are private.** Keep the `read:packages` token on the server only; the
  workflow pushes with the repo's own `GITHUB_TOKEN`.
