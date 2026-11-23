# Deployment

## 1. Prepare the database

- Use managed PostgreSQL 16 (AWS RDS / Aurora in `ap-south-1`, Neon, Supabase or Google Cloud SQL). For India-resident health data, choose an Indian region.
- Create the database and a least-privilege user, set `DATABASE_URL`, and set `DATABASE_SSL=true` if the host requires TLS.
- Run `npm run db:migrate`, then `npm run db:seed` with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` set to create the first super admin. Remove the password from the environment afterwards.
- Turn on automated daily backups and point-in-time recovery.

## 2. Secrets

Generate fresh production secrets and keep them in your platform's secret store, never in git:

```bash
openssl rand -base64 48   # JWT_SECRET
openssl rand -hex 32      # ENCRYPTION_KEY  (back it up: losing it makes encrypted fields unreadable)
openssl rand -base64 32   # OTP_SECRET
openssl rand -hex 24      # CRON_SECRET
```

Set `APP_ENV=production` and `SANDBOX_MODE=false`. In production, sandbox data and development OTP codes are always disabled.

## 3. Choose where to run

**Docker (any VM, ECS, Cloud Run, Kubernetes)**

```bash
docker build -t vitalora-api .
docker run --env-file .env.production -p 3000:3000 vitalora-api
```

Run migrations as a one-off job before each release:

```bash
docker run --env-file .env.production vitalora-api npx tsx src/db/migrate.ts
```

**Vercel:** import the repository, add the environment variables, and add a cron job for `POST /api/cron/reminders` every 15 minutes with the `CRON_SECRET` header. Use a pooled connection string (Neon or Supabase pooler).

## 4. In front of the app

- Serve over HTTPS only (the app sends HSTS).
- Put the API behind a reverse proxy or load balancer that sets `X-Forwarded-For`. Rate limits use it, so do not expose the Node server directly.
- Set `REDIS_URL` when you run two or more instances.
- Set `APP_URL` to the public web app URL. Put any extra front-end origins in `CORS_ORIGINS`.

## 5. Provider callbacks

Register these URLs (details in `docs/INTEGRATIONS.md`):

- `{APP_URL}/api/auth/oauth/google/callback`
- `{APP_URL}/api/auth/oauth/apple/callback`
- `{APP_URL}/api/integrations/{FITBIT|OURA|WHOOP}/callback`
- `{APP_URL}/api/webhooks/{razorpay|stripe|fitbit|whoop}`

## 6. Monitoring

- Uptime check on `GET /api/health`: 200 means healthy, 503 means the database is down.
- `GET /api/admin/system` shows database latency and pool, Redis, memory, failed webhooks and pending notifications.
- Ship stdout logs to your log platform. Unexpected errors are logged with an `[api]` prefix.
- Review `GET /api/admin/audit-logs` regularly.

## 7. Release checklist

- [ ] `npm run typecheck` and the end-to-end suite pass in CI (`.github/workflows/ci.yml`)
- [ ] Migrations have run against production
- [ ] `APP_ENV=production`, `SANDBOX_MODE=false`, strong secrets set, `ENCRYPTION_KEY` backed up
- [ ] Payment provider in live mode with its webhook secret set
- [ ] Twilio sender and templates DLT-registered for Indian SMS
- [ ] Privacy policy and terms published; consent version string updated if their text changed
- [ ] Database backups verified by a test restore
