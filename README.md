# Vitalora API

Back-end for **Vitalora Healthcare**, an all-in-one wellness platform. It covers the user app, the professional portal, and the admin and super-admin dashboards.

- **Stack:** Next.js 15 route handlers · TypeScript · PostgreSQL 16 · Drizzle ORM · Zod · JWT (jose) · optional Redis
- **Size:** 158 route files, 236 API operations, 57 tables
- **Tested:** 194 of 194 end-to-end checks pass against a real PostgreSQL database (`docs/TEST_REPORT.md`)

## What's included

- **API**: `/api/*`, the full back-end described below.
- **Web app (PWA)**: `/app/` is the complete Vitalora app connected to this API, with real accounts, server-side sync and AI through `/api/ai/*`. It installs to the phone home screen and its app shell works offline. Source: `web/index.html`, which `npm run build` turns into `public/app/` (`scripts/build-web.mjs`).
- **Legal pages**: `/privacy` and `/terms`, filled from the `COMPANY_*` and `SUPPORT_EMAIL` variables.
- **Android**: see the separate `vitalora-android` project, which wraps `/app/`.

## Quick start

```bash
cp .env.example .env              # fill JWT_SECRET, ENCRYPTION_KEY, OTP_SECRET, CRON_SECRET, DATABASE_URL
npm install
npm run db:migrate                # applies drizzle/*.sql
npm run db:seed                   # roles, permissions, foods, exercises, content, challenges (+ first super admin)
npm run dev                       # http://localhost:3000/api/health
```

Or start everything at once with `docker compose up --build` (Postgres + Redis + migrate/seed + API).

Run the tests:

```bash
# .env with APP_ENV=test, SANDBOX_MODE=true, OPENFOODFACTS_ENABLED=false
npm run build && npx next start -p 3000 &
npm run test:e2e                  # writes docs/TEST_REPORT.md
```

## Project structure

```
src/
  app/api/            route handlers, one folder per resource (see docs/API.md)
    auth/             register, login, refresh, logout, OTP, password reset, Google/Apple OAuth, sessions
    me/               profile, onboarding, consents, export, account deletion, family, avatar
    water/ activity/ workouts/ workout-plans/ exercises/ foods/ nutrition/ grocery/
    sleep/ moods/ journal/ assessments/ metrics/ habits/ meditation/ content/
    dashboard/ analytics/ insights/
    ai/               coach chat (SSE), meal photo, meal plan, workout plan, weekly report,
                      sleep coach, stress coach, journal reflection, doctor summary, lab explainer
    integrations/     Fitbit, Oura, WHOOP (OAuth + PKCE), Garmin, Apple Health / Health Connect ingest
    webhooks/         Razorpay, Stripe, Fitbit, WHOOP (signature-verified, idempotent)
    billing/          plans, trial, checkout, verify, cancel, payments, invoices, coupons, refunds
    professionals/ appointments/ pro/      directory, booking, reviews, professional portal
    challenges/ achievements/ leaderboard/ community/ support/ contact/ notifications/ devices/
    cron/reminders    scheduled reminders (water, bedtime, workout, meditation, habits, appointments)
    admin/            overview, users, roles, professionals, appointments, content, challenges,
                      exercises, foods, coupons, payments, refunds, subscriptions, tickets,
                      reports (moderation), audit logs, integrations, system, settings, broadcast
  db/                 schema.ts (all tables), migrate.ts, seed.ts
  lib/                http (route wrapper), auth, crypto, rbac via roles, ratelimit, audit,
                      wellness (score, targets, MET), ai + aitools, payments, billing,
                      integrations, messaging (email/SMS/push), external (food DBs, uploads, video)
  middleware.ts       CORS + security headers
drizzle/              SQL migrations
tests/e2e.ts          end-to-end suite
docs/                 API.md, DATABASE.md, INTEGRATIONS.md, DEPLOYMENT.md, TEST_REPORT.md
public/               logo and favicons
```

## How it behaves

- **Real data only.** The dashboard, score, analytics, insights, challenges and admin KPIs are all computed from database rows. There are no stored or hard-coded numbers. The seed adds reference data only (foods, exercises, content), never fake users or logs.
- **Data isolation.** Every user query filters by `user_id`. Another person's record returns 404, so the API never reveals that it exists.
- **Encryption at rest.** Journal text, notes, AI chats and reports, appointment notes and OAuth tokens are stored with AES-256-GCM.
- **Health data provenance.** Every value is tagged MANUAL, DEVICE, ESTIMATED, IMPORTED or AI_ESTIMATED. Sleep stages are stored only from devices.
- **No fake integrations.** A provider without keys answers `503 not_configured`. `SANDBOX_MODE=true` gives clearly flagged sandbox data, and it is switched off whenever `APP_ENV=production`.
- **AI safety.**
  - A shared rule block forbids diagnoses and medicine advice.
  - Crisis language (English, Hindi and Hinglish) gets an immediate Tele-MANAS 14416 / 112 reply without calling the model.
  - Every AI tool returns a disclaimer, and usage is limited per plan.
- **Security.**
  - bcrypt password hashes; 15-minute access JWTs with rotating refresh tokens.
  - httpOnly cookies, plus a CSRF origin check for cookie authentication.
  - Rate limits on every sensitive route (Redis-backed when `REDIS_URL` is set); Zod validation on every body.
  - Parameterised SQL only; security headers on every response.
  - An audit log covers authentication, privacy, billing and every admin action.
- **Privacy (DPDP / GDPR).** Consent is recorded per purpose. Users can export all their data and delete their account; deletion erases all personal rows and anonymises the user record.

Next steps: `docs/DEPLOYMENT.md` to go live, `docs/INTEGRATIONS.md` to switch on each provider.
