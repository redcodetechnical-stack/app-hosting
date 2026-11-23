# Vitalora API reference

Base URL: `https://<your-domain>/api`. JSON in, JSON out. 237 operations, generated from the route files by `python3 scripts/gen-api-docs.py`.

## Authentication

- **Bearer**: send `Authorization: Bearer <accessToken>` (mobile apps, server-to-server).
- **Cookies**: login/register also set `vt_access` (15 min) and `vt_refresh` (30 days, path `/api/auth`) as httpOnly cookies for the web app. Cookie-authenticated `POST/PUT/PATCH/DELETE` must come from `APP_URL` or a `CORS_ORIGINS` origin (CSRF protection), or send `X-Requested-With: vitalora`.
- Refresh with `POST /auth/refresh` (body `refreshToken` or the cookie). Refresh tokens rotate; a reused token is rejected.
- Access levels below: **public** (no auth), **user** (any signed-in account; every query is scoped to that user's own rows), **perm: x** (role permission required, see Roles).

## Roles

| Role | Permissions |
|---|---|
| SUPER_ADMIN | all |
| ADMIN | all except roles.manage, professional.portal |
| CONTENT_MANAGER | content.manage, notifications.broadcast, analytics.read |
| SUPPORT_AGENT | users.read, support.manage, moderation.manage, appointments.manage, payments.read |
| PROFESSIONAL | professional.portal (granted automatically when an admin verifies the profile) |
| USER | none |

Role permissions are editable at `PATCH /admin/roles/:id` (super admin only).

## Errors

```json
{ "error": { "code": "validation_error", "message": "Some fields are invalid", "details": [{ "path": "amountMl", "message": "..." }] } }
```

| Status | code | Meaning |
|---|---|---|
| 400 | bad_request, otp_invalid, ... | Request is understood but not allowed in this state |
| 401 | unauthorized, invalid_credentials | Missing/expired token or wrong password |
| 402 | upgrade_required | Feature needs Premium/Family |
| 403 | forbidden, csrf, account_suspended | Permission or origin check failed |
| 404 | not_found | Missing, or belongs to another user (never revealed) |
| 409 | conflict, slot_taken, bad_transition | Duplicate or state conflict |
| 422 | validation_error | Body failed validation |
| 429 | rate_limited, ai_quota | Slow down; `Retry-After` header is set |
| 503 | not_configured | A provider (AI, SMS, payments, wearable...) has no keys on this server |

## Conventions

- Dates are local calendar days `YYYY-MM-DD` in the user's profile time zone; timestamps are ISO 8601 UTC.
- Lists: `?page=1&limit=20` (max varies by endpoint); log lists also accept `?from=YYYY-MM-DD&to=YYYY-MM-DD`.
- Every health value carries its `source`: `MANUAL`, `DEVICE`, `ESTIMATED`, `IMPORTED` or `AI_ESTIMATED`.
- Money is in paise (`29900` = ₹299).

## Streaming AI chat

`POST /ai/chat` returns `text/event-stream`:

```
event: start   data: {"conversationId":"..."}
event: delta   data: {"text":"partial text"}
event: done    data: {"conversationId":"...","disclaimer":"..."}
event: error   data: {"message":"..."}
```

Add `?stream=0` for a single JSON response. Crisis language (English, Hindi, Hinglish) gets an immediate helpline reply (Tele-MANAS 14416, emergency 112) without calling the model.

## Example

```bash
curl -X POST https://api.example.com/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"asha@example.com","password":"..."}'
curl https://api.example.com/api/dashboard -H "authorization: Bearer $TOKEN"
curl -X POST https://api.example.com/api/water -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"amountMl":250}'
```

## Authentication

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| POST | `/api/auth/login` | public | 10/300s | email, phone, password |  |
| POST | `/api/auth/logout` | public |  | body, refreshToken |  |
| GET | `/api/auth/me` | user |  |  |  |
| GET | `/api/auth/oauth/:provider` | public | 30/300s |  | Starts Google or Apple sign-in. State + PKCE verifier are kept in short-lived httpOnly cookies. |
| GET | `/api/auth/oauth/:provider/callback` | signed / special |  |  |  |
| POST | `/api/auth/oauth/:provider/callback` | signed / special |  |  |  |
| POST | `/api/auth/otp/request` | public | 5/600s | target, purpose |  |
| POST | `/api/auth/otp/verify` | public | 10/600s | target, code, purpose |  |
| POST | `/api/auth/password/change` | user | 10/900s | currentPassword, newPassword |  |
| POST | `/api/auth/password/forgot` | public | 5/900s | body, email |  |
| POST | `/api/auth/password/reset` | public | 10/900s | email, code, newPassword |  |
| POST | `/api/auth/refresh` | public | 30/60s | body, refreshToken |  |
| POST | `/api/auth/register` | public | 10/3600s | email, password, name, consent, terms, privacy, healthData, marketing |  |
| GET | `/api/auth/sessions` | user |  |  |  |
| DELETE | `/api/auth/sessions/:id` | user |  |  |  |

## Account, profile & privacy

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| DELETE | `/api/me` | user | 5/3600s | body, password, otp, confirm | Account deletion (right to erasure). Requires the password, or an OTP (purpose DELETE_ACCOUNT) for password-less accounts. All personal data cascades away; the user row is kept as an anonymised tombstone so audit and pay |
| POST | `/api/me/avatar` | user | 20/3600s |  | Returns signed parameters; the app uploads the image straight to Cloudinary, then PATCHes /api/me/profile { avatarUrl }. |
| GET | `/api/me/consents` | user |  |  |  |
| POST | `/api/me/consents` | user |  | body, purpose, granted, version |  |
| GET | `/api/me/export` | user | 5/3600s |  | DPDP / GDPR data portability: everything we hold about the user, decrypted, as one JSON file. |
| GET | `/api/me/family` | user |  |  |  |
| POST | `/api/me/family` | user |  | body, displayName, inviteEmail |  |
| DELETE | `/api/me/family/:id` | user |  |  |  |
| POST | `/api/me/family/accept` | user |  | body, inviteId | An invited person (signed in with the invited email) accepts, which links their account to the family. |
| POST | `/api/me/onboarding` | user |  | name, birthYear, sex, heightCm, weightKg, activityLevel, goals, dietPreference, acceptWellnessDisclaimer, targets, calorieGoal, waterGoalMl, stepGoal, sleepGoalH | Completes onboarding: saves the questionnaire, computes suggested targets, lets the user override them. |
| GET | `/api/me/profile` | user |  |  |  |
| PATCH | `/api/me/profile` | user |  | name, birthYear, sex, heightCm, weightKg, activityLevel, goals, dietPreference, language, timezone |  |
| GET | `/api/me/targets/suggest` | user |  |  |  |

## Devices

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/devices` | user |  |  |  |
| POST | `/api/devices` | user |  | body, platform, pushToken, name |  |
| DELETE | `/api/devices/:id` | user |  |  |  |

## Notifications

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/notifications` | user |  |  |  |
| PATCH | `/api/notifications/:id` | user |  | body, read |  |
| DELETE | `/api/notifications/:id` | user |  |  |  |
| POST | `/api/notifications/read-all` | user |  |  |  |

## Hydration

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/water` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/water` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/water/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/water/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/water/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |

## Steps & activity

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/activity` | user |  |  |  |
| POST | `/api/activity` | user | 120/60s | body, steps, distanceKm, mode | Manual steps. mode=add increments the day's manual total; mode=set replaces it. Device rows are kept separately. |

## Workouts

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/exercises` | public |  |  |  |
| GET | `/api/workout-plans` | user |  |  |  |
| PUT | `/api/workout-plans` | user |  | body, weekday, type, minutes |  |
| DELETE | `/api/workout-plans` | user |  |  |  |
| GET | `/api/workouts` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/workouts` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/workouts/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/workouts/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/workouts/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |

## Nutrition

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/foods` | user | 60/60s |  | Search: Vitalora's curated list + the user's own custom foods, then Open Food Facts for packaged foods (source labelled). |
| POST | `/api/foods` | user |  | body, name, serving, calories, protein, carbs, fat, fiber, barcode |  |
| DELETE | `/api/foods/:id` | user |  |  |  |
| GET | `/api/foods/barcode/:code` | user | 30/60s |  | Barcode scanner backend: local cache first, then Nutritionix / Open Food Facts; found items are cached. |
| GET | `/api/grocery` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/grocery` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/grocery/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/grocery/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/grocery/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| GET | `/api/nutrition` | user |  |  | One day's food log grouped by meal, with totals vs targets. |
| POST | `/api/nutrition` | user | 120/60s | meal, quantity, foodId, manual, name, serving, calories, protein, carbs, fat |  |
| PATCH | `/api/nutrition/:id` | user |  | body, quantity, meal |  |
| DELETE | `/api/nutrition/:id` | user |  |  |  |

## Sleep

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/sleep` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/sleep` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/sleep/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/sleep/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/sleep/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |

## Mental wellness

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/assessments` | user |  |  |  |
| POST | `/api/assessments` | user |  | body, instrument, answers | WHO-5 Well-Being Index: 5 answers 0-5, score = raw x 4 (0-100). Screening aid, not a diagnosis. |
| GET | `/api/journal` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/journal` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/journal/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/journal/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/journal/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| GET | `/api/moods` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/moods` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/moods/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/moods/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/moods/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |

## Meditation

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/meditation/sessions` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/meditation/sessions` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/meditation/sessions/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/meditation/sessions/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/meditation/sessions/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |

## Content library

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/content` | user |  |  | Published library: ?type=MEDITATION|WORKOUT_PROGRAM|ARTICLE|RESOURCE|BANNER|SLEEP_SOUND|RECIPE. Premium bodies are locked on Free. |
| GET | `/api/content/:slug` | user |  |  |  |

## Health metrics

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/metrics` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/metrics` | user |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/metrics/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/metrics/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/metrics/:id` | user |  |  | Generic item (read, update, delete) scoped to owner |

## Habits

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/habits` | user |  |  |  |
| POST | `/api/habits` | user |  | body, name, category |  |
| PATCH | `/api/habits/:id` | user |  | body, name, category, archived |  |
| DELETE | `/api/habits/:id` | user |  |  |  |
| POST | `/api/habits/:id/toggle` | user |  | body, done | Marks the habit done for a day (default today), or undoes it if already done. |
| GET | `/api/habits/stats` | user |  |  | Weekly and monthly completion reports. |

## Dashboard & analytics

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/analytics` | user |  |  | Time series for charts: ?metric=steps&days=7|30|90 (weekly + monthly analytics). |
| GET | `/api/dashboard` | user |  |  | Everything the home dashboard needs, computed from the user's own logs. No stored or hard-coded values. |
| GET | `/api/insights` | user |  |  |  |

## AI coach & AI health tools

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| POST | `/api/ai/chat` | user | 20/60s | conversationId, message, language | Conversational coach. Streams Server-Sent Events by default (event: delta / done); ?stream=0 returns JSON. |
| GET | `/api/ai/conversations` | user |  |  |  |
| GET | `/api/ai/conversations/:id` | user |  |  |  |
| DELETE | `/api/ai/conversations/:id` | user |  |  |  |
| POST | `/api/ai/doctor-summary` | user | 5/3600s | body, days, concerns | Prepares a factual one-page summary of tracked data + the user's own questions, to take to an appointment. |
| POST | `/api/ai/journal-reflection` | user | 15/3600s | body, entryId |  |
| POST | `/api/ai/lab-explainer` | user | 5/3600s | body, reportText | Explains the terms on a lab report in plain language. It does not diagnose; any value flagged outside the lab's own range is a question for the doctor. |
| POST | `/api/ai/meal-photo` | user | 15/3600s |  | Photo → estimated foods & macros (multipart: image, meal, log=true to save). Saved rows are tagged AI_ESTIMATED. |
| POST | `/api/ai/meal-plan` | user | 10/3600s | days, diet, cuisine, calorieTarget, avoid, budget, addGroceries |  |
| GET | `/api/ai/reports` | user |  |  |  |
| DELETE | `/api/ai/reports/:id` | user |  |  |  |
| POST | `/api/ai/sleep-coach` | user | 10/3600s | body, question |  |
| POST | `/api/ai/stress-coach` | user | 15/3600s | body, situation, minutesAvailable |  |
| GET | `/api/ai/usage` | user |  |  |  |
| POST | `/api/ai/weekly-report` | user | 10/3600s |  | AI weekly health report: highlights, patterns, and 3 focus actions for next week, grounded in computed stats. |
| POST | `/api/ai/workout-plan` | user | 10/3600s | daysPerWeek, minutesPerSession, level, equipment, focus, limitations, apply |  |

## Wearables & integrations

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/integrations` | user |  |  |  |
| DELETE | `/api/integrations/:provider` | user |  |  | Disconnect: deletes stored tokens and records consent withdrawal. ?purge=true also deletes data imported from this device. |
| GET | `/api/integrations/:provider/callback` | signed / special |  |  | OAuth redirect target. Validates state, exchanges the code (PKCE), stores encrypted tokens, runs a first sync. |
| POST | `/api/integrations/:provider/connect` | user | 10/600s | body, consent, sandbox | Step 1 of connecting a wearable. The user must explicitly consent to the listed data types. Returns the provider's authorize URL (redirect the user there), or connects a clearly-flagged sandbox in development. |
| POST | `/api/integrations/:provider/ingest` | user | 30/600s | steps, distanceKm | Apple HealthKit / Health Connect: the native app reads data on-device (with OS permission) and posts batches here. |
| POST | `/api/integrations/:provider/sync` | user | 6/600s |  |  |

## Webhooks

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/webhooks/:provider` | signed / special |  |  | Signed webhooks. Every event is stored once (idempotent by provider + event id) before processing. |
| POST | `/api/webhooks/:provider` | signed / special |  |  |  |

## Subscriptions & payments

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| POST | `/api/billing/cancel` | user |  |  | Cancels at period end (paid) or immediately (trial). Downgrade to Free happens automatically when the period ends. |
| POST | `/api/billing/checkout` | user | 10/600s | body, plan, coupon | Creates a one-month order. Razorpay: returns order details for Checkout.js; Stripe: returns a hosted checkout URL. |
| POST | `/api/billing/coupon` | user | 20/600s | body, plan, code |  |
| GET | `/api/billing/invoices/:id` | user |  |  | Printable HTML invoice for a paid payment. |
| GET | `/api/billing/payments` | user |  |  |  |
| GET | `/api/billing/plans` | public |  |  |  |
| POST | `/api/billing/refunds` | user | 5/3600s | body, paymentId, reason | User refund request; an admin approves or rejects it in /api/admin/refunds. |
| GET | `/api/billing/subscription` | user |  |  |  |
| POST | `/api/billing/trial` | user | 5/3600s | body, plan | One free trial per account, no payment method needed. |
| POST | `/api/billing/verify` | user | 20/600s | body, razorpay_order_id, razorpay_payment_id, razorpay_signature | Razorpay Checkout success handler: verifies the HMAC signature before activating. (Webhook also activates; both are idempotent.) |

## Professionals & appointments

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/appointments` | user |  |  |  |
| POST | `/api/appointments` | user | 20/3600s | body, slotId, externalName, notes | Book a directory slot ({slotId}) or record an outside appointment ({externalName, startsAt}) for reminders. |
| GET | `/api/appointments/:id` | user |  |  |  |
| PATCH | `/api/appointments/:id` | user |  | body, cancel, notes, documentUrls | Patient can cancel (frees the slot), update notes, or attach document URLs (from /api/uploads/sign). |
| POST | `/api/appointments/:id/review` | user |  | body, rating, comment |  |
| GET | `/api/professionals` | public |  |  | Public directory of VERIFIED professionals only. ?q=&specialization=&city=&language=&sort=rating|fee |
| GET | `/api/professionals/:id` | public |  |  |  |
| POST | `/api/professionals/apply` | user | 3/3600s | body, displayName, title, specializations, bio, languages, city, registrationNo, yearsExp, feeInr | Any user can apply to list as a professional; an admin with professionals.verify reviews the registration number. |

## Professional portal

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/pro/appointments` | perm: professional.portal |  |  |  |
| PATCH | `/api/pro/appointments/:id` | perm: professional.portal |  | body, status, videoRoomUrl |  |
| GET | `/api/pro/profile` | user |  |  |  |
| PATCH | `/api/pro/profile` | user |  | body, displayName, bio, languages, city, feeInr, specializations |  |
| GET | `/api/pro/slots` | perm: professional.portal |  |  |  |
| POST | `/api/pro/slots` | perm: professional.portal |  | body, slots, series, count, minutes, gapMinutes | Adds slots: either explicit {slots:[{startsAt,endsAt}]} or a series {from, count, minutes, gapMinutes}. |
| DELETE | `/api/pro/slots/:id` | perm: professional.portal |  |  |  |

## Uploads

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| POST | `/api/uploads/sign` | user | 30/3600s | body, purpose | Signed direct upload (prescriptions, reports, community images). Files go straight to Cloudinary, never through this server. |

## Gamification

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/achievements` | user |  |  |  |
| GET | `/api/challenges` | user |  |  |  |
| GET | `/api/challenges/:id` | user |  |  |  |
| POST | `/api/challenges/:id` | user |  |  |  |
| DELETE | `/api/challenges/:id` | user |  |  |  |
| GET | `/api/leaderboard` | user |  |  | Opt-in weekly points leaderboard (profiles.privacy.leaderboard = true). Shows first names only. |

## Community

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/community/blocks` | user |  |  |  |
| POST | `/api/community/blocks` | user |  | body, userId |  |
| DELETE | `/api/community/blocks` | user |  |  |  |
| DELETE | `/api/community/comments/:id` | user |  |  |  |
| GET | `/api/community/groups` | user |  |  |  |
| POST | `/api/community/groups` | user | 5/3600s | body, name, description |  |
| POST | `/api/community/groups/:id/members` | user |  |  |  |
| DELETE | `/api/community/groups/:id/members` | user |  |  |  |
| GET | `/api/community/posts` | user |  |  |  |
| POST | `/api/community/posts` | user | 10/600s | body, groupId |  |
| PATCH | `/api/community/posts/:id` | user |  | body |  |
| DELETE | `/api/community/posts/:id` | user |  |  |  |
| GET | `/api/community/posts/:id/comments` | user |  |  |  |
| POST | `/api/community/posts/:id/comments` | user | 20/600s | body |  |
| POST | `/api/community/posts/:id/like` | user | 60/60s |  |  |
| DELETE | `/api/community/posts/:id/like` | user |  |  |  |
| POST | `/api/community/reports` | user | 10/3600s | body, targetType, targetId, reason |  |

## Support

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/support/tickets` | user |  |  |  |
| POST | `/api/support/tickets` | user | 5/3600s | body, subject, message |  |
| GET | `/api/support/tickets/:id` | user |  |  |  |
| POST | `/api/support/tickets/:id` | user | 20/3600s | body, message |  |

## Public

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| POST | `/api/contact` | public | 3/3600s | body, name, email, message, website |  |
| GET | `/api/health` | public |  |  |  |

## Scheduled jobs

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| POST | `/api/cron/reminders` | signed / special |  |  | Run every 15 minutes from a scheduler (Vercel Cron, GitHub Actions, k8s CronJob) with header Authorization: Bearer CRON_SECRET. Creates water, bedtime, workout, meditation, habit and appointment reminders in each user's  |
| GET | `/api/cron/reminders` | user |  |  | Run every 15 minutes from a scheduler (Vercel Cron, GitHub Actions, k8s CronJob) with header Authorization: Bearer CRON_SECRET. Creates water, bedtime, workout, meditation, habit and appointment reminders in each user's  |

## Admin & super admin

| Method | Path | Access | Rate limit | Body fields | Notes |
|---|---|---|---|---|---|
| GET | `/api/admin/appointments` | perm: appointments.manage |  |  |  |
| GET | `/api/admin/audit-logs` | perm: audit.read |  |  |  |
| GET | `/api/admin/challenges` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/admin/challenges` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/admin/challenges/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/admin/challenges/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/admin/challenges/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| GET | `/api/admin/contact` | perm: support.manage |  |  |  |
| GET | `/api/admin/content` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/admin/content` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/admin/content/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/admin/content/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/admin/content/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| GET | `/api/admin/coupons` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/admin/coupons` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/admin/coupons/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/admin/coupons/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/admin/coupons/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| GET | `/api/admin/exercises` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/admin/exercises` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/admin/exercises/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/admin/exercises/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/admin/exercises/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| GET | `/api/admin/foods` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| POST | `/api/admin/foods` | perm: content.manage / coupons.manage |  |  | Generic collection (list with ?from=&to=&page=&limit=, create) |
| GET | `/api/admin/foods/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| PATCH | `/api/admin/foods/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| DELETE | `/api/admin/foods/:id` | perm: content.manage / coupons.manage |  |  | Generic item (read, update, delete) scoped to owner |
| GET | `/api/admin/integrations` | perm: integrations.read |  |  | Configuration and health of every external service, plus connection/webhook stats. |
| POST | `/api/admin/notifications` | perm: notifications.broadcast | 5/3600s | body, title, plan | In-app broadcast to all active users, or one plan's users. |
| GET | `/api/admin/overview` | perm: analytics.read |  |  | Platform KPIs, all computed live from the database. |
| GET | `/api/admin/payments` | perm: payments.read |  |  |  |
| GET | `/api/admin/professionals` | perm: professionals.verify |  |  |  |
| PATCH | `/api/admin/professionals/:id` | perm: professionals.verify |  | body, status, note | Verify / reject / suspend. Verifying promotes a plain USER to the PROFESSIONAL role (portal access). |
| GET | `/api/admin/refunds` | perm: [payments.refund, payments.read] |  |  |  |
| PATCH | `/api/admin/refunds/:id` | perm: payments.refund |  | body, decision, amountPaise | Approve (executes the refund with the provider, cancels the subscription) or reject. |
| GET | `/api/admin/reports` | perm: moderation.manage |  |  |  |
| PATCH | `/api/admin/reports/:id` | perm: moderation.manage |  | body, action | action: hide (post/comment), suspend_user, dismiss. |
| GET | `/api/admin/roles` | perm: roles.manage |  |  |  |
| POST | `/api/admin/roles` | perm: roles.manage |  | body, key, name, description |  |
| PATCH | `/api/admin/roles/:id` | perm: roles.manage |  | body, permissions, name | Replace a role's permission set. SUPER_ADMIN always keeps every permission. |
| GET | `/api/admin/settings` | perm: system.manage |  |  |  |
| PUT | `/api/admin/settings` | perm: system.manage |  | body, key, value |  |
| GET | `/api/admin/subscriptions` | perm: subscriptions.manage |  |  |  |
| POST | `/api/admin/subscriptions` | perm: subscriptions.manage |  | body, userId, plan, days | Grant a complimentary plan (e.g. partners, support goodwill). Ends any current one. |
| PATCH | `/api/admin/subscriptions/:id` | perm: subscriptions.manage |  | body, status, plan |  |
| GET | `/api/admin/system` | perm: system.manage |  |  |  |
| GET | `/api/admin/tickets` | perm: support.manage |  |  |  |
| GET | `/api/admin/tickets/:id` | perm: support.manage |  |  |  |
| PATCH | `/api/admin/tickets/:id` | perm: support.manage |  | body, status, priority, assigneeId |  |
| POST | `/api/admin/tickets/:id` | perm: support.manage |  | body, message, internal | Reply (internal=true for staff-only notes). Public replies notify the user. |
| GET | `/api/admin/users` | perm: users.read |  |  | ?q=email/phone/name &status= &role= &plan=FREE|PREMIUM|FAMILY |
| GET | `/api/admin/users/:id` | perm: users.read |  |  | Account overview for support. Deliberately excludes health logs, journal and AI chats (privacy by design); only activity counts. |
| PATCH | `/api/admin/users/:id` | perm: users.manage |  | body, status, reason, role, revokeSessions |  |
