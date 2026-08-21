# Deploying Pixel Paddle to production

Production is a GCP VM — project `jarvis-ai-450720`, zone `us-east1-b`, instance
`pixelpaddle-backend`, IP `34.148.7.172`. There is no deploy automation: CI only
builds and tests. Everything below is run by hand over SSH.

**Layout**

| Thing | Where |
|---|---|
| Repo | `~/tournament/app/TournamentMatchMaker` |
| API + worker | **pm2** — `tournament-api`, `tournament-worker` (not Docker) |
| Postgres / Redis | Docker — `infra-postgres-1`, `infra-redis-1` |
| Frontend | nginx serves `/var/www/tournament` |
| API vhost | `api.tournament.pixelpaddle.com` -> `127.0.0.1:3000` |

> The `techversa_*` containers are an unrelated WordPress shop on the same box.

## Two rules

1. **Never run `pnpm build` on the VM.** It fans out across workspaces; the box
   has 3.9 GB shared with Postgres, Redis, the API, the worker and WordPress.
   It has wedged production twice. Build one package at a time, capped, and
   watch `free -m`.
2. **Never build the web app with the `grep | cut` line from `.bash_history`.**
   `.env` holds two `VITE_STRIPE_PUBLISHABLE_KEY` entries; that command
   concatenates both and ships a broken Stripe key. Use `tail -n1` (step 7).

---

## 0. Connect

```powershell
ssh -i C:\Users\aadil\.ssh\meta_integration meta-integration@34.148.7.172
```

Git Bash / WSL: `ssh -i /c/Users/aadil/.ssh/meta_integration meta-integration@34.148.7.172`

```bash
cd ~/tournament/app/TournamentMatchMaker
export PATH=$PATH:/home/meta-integration/.local/share/pnpm
free -m && df -h / && git log --oneline -1
```

## 1. What is about to ship

```bash
git fetch origin
git log --oneline HEAD..origin/main
git diff --name-only HEAD origin/main -- packages/db/migrations/   # migrations?
git diff --name-only HEAD origin/main | grep -E 'package.json|pnpm-lock'   # deps?
git diff --name-only HEAD origin/main | grep '^apps/web/'          # frontend?
```

Skip steps you do not need: no `apps/web` changes means no steps 7-8 (and the
asset filenames stay put, which avoids re-triggering the NordVPN block).

## 2. Back up the database — only if a migration is shipping

```bash
sudo docker exec infra-postgres-1 pg_dump -U vrtournament vrtournament \
  | gzip > ~/db-backup-$(date +%Y%m%d-%H%M%S).sql.gz && ls -lh ~/db-backup-*.sql.gz | tail -1
```

Let it finish before starting anything else.

## 3. Pull

```bash
git pull origin main && git log --oneline -1
```

## 4. Dependencies — only if package.json / pnpm-lock changed

```bash
pnpm install
```

## 5. Build, one package at a time

```bash
NODE_OPTIONS=--max-old-space-size=768 pnpm --filter @vr-tournament/shared build && free -m
NODE_OPTIONS=--max-old-space-size=768 pnpm --filter @vr-tournament/api    build && free -m
NODE_OPTIONS=--max-old-space-size=768 pnpm --filter @vr-tournament/worker build && free -m
```

If `available` is under ~400 MB, stop and build locally instead, then rsync
`packages/shared/dist`, `apps/api/dist`, `apps/worker/dist`.

## 6. Migrations — only if new files appeared in step 1

```bash
pnpm --filter @vr-tournament/db migrate:up
```

Pre-flight first for anything that adds a UNIQUE index or casts stored values —
a migration that aborts halfway is worse than one you delayed.

## 7. Build the frontend — only if `apps/web` changed

```bash
STRIPE_PK="$(grep '^VITE_STRIPE_PUBLISHABLE_KEY=' .env | tail -n1 | cut -d= -f2- | tr -d '\r\n')"
NODE_OPTIONS=--max-old-space-size=768 \
  VITE_API_URL=https://api.tournament.pixelpaddle.com \
  VITE_STRIPE_PUBLISHABLE_KEY="$STRIPE_PK" \
  pnpm --filter @vr-tournament/web build
```

Verify exactly one live key before publishing:

```bash
grep -o 'pk_[a-zA-Z]*_[A-Za-z0-9]\{6\}' apps/web/dist/assets/*.js | sort -u
```

## 8. Publish the frontend

```bash
sudo cp -p /var/www/tournament/index.html /var/www/tournament/index.html.bak-$(date +%Y%m%d-%H%M%S)
sudo cp -r apps/web/dist/* /var/www/tournament/
sudo chown -R www-data:www-data /var/www/tournament
```

## 9. Restart

```bash
pm2 restart tournament-api tournament-worker --update-env && pm2 save && pm2 list
```

## 10. Verify

```bash
curl -s -o /dev/null -w 'site=%{http_code}\n' https://tournament.pixelpaddle.com/
curl -s -o /dev/null -w 'api=%{http_code}\n'  https://api.tournament.pixelpaddle.com/api/v1/tournaments
pm2 logs tournament-api --lines 30 --nostream
```

---

## Logs

```bash
pm2 logs                          # both, live
pm2 logs tournament-api --err     # errors only
pm2 logs tournament-api --lines 50 --nostream   # non-interactive
docker logs -f --tail 50 infra-postgres-1
sudo tail -f /var/log/nginx/error.log
```

## If the box stops responding

Symptom: TCP connects on 22/443 but nothing answers, SSH fails at "banner
exchange". Userspace is starved — usually a build.

1. **GCP Console -> serial console** (works when sshd cannot fork):
   `free -m`, `pkill -f tsc`, `docker stats --no-stream`
2. Otherwise reset:
   `gcloud compute instances reset pixelpaddle-backend --zone=us-east1-b --project=jarvis-ai-450720`
3. Once back, find out which it was:
   `sudo journalctl -k --since "30 min ago" | grep -i -E "out of memory|oom|killed process"`

pm2 has a startup hook and the containers restart on boot, so services return by
themselves.

## Rollback

```bash
# frontend — old hashed assets are still on disk
sudo cp /var/www/tournament/index.html.bak-<stamp> /var/www/tournament/index.html

# api / worker
git checkout <previous-sha>
NODE_OPTIONS=--max-old-space-size=768 pnpm --filter @vr-tournament/shared build
NODE_OPTIONS=--max-old-space-size=768 pnpm --filter @vr-tournament/api build
pm2 restart tournament-api tournament-worker

# database
gunzip -c ~/db-backup-<stamp>.sql.gz | sudo docker exec -i infra-postgres-1 psql -U vrtournament -d vrtournament
```
