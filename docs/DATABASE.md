# Vitalora database schema

PostgreSQL 16, managed with Drizzle ORM. Source of truth: `src/db/schema.ts`; SQL migrations in `drizzle/`. Generated from the live database.

**Design rules:** every user-owned table has `user_id` with `on delete cascade` and every API query filters on it (data isolation). Columns ending in `_enc` hold AES-256-GCM ciphertext (journal text, mood/sleep/metric notes, AI messages and reports, appointment notes, OAuth tokens). Every health value carries `source` (MANUAL / DEVICE / ESTIMATED / IMPORTED / AI_ESTIMATED).

**57 tables.**


## achievements

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| key | text |  |
| title | text |  |
| description | text |  |
| points | integer |  |

Indexes/unique: achievements_key_unique

## activity_logs

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| date | date |  |
| steps | integer |  |
| distance_km | real | yes |
| source | data_source |  |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: activity_user_date_src

## admin_roles

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| key | text |  |
| name | text |  |
| description | text | yes |
| system | boolean |  |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Indexes/unique: admin_roles_key_unique

## ai_chat_messages

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| conversation_id | text |  |
| role | chat_role |  |
| content_enc | text |  |
| flagged | boolean |  |
| tokens_in | integer | yes |
| tokens_out | integer | yes |
| created_at | timestamp with time zone |  |

Foreign keys: conversation_id → ai_conversations (on delete cascade)

Indexes/unique: aimsg_conv_idx

## ai_conversations

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| title | text |  |
| language | text |  |
| provider | text |  |
| model | text |  |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: aiconv_user_idx

## ai_reports

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| kind | text |  |
| input | jsonb | yes |
| output_enc | text |  |
| provider | text |  |
| model | text |  |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: aireport_user_idx

## appointments

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| professional_id | text | yes |
| slot_id | text | yes |
| external_name | text | yes |
| starts_at | timestamp with time zone |  |
| ends_at | timestamp with time zone | yes |
| status | appointment_status |  |
| video_room_url | text | yes |
| notes_enc | text | yes |
| document_urls | text[] |  |
| reminder_sent_at | timestamp with time zone | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade); professional_id → professionals (on delete set null)

Indexes/unique: appointments_slot_id_unique, appt_user_idx, appt_pro_idx

## assessments

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| instrument | text |  |
| answers | int[] |  |
| score | integer |  |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: assess_user_idx

## audit_logs

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| actor_id | text | yes |
| action | text |  |
| target_type | text | yes |
| target_id | text | yes |
| meta | jsonb | yes |
| ip | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: actor_id → users (on delete set null)

Indexes/unique: audit_actor_idx, audit_action_idx

## availability_slots

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| professional_id | text |  |
| starts_at | timestamp with time zone |  |
| ends_at | timestamp with time zone |  |
| booked | boolean |  |

Foreign keys: professional_id → professionals (on delete cascade)

Indexes/unique: slot_pro_start

## blocks

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| blocker_id | text |  |
| blocked_id | text |  |
| created_at | timestamp with time zone |  |

Foreign keys: blocker_id → users (on delete cascade); blocked_id → users (on delete cascade)

Indexes/unique: block_pair

## challenge_participants

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| challenge_id | text |  |
| user_id | text |  |
| joined_at | timestamp with time zone |  |
| completed_at | timestamp with time zone | yes |

Foreign keys: challenge_id → challenges (on delete cascade); user_id → users (on delete cascade)

Indexes/unique: challenge_user

## challenges

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| title | text |  |
| description | text |  |
| metric | challenge_metric |  |
| target | integer |  |
| starts_at | timestamp with time zone |  |
| ends_at | timestamp with time zone |  |
| community | boolean |  |
| points | integer |  |
| published | boolean |  |
| created_at | timestamp with time zone |  |

## comments

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| post_id | text |  |
| author_id | text |  |
| body | text |  |
| hidden | boolean |  |
| created_at | timestamp with time zone |  |

Foreign keys: post_id → community_posts (on delete cascade); author_id → users (on delete cascade)

Indexes/unique: comments_post_idx

## community_groups

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| name | text |  |
| description | text | yes |
| created_by_id | text | yes |
| created_at | timestamp with time zone |  |

## community_posts

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| author_id | text |  |
| group_id | text | yes |
| body | text |  |
| visibility | post_visibility |  |
| hidden | boolean |  |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: author_id → users (on delete cascade); group_id → community_groups (on delete set null)

Indexes/unique: posts_group_idx, posts_created_idx

## consents

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| purpose | text |  |
| version | text |  |
| granted | boolean |  |
| ip | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: consents_user_idx

## contact_messages

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| name | text |  |
| email | text |  |
| message | text |  |
| handled | boolean |  |
| created_at | timestamp with time zone |  |

## content

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| type | content_type |  |
| slug | text |  |
| title | text |  |
| summary | text | yes |
| body | text | yes |
| category | text | yes |
| level | text | yes |
| duration_min | integer | yes |
| media_url | text | yes |
| premium | boolean |  |
| published | boolean |  |
| created_by_id | text | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Indexes/unique: content_slug_unique, content_type_idx

## coupons

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| code | text |  |
| percent_off | integer | yes |
| amount_off_paise | integer | yes |
| plans | _plan_code[] |  |
| max_uses | integer | yes |
| used_count | integer |  |
| expires_at | timestamp with time zone | yes |
| active | boolean |  |
| created_at | timestamp with time zone |  |

Indexes/unique: coupons_code_unique

## devices

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| platform | text |  |
| push_token | text | yes |
| name | text | yes |
| last_seen_at | timestamp with time zone |  |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: devices_push_token_unique, devices_user_idx

## exercises

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| slug | text |  |
| name | text |  |
| category | text |  |
| muscles | text |  |
| instructions | text[] |  |
| media_url | text | yes |
| published | boolean |  |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Indexes/unique: exercises_slug_unique

## family_members

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| owner_id | text |  |
| member_id | text | yes |
| invite_email | text | yes |
| display_name | text |  |
| created_at | timestamp with time zone |  |

Foreign keys: owner_id → users (on delete cascade); member_id → users (on delete set null)

Indexes/unique: family_owner_idx

## food_items

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| name | text |  |
| serving | text |  |
| calories | real |  |
| protein | real |  |
| carbs | real |  |
| fat | real |  |
| fiber | real | yes |
| micros | jsonb | yes |
| barcode | text | yes |
| source | text |  |
| owner_id | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: owner_id → users (on delete cascade)

Indexes/unique: food_name_idx, food_items_barcode_unique, food_owner_idx

## grocery_items

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| text | text |  |
| done | boolean |  |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: grocery_user_idx

## group_members

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| group_id | text |  |
| user_id | text |  |
| joined_at | timestamp with time zone |  |

Foreign keys: group_id → community_groups (on delete cascade); user_id → users (on delete cascade)

Indexes/unique: group_user

## habit_completions

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| habit_id | text |  |
| user_id | text |  |
| date | date |  |

Foreign keys: habit_id → habits (on delete cascade); user_id → users (on delete cascade)

Indexes/unique: habit_day, habit_comp_user_idx

## habits

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| name | text |  |
| category | text |  |
| reminder_at | text | yes |
| archived_at | timestamp with time zone | yes |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: habits_user_idx

## health_metrics

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| kind | metric_kind |  |
| value | real |  |
| value2 | real | yes |
| unit | text |  |
| source | data_source |  |
| device_id | text | yes |
| measured_at | timestamp with time zone |  |
| note_enc | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: metrics_user_kind_idx

## integrations

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| provider | integration_provider |  |
| status | integration_status |  |
| external_user_id | text | yes |
| access_token_enc | text | yes |
| refresh_token_enc | text | yes |
| token_expires_at | timestamp with time zone | yes |
| scopes | text[] |  |
| sandbox | boolean |  |
| last_sync_at | timestamp with time zone | yes |
| last_error | text | yes |
| oauth_state | text | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: integration_user_provider, integrations_oauth_state_unique

## journal_entries

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| kind | journal_kind |  |
| body_enc | text |  |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: journal_user_idx

## meditation_sessions

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| content_id | text | yes |
| kind | text |  |
| minutes | integer |  |
| completed_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade); content_id → content (on delete set null)

Indexes/unique: med_user_idx

## mood_logs

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| mood | integer |  |
| stress | integer |  |
| tags | text[] |  |
| note_enc | text | yes |
| logged_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: mood_user_idx

## notifications

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| type | notification_type |  |
| channel | notification_channel |  |
| title | text |  |
| body | text |  |
| data | jsonb | yes |
| dedupe_key | text | yes |
| send_at | timestamp with time zone |  |
| sent_at | timestamp with time zone | yes |
| read_at | timestamp with time zone | yes |
| error | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: notif_due_idx, notifications_dedupe_key_unique, notif_user_idx

## nutrition_logs

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| food_id | text | yes |
| name | text |  |
| serving | text |  |
| quantity | real |  |
| meal | meal_type |  |
| calories | real |  |
| protein | real |  |
| carbs | real |  |
| fat | real |  |
| source | data_source |  |
| eaten_at | timestamp with time zone |  |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade); food_id → food_items (on delete set null)

Indexes/unique: nutrition_user_idx

## otp_codes

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| target | text |  |
| purpose | otp_purpose |  |
| code_hash | text |  |
| attempts | integer |  |
| expires_at | timestamp with time zone |  |
| consumed_at | timestamp with time zone | yes |
| created_at | timestamp with time zone |  |

Indexes/unique: otp_target_idx

## payments

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| subscription_id | text | yes |
| plan | plan_code | yes |
| provider | text |  |
| provider_order_id | text | yes |
| provider_payment_id | text | yes |
| amount_paise | integer |  |
| currency | text |  |
| status | payment_status |  |
| coupon_code | text | yes |
| invoice_no | text | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade); subscription_id → subscriptions (on delete set null)

Indexes/unique: payments_invoice_no_unique, payments_provider_payment_id_unique, payments_user_idx, payments_provider_order_id_unique

## permissions

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| key | text |  |
| description | text | yes |

Indexes/unique: permissions_key_unique

## post_likes

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| post_id | text |  |
| user_id | text |  |

Foreign keys: post_id → community_posts (on delete cascade); user_id → users (on delete cascade)

Indexes/unique: like_post_user

## professionals

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| display_name | text |  |
| title | text |  |
| specializations | text[] |  |
| bio | text | yes |
| languages | text[] |  |
| city | text | yes |
| registration_no | text | yes |
| years_exp | integer | yes |
| fee_inr | integer | yes |
| status | professional_status |  |
| verified_at | timestamp with time zone | yes |
| verified_by_id | text | yes |
| rating_avg | real |  |
| rating_count | integer |  |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: professionals_user_id_unique, pro_status_idx

## profiles

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| name | text | yes |
| avatar_url | text | yes |
| birth_year | integer | yes |
| sex | sex |  |
| height_cm | real | yes |
| weight_kg | real | yes |
| activity_level | activity_level |  |
| goals | text[] |  |
| diet_preference | text | yes |
| language | text |  |
| timezone | text |  |
| calorie_goal | integer |  |
| water_goal_ml | integer |  |
| step_goal | integer |  |
| sleep_goal_h | real |  |
| glass_sizes_ml | int[] |  |
| onboarded_at | timestamp with time zone | yes |
| privacy | jsonb |  |
| notify_prefs | jsonb |  |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: profiles_user_id_unique

## refunds

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| payment_id | text |  |
| amount_paise | integer |  |
| reason | text |  |
| status | refund_status |  |
| provider_refund_id | text | yes |
| decided_by_id | text | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: payment_id → payments (on delete cascade)

## reports

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| reporter_id | text |  |
| target_type | text |  |
| target_id | text |  |
| reason | text |  |
| status | report_status |  |
| resolved_by_id | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: reporter_id → users (on delete cascade)

Indexes/unique: reports_status_idx

## reviews

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| professional_id | text |  |
| user_id | text |  |
| appointment_id | text |  |
| rating | integer |  |
| comment | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: professional_id → professionals (on delete cascade); user_id → users (on delete cascade)

Indexes/unique: reviews_appointment_id_unique

## role_permissions

| Column | Type | Nullable |
|---|---|---|
| role_id | text |  |
| permission_id | text |  |

Foreign keys: role_id → admin_roles (on delete cascade); permission_id → permissions (on delete cascade)

Indexes/unique: role_permissions_role_id_permission_id_pk

## sessions

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| refresh_hash | text |  |
| user_agent | text | yes |
| ip | text | yes |
| expires_at | timestamp with time zone |  |
| revoked_at | timestamp with time zone | yes |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: sessions_user_idx, sessions_refresh_hash_unique

## sleep_logs

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| wake_date | date |  |
| bedtime | timestamp with time zone |  |
| wake_time | timestamp with time zone |  |
| quality | integer |  |
| stages | jsonb | yes |
| source | data_source |  |
| note_enc | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: sleep_user_date_src

## subscriptions

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| plan | plan_code |  |
| status | subscription_status |  |
| provider | text | yes |
| provider_sub_id | text | yes |
| current_period_end | timestamp with time zone | yes |
| trial_ends_at | timestamp with time zone | yes |
| cancel_at_period_end | boolean |  |
| cancelled_at | timestamp with time zone | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: subscriptions_provider_sub_id_unique, subs_user_idx

## support_tickets

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| subject | text |  |
| status | ticket_status |  |
| priority | ticket_priority |  |
| assignee_id | text | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade); assignee_id → users (on delete set null)

Indexes/unique: tickets_status_idx

## system_settings

| Column | Type | Nullable |
|---|---|---|
| key | text |  |
| value | jsonb |  |
| updated_at | timestamp with time zone |  |

## ticket_messages

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| ticket_id | text |  |
| author_id | text |  |
| body | text |  |
| internal | boolean |  |
| created_at | timestamp with time zone |  |

Foreign keys: ticket_id → support_tickets (on delete cascade); author_id → users (on delete cascade)

## user_achievements

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| achievement_id | text |  |
| earned_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade); achievement_id → achievements (on delete cascade)

Indexes/unique: user_ach

## users

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| email | text | yes |
| phone | text | yes |
| password_hash | text | yes |
| email_verified_at | timestamp with time zone | yes |
| phone_verified_at | timestamp with time zone | yes |
| google_id | text | yes |
| apple_id | text | yes |
| status | user_status |  |
| suspended_reason | text | yes |
| role_id | text |  |
| last_login_at | timestamp with time zone | yes |
| deleted_at | timestamp with time zone | yes |
| created_at | timestamp with time zone |  |
| updated_at | timestamp with time zone |  |

Foreign keys: role_id → admin_roles (on delete no action)

Indexes/unique: users_phone_unique, users_created_idx, users_status_idx, users_apple_id_unique, users_google_id_unique, users_email_unique

## water_logs

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| amount_ml | integer |  |
| logged_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: water_user_idx

## webhook_events

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| provider | text |  |
| external_id | text | yes |
| payload | jsonb |  |
| processed_at | timestamp with time zone | yes |
| error | text | yes |
| created_at | timestamp with time zone |  |

Indexes/unique: webhook_provider_ext

## workout_plans

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| weekday | integer |  |
| type | workout_type |  |
| minutes | integer |  |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: plan_user_day

## workouts

| Column | Type | Nullable |
|---|---|---|
| id | text |  |
| user_id | text |  |
| type | workout_type |  |
| started_at | timestamp with time zone |  |
| duration_min | integer |  |
| distance_km | real | yes |
| intensity | intensity |  |
| calories | integer |  |
| source | data_source |  |
| notes | text | yes |
| created_at | timestamp with time zone |  |

Foreign keys: user_id → users (on delete cascade)

Indexes/unique: workouts_user_idx
