# Vitalora API reference

Base URL: `https://<your-domain>/api`. JSON in, JSON out. {{COUNT}} operations, generated from the route files by `python3 scripts/gen-api-docs.py`.

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
