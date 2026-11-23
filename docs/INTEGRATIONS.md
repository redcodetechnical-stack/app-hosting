# Integration setup guide

Each provider switches on when its environment variables are set and the server restarts. Until then its endpoints answer `503 not_configured`. `GET /api/admin/integrations` shows what is configured right now.

| Service | Env vars | Used by | Setup |
|---|---|---|---|
| Anthropic Claude (default AI) | `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | `/api/ai/*` | Create a key in the Claude Console. Vision (meal photo) uses the same key. |
| OpenAI (alternative) | `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` | `/api/ai/*` | Choose a vision-capable model for meal photos. |
| Google sign-in | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/auth/oauth/google` | Google Cloud → OAuth client (Web). Redirect URI: `{APP_URL}/api/auth/oauth/google/callback`. |
| Apple sign-in | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | `/api/auth/oauth/apple` | Apple Developer → Sign in with Apple key (.p8). Return URL: `{APP_URL}/api/auth/oauth/apple/callback`. |
| Twilio SMS (OTP) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | `/api/auth/otp/*`, SMS reminders | Indian numbers need DLT registration of the sender and template. |
| Resend email | `RESEND_API_KEY`, `EMAIL_FROM` | OTP by email, password reset, receipts, ticket replies | Verify your sending domain (SPF/DKIM). |
| Firebase Cloud Messaging | `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY` | Push reminders | Firebase → service account JSON. Apps register tokens with `POST /api/devices`. |
| Razorpay (default payments) | `PAYMENT_PROVIDER=razorpay`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | `/api/billing/*` | Webhook URL `{APP_URL}/api/webhooks/razorpay`, events `payment.captured` and `payment.failed`. The app opens Checkout.js with the order from `/billing/checkout`, then calls `/billing/verify`. |
| Stripe | `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `/api/billing/*` | Webhook `{APP_URL}/api/webhooks/stripe`, events `checkout.session.completed` and `charge.refunded`. |
| Fitbit | `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_SUBSCRIBER_VERIFY` | `/api/integrations/FITBIT/*` | dev.fitbit.com app (Server type). Callback `{APP_URL}/api/integrations/FITBIT/callback`; subscriber endpoint `{APP_URL}/api/webhooks/fitbit`. |
| Oura | `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET` | `/api/integrations/OURA/*` | cloud.ouraring.com → OAuth app. Callback `{APP_URL}/api/integrations/OURA/callback`. |
| WHOOP | `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` | `/api/integrations/WHOOP/*` | developer.whoop.com. Callback `{APP_URL}/api/integrations/WHOOP/callback`; webhook `{APP_URL}/api/webhooks/whoop`. |
| Garmin | `GARMIN_CONSUMER_KEY`, `GARMIN_CONSUMER_SECRET` | listed, push-based | Requires approval in the Garmin Connect Developer Program first. |
| Apple Health / Health Connect | `HEALTH_INGEST_SIGNING_KEY` | `/api/integrations/{APPLE_HEALTH,HEALTH_CONNECT}/ingest` | Read on the phone by the native app (with OS permission), then posted in batches. A web app cannot read these stores. |
| Open Food Facts | `OPENFOODFACTS_ENABLED` | Food search, barcode | Free; no key needed. |
| Nutritionix / Edamam | `NUTRITIONIX_APP_ID`/`_API_KEY`, `EDAMAM_APP_ID`/`_APP_KEY` | Barcode lookup first, then Open Food Facts | |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Avatars, appointment documents, community images | The app uploads straight to Cloudinary using `/api/uploads/sign`. |
| Daily.co video | `DAILY_API_KEY` | Video consultations | A private room is created when a professional confirms an appointment. |
| Google Maps | `GOOGLE_MAPS_API_KEY` | Clinic maps in the front-end | Restrict the key to your domain. |
| Redis | `REDIS_URL` | Rate limits | Needed when you run more than one API instance. |

## Consent flow for health data

1. The app shows which data types the provider shares (from `GET /api/integrations`).
2. `POST /api/integrations/:provider/connect` with `{ "consent": true }` records the consent and returns `authorizeUrl`.
3. The user signs in at the provider. The callback stores encrypted tokens and runs a first sync.
4. `POST /api/integrations/:provider/sync` pulls data on demand; provider webhooks trigger syncs automatically.
5. `DELETE /api/integrations/:provider` removes the tokens and records consent withdrawal. Add `?purge=true` to also delete device data.

## Scheduled reminders

Call `POST /api/cron/reminders` every 15 minutes with `Authorization: Bearer $CRON_SECRET`, for example from Vercel Cron, a GitHub Actions schedule or a Kubernetes CronJob. Reminders follow each user's own time zone and preferences, and dedupe keys stop the same reminder being sent twice.
