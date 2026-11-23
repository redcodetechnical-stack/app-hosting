# Vitalora API — end-to-end test report

Run: 2026-11-23T11:36:05.635Z against http://localhost:3000 with PostgreSQL 16, SANDBOX_MODE=true (no third-party keys).

**194 of 194 checks passed.**

| Area | Passed |
|---|---|
| health | 1 / 1 |
| auth | 13 / 13 |
| auth: otp, password reset, rate limits, csrf | 11 / 11 |
| profile & onboarding | 5 / 5 |
| tracking | 27 / 27 |
| habits & plan limits | 5 / 5 |
| dashboard & analytics | 8 / 8 |
| AI coach & AI health tools (sandbox provider) | 23 / 23 |
| notifications, devices, cron reminders | 6 / 6 |
| integrations | 10 / 10 |
| billing | 5 / 5 |
| RBAC & admin | 28 / 28 |
| professionals & appointments | 20 / 20 |
| gamification | 5 / 5 |
| community & moderation | 10 / 10 |
| support & contact | 7 / 7 |
| data isolation | 3 / 3 |
| privacy: export & deletion | 6 / 6 |
| logout | 1 / 1 |

## All checks

- PASS — [health] health ok + db up
- PASS — [auth] weak password rejected (422)
- PASS — [auth] registration requires health-data consent
- PASS — [auth] register 201 + tokens
- PASS — [auth] session cookies set (httpOnly)
- PASS — [auth] duplicate email 409
- PASS — [auth] wrong password 401
- PASS — [auth] login 200
- PASS — [auth] me returns USER role + FREE plan
- PASS — [auth] no token 401
- PASS — [auth] garbage token 401
- PASS — [auth] refresh rotates tokens
- PASS — [auth] old refresh token rejected after rotation
- PASS — [auth] sessions listed
- PASS — [auth: otp, password reset, rate limits, csrf] OTP request (dev returns devCode when SMS unconfigured)
- PASS — [auth: otp, password reset, rate limits, csrf] wrong OTP rejected
- PASS — [auth: otp, password reset, rate limits, csrf] phone OTP login creates account
- PASS — [auth: otp, password reset, rate limits, csrf] OTP single use
- PASS — [auth: otp, password reset, rate limits, csrf] forgot password generic response
- PASS — [auth: otp, password reset, rate limits, csrf] forgot password does not reveal unknown emails
- PASS — [auth: otp, password reset, rate limits, csrf] password reset with code
- PASS — [auth: otp, password reset, rate limits, csrf] login with new password
- PASS — [auth: otp, password reset, rate limits, csrf] CSRF: cookie auth from foreign origin blocked
- PASS — [auth: otp, password reset, rate limits, csrf] cookie auth from app origin allowed
- PASS — [auth: otp, password reset, rate limits, csrf] login rate limit kicks in (429)
- PASS — [profile & onboarding] onboarding computes targets
- PASS — [profile & onboarding] profile patch
- PASS — [profile & onboarding] invalid timezone rejected
- PASS — [profile & onboarding] targets suggest
- PASS — [profile & onboarding] consents recorded at signup
- PASS — [tracking] water log
- PASS — [tracking] water bad amount 422
- PASS — [tracking] water list for today
- PASS — [tracking] water delete
- PASS — [tracking] steps add accumulates
- PASS — [tracking] workout calories estimated from MET x weight
- PASS — [tracking] workout patch recomputes calories
- PASS — [tracking] workout plan upsert
- PASS — [tracking] exercise library search
- PASS — [tracking] food search finds seeded foods
- PASS — [tracking] nutrition log scales by quantity
- PASS — [tracking] custom food
- PASS — [tracking] nutrition day totals
- PASS — [tracking] nutrition quantity edit rescales
- PASS — [tracking] grocery add + toggle
- PASS — [tracking] sleep log across midnight = 7.5h
- PASS — [tracking] sleep same night twice → 409
- PASS — [tracking] sleep >16h rejected
- PASS — [tracking] mood log
- PASS — [tracking] journal entry
- PASS — [tracking] journal encrypted at rest (AES-GCM)
- PASS — [tracking] BP needs diastolic
- PASS — [tracking] metric out of range rejected
- PASS — [tracking] BP saved with unit + MANUAL source
- PASS — [tracking] weight reading updates profile
- PASS — [tracking] meditation session
- PASS — [tracking] WHO-5 scored ×4 with support info when ≤50
- PASS — [habits & plan limits] habit toggle done
- PASS — [habits & plan limits] habit streak 1 + 28-day grid
- PASS — [habits & plan limits] future completion rejected
- PASS — [habits & plan limits] Free plan habit limit (5) → 402
- PASS — [habits & plan limits] habit stats
- PASS — [dashboard & analytics] dashboard score computed from logs
- PASS — [dashboard & analytics] dashboard totals match logs
- PASS — [dashboard & analytics] dashboard planned workout from weekly plan uses weekday
- PASS — [dashboard & analytics] analytics series 30 days
- PASS — [dashboard & analytics] analytics bad metric 400
- PASS — [dashboard & analytics] insights endpoint
- PASS — [dashboard & analytics] premium content locked on Free
- PASS — [dashboard & analytics] premium item 402 on Free
- PASS — [AI coach & AI health tools (sandbox provider)] chat (JSON mode) answers + creates conversation
- PASS — [AI coach & AI health tools (sandbox provider)] chat streams SSE (start/delta/done)
- PASS — [AI coach & AI health tools (sandbox provider)] chat history stored (4 messages, decrypted)
- PASS — [AI coach & AI health tools (sandbox provider)] crisis language → helpline reply, no model call
- PASS — [AI coach & AI health tools (sandbox provider)] crisis detection in Hinglish → Hindi reply
- PASS — [AI coach & AI health tools (sandbox provider)] AI tools need Premium → 402 on Free
- PASS — [AI coach & AI health tools (sandbox provider)] free trial starts (TRIALING)
- PASS — [AI coach & AI health tools (sandbox provider)] second trial refused
- PASS — [AI coach & AI health tools (sandbox provider)] plan now PREMIUM
- PASS — [AI coach & AI health tools (sandbox provider)] premium content unlocked on trial
- PASS — [AI coach & AI health tools (sandbox provider)] 7th habit allowed on Premium
- PASS — [AI coach & AI health tools (sandbox provider)] AI meal plan
- PASS — [AI coach & AI health tools (sandbox provider)] AI workout plan
- PASS — [AI coach & AI health tools (sandbox provider)] AI weekly report with computed facts
- PASS — [AI coach & AI health tools (sandbox provider)] AI sleep coach
- PASS — [AI coach & AI health tools (sandbox provider)] AI stress coach
- PASS — [AI coach & AI health tools (sandbox provider)] AI journal reflection
- PASS — [AI coach & AI health tools (sandbox provider)] AI doctor summary
- PASS — [AI coach & AI health tools (sandbox provider)] AI lab explainer
- PASS — [AI coach & AI health tools (sandbox provider)] AI meal photo accepts image upload
- PASS — [AI coach & AI health tools (sandbox provider)] AI meal photo rejects non-images
- PASS — [AI coach & AI health tools (sandbox provider)] AI reports history (encrypted at rest, decrypted on read)
- PASS — [AI coach & AI health tools (sandbox provider)] AI usage counter
- PASS — [notifications, devices, cron reminders] device register
- PASS — [notifications, devices, cron reminders] cron rejects missing secret
- PASS — [notifications, devices, cron reminders] cron runs
- PASS — [notifications, devices, cron reminders] cron dedupes (second run creates no water reminder twice)
- PASS — [notifications, devices, cron reminders] notifications list
- PASS — [notifications, devices, cron reminders] read-all
- PASS — [integrations] integration list shows Connect/Configure state, none faked
- PASS — [integrations] connect requires explicit consent
- PASS — [integrations] real Fitbit connect without keys → 503 not_configured
- PASS — [integrations] sandbox connect (dev only, flagged)
- PASS — [integrations] sandbox sync imports DEVICE rows
- PASS — [integrations] ingest refused before connecting Apple Health
- PASS — [integrations] HealthKit ingest stores DEVICE data, rejects out-of-range
- PASS — [integrations] dashboard prefers higher of manual/device steps
- PASS — [integrations] disconnect + purge device data
- PASS — [integrations] integration consent withdrawal recorded
- PASS — [billing] plans public
- PASS — [billing] checkout without gateway keys → 503 (no fake payment)
- PASS — [billing] payment history empty
- PASS — [billing] refund of unknown payment 404
- PASS — [billing] webhook with bad signature rejected
- PASS — [RBAC & admin] super admin login
- PASS — [RBAC & admin] user cannot reach admin (403)
- PASS — [RBAC & admin] admin overview live KPIs
- PASS — [RBAC & admin] admin user search + plan column
- PASS — [RBAC & admin] admin user detail excludes health data
- PASS — [RBAC & admin] admin cannot suspend self
- PASS — [RBAC & admin] admin suspends user
- PASS — [RBAC & admin] suspended user token stops working
- PASS — [RBAC & admin] suspended user cannot log in (403)
- PASS — [RBAC & admin] role change needs roles.manage (super admin ok)
- PASS — [RBAC & admin] support agent can list tickets
- PASS — [RBAC & admin] support agent cannot see revenue overview
- PASS — [RBAC & admin] support agent cannot manage roles
- PASS — [RBAC & admin] roles + permission matrix
- PASS — [RBAC & admin] edit role permissions
- PASS — [RBAC & admin] super admin role is locked
- PASS — [RBAC & admin] admin content create
- PASS — [RBAC & admin] admin content update
- PASS — [RBAC & admin] admin content delete
- PASS — [RBAC & admin] coupon create
- PASS — [RBAC & admin] coupon validates and discounts 20%
- PASS — [RBAC & admin] coupon needs exactly one discount type
- PASS — [RBAC & admin] admin grants complimentary plan
- PASS — [RBAC & admin] admin integrations status
- PASS — [RBAC & admin] admin system health
- PASS — [RBAC & admin] admin settings upsert
- PASS — [RBAC & admin] broadcast to plan segment
- PASS — [RBAC & admin] audit log records admin actions
- PASS — [professionals & appointments] apply as professional → PENDING
- PASS — [professionals & appointments] pending not in public directory
- PASS — [professionals & appointments] unverified pro has no portal access
- PASS — [professionals & appointments] admin verifies professional
- PASS — [professionals & appointments] verified role = PROFESSIONAL
- PASS — [professionals & appointments] pro creates slot series
- PASS — [professionals & appointments] directory search by specialization + language
- PASS — [professionals & appointments] public profile hides registration number, shows open slots
- PASS — [professionals & appointments] book a slot
- PASS — [professionals & appointments] double booking blocked (409)
- PASS — [professionals & appointments] booked slot disappears from profile
- PASS — [professionals & appointments] pro sees request with decrypted notes
- PASS — [professionals & appointments] cannot skip REQUESTED→COMPLETED
- PASS — [professionals & appointments] pro confirms
- PASS — [professionals & appointments] review before completion refused
- PASS — [professionals & appointments] review after completion updates rating
- PASS — [professionals & appointments] outside appointment for reminders
- PASS — [professionals & appointments] appointment reminder within the hour
- PASS — [professionals & appointments] patient cancels
- PASS — [professionals & appointments] admin appointment list
- PASS — [gamification] weekly challenges listed
- PASS — [gamification] join challenge
- PASS — [gamification] challenge progress from logs + opt-in leaderboard
- PASS — [gamification] achievements evaluated (first_log earned) + weekly points
- PASS — [gamification] leaderboard opt-in only
- PASS — [community & moderation] groups listed
- PASS — [community & moderation] group post needs membership
- PASS — [community & moderation] group post after joining
- PASS — [community & moderation] like + comment
- PASS — [community & moderation] feed counts + liked flag + first-name only
- PASS — [community & moderation] blocked author hidden from feed
- PASS — [community & moderation] report content
- PASS — [community & moderation] support agent sees report queue with target
- PASS — [community & moderation] moderator hides post
- PASS — [community & moderation] hidden post gone from feed
- PASS — [support & contact] user opens ticket
- PASS — [support & contact] agent internal note
- PASS — [support & contact] agent replies
- PASS — [support & contact] user sees reply but not internal note
- PASS — [support & contact] ticket isolation: other user 404
- PASS — [support & contact] public contact form
- PASS — [support & contact] contact honeypot blocks bots
- PASS — [data isolation] user cannot read another user's water entry
- PASS — [data isolation] user cannot delete another user's journal
- PASS — [data isolation] user cannot open another user's AI conversation
- PASS — [privacy: export & deletion] data export includes decrypted journal + AI chats
- PASS — [privacy: export & deletion] delete requires confirm
- PASS — [privacy: export & deletion] delete wrong password
- PASS — [privacy: export & deletion] account deletion
- PASS — [privacy: export & deletion] personal data erased, tombstone anonymised
- PASS — [privacy: export & deletion] deleted user cannot log in
- PASS — [logout] logout revokes refresh token

## Not covered here (need real credentials)

Live calls to Anthropic/OpenAI, Razorpay/Stripe, Fitbit/Oura/WHOOP OAuth, Google/Apple sign-in, Twilio, Resend, FCM, Cloudinary and Daily.co. Their code paths return `503 not_configured` without keys (verified above) and use sandbox data only when SANDBOX_MODE=true outside production.
