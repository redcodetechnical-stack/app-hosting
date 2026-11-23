/**
 * Vitalora database schema (PostgreSQL, Drizzle ORM).
 * Conventions: uuid text ids, snake_case columns, every user-owned row carries user_id
 * (all queries filter on it = data isolation). Free text that can hold sensitive
 * health/mental-health detail is encrypted at the application layer (AES-256-GCM)
 * in columns suffixed `_enc`.
 */
import { randomUUID } from 'node:crypto';
import {
  pgTable, pgEnum, text, integer, real, boolean, timestamp, date, jsonb, uniqueIndex, index, primaryKey,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date());
const ts = (n: string) => timestamp(n, { withTimezone: true });
const userRef = () => text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' });

// ---------- enums ----------
export const userStatus = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'DELETED']);
export const sexEnum = pgEnum('sex', ['FEMALE', 'MALE', 'UNSPECIFIED']);
export const activityLevel = pgEnum('activity_level', ['SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE']);
export const dataSource = pgEnum('data_source', ['MANUAL', 'DEVICE', 'ESTIMATED', 'IMPORTED', 'AI_ESTIMATED']);
export const mealType = pgEnum('meal_type', ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']);
export const workoutType = pgEnum('workout_type', ['WALK', 'RUN', 'CYCLE', 'STRENGTH', 'YOGA', 'HIIT', 'CARDIO', 'SWIM', 'OTHER']);
export const intensity = pgEnum('intensity', ['LIGHT', 'MODERATE', 'HARD']);
export const metricKind = pgEnum('metric_kind', ['WEIGHT', 'HEART_RATE', 'RESTING_HEART_RATE', 'BLOOD_PRESSURE', 'SPO2', 'BODY_TEMPERATURE', 'BLOOD_GLUCOSE', 'WAIST', 'BODY_FAT']);
export const journalKind = pgEnum('journal_kind', ['EMOTIONAL', 'GRATITUDE', 'SLEEP']);
export const appointmentStatus = pgEnum('appointment_status', ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);
export const professionalStatus = pgEnum('professional_status', ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']);
export const planCode = pgEnum('plan_code', ['FREE', 'PREMIUM', 'FAMILY']);
export const subscriptionStatus = pgEnum('subscription_status', ['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED']);
export const paymentStatus = pgEnum('payment_status', ['CREATED', 'PAID', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']);
export const refundStatus = pgEnum('refund_status', ['REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED']);
export const notificationChannel = pgEnum('notification_channel', ['IN_APP', 'PUSH', 'EMAIL', 'SMS']);
export const notificationType = pgEnum('notification_type', ['WATER', 'WORKOUT', 'MEDITATION', 'SLEEP', 'HABIT', 'APPOINTMENT', 'GOAL', 'SYSTEM', 'WELLNESS']);
export const integrationProvider = pgEnum('integration_provider', ['APPLE_HEALTH', 'HEALTH_CONNECT', 'FITBIT', 'GARMIN', 'OURA', 'WHOOP']);
export const integrationStatus = pgEnum('integration_status', ['CONNECTED', 'DISCONNECTED', 'ERROR', 'PENDING']);
export const contentType = pgEnum('content_type', ['MEDITATION', 'WORKOUT_PROGRAM', 'ARTICLE', 'RESOURCE', 'BANNER', 'SLEEP_SOUND', 'RECIPE']);
export const challengeMetric = pgEnum('challenge_metric', ['STEPS', 'WATER_ML', 'ACTIVE_MINUTES', 'MEDITATION_MINUTES', 'SLEEP_NIGHTS', 'HABIT_COMPLETIONS']);
export const postVisibility = pgEnum('post_visibility', ['PUBLIC', 'GROUP', 'PRIVATE']);
export const reportStatus = pgEnum('report_status', ['OPEN', 'ACTIONED', 'DISMISSED']);
export const ticketStatus = pgEnum('ticket_status', ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED']);
export const ticketPriority = pgEnum('ticket_priority', ['LOW', 'NORMAL', 'HIGH', 'URGENT']);
export const otpPurpose = pgEnum('otp_purpose', ['LOGIN', 'VERIFY_EMAIL', 'VERIFY_PHONE', 'RESET_PASSWORD', 'DELETE_ACCOUNT']);
export const chatRole = pgEnum('chat_role', ['USER', 'ASSISTANT']);

// ---------- identity & access ----------
export const adminRoles = pgTable('admin_roles', {
  id: id(),
  key: text('key').notNull().unique(), // SUPER_ADMIN | ADMIN | CONTENT_MANAGER | SUPPORT_AGENT | PROFESSIONAL | USER
  name: text('name').notNull(),
  description: text('description'),
  system: boolean('system').notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const permissions = pgTable('permissions', {
  id: id(),
  key: text('key').notNull().unique(),
  description: text('description'),
});

export const rolePermissions = pgTable('role_permissions', {
  roleId: text('role_id').notNull().references(() => adminRoles.id, { onDelete: 'cascade' }),
  permissionId: text('permission_id').notNull().references(() => permissions.id, { onDelete: 'cascade' }),
}, (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })]);

export const users = pgTable('users', {
  id: id(),
  email: text('email').unique(),
  phone: text('phone').unique(),
  passwordHash: text('password_hash'),
  emailVerifiedAt: ts('email_verified_at'),
  phoneVerifiedAt: ts('phone_verified_at'),
  googleId: text('google_id').unique(),
  appleId: text('apple_id').unique(),
  status: userStatus('status').notNull().default('ACTIVE'),
  suspendedReason: text('suspended_reason'),
  roleId: text('role_id').notNull().references(() => adminRoles.id),
  lastLoginAt: ts('last_login_at'),
  deletedAt: ts('deleted_at'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('users_status_idx').on(t.status), index('users_created_idx').on(t.createdAt)]);

export const sessions = pgTable('sessions', {
  id: id(),
  userId: userRef(),
  refreshHash: text('refresh_hash').notNull().unique(),
  userAgent: text('user_agent'),
  ip: text('ip'),
  expiresAt: ts('expires_at').notNull(),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

export const otpCodes = pgTable('otp_codes', {
  id: id(),
  target: text('target').notNull(),
  purpose: otpPurpose('purpose').notNull(),
  codeHash: text('code_hash').notNull(),
  attempts: integer('attempts').notNull().default(0),
  expiresAt: ts('expires_at').notNull(),
  consumedAt: ts('consumed_at'),
  createdAt: createdAt(),
}, (t) => [index('otp_target_idx').on(t.target, t.purpose)]);

export const consents = pgTable('consents', {
  id: id(),
  userId: userRef(),
  purpose: text('purpose').notNull(), // terms | privacy | health_data | marketing | integration:FITBIT ...
  version: text('version').notNull(),
  granted: boolean('granted').notNull(),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('consents_user_idx').on(t.userId, t.purpose)]);

export const profiles = pgTable('profiles', {
  id: id(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  birthYear: integer('birth_year'),
  sex: sexEnum('sex').notNull().default('UNSPECIFIED'),
  heightCm: real('height_cm'),
  weightKg: real('weight_kg'),
  activityLevel: activityLevel('activity_level').notNull().default('MODERATE'),
  goals: text('goals').array().notNull().default([]),
  dietPreference: text('diet_preference'), // veg | non_veg | vegan | jain | eggetarian
  language: text('language').notNull().default('en'),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  calorieGoal: integer('calorie_goal').notNull().default(2000),
  waterGoalMl: integer('water_goal_ml').notNull().default(2300),
  stepGoal: integer('step_goal').notNull().default(8000),
  sleepGoalH: real('sleep_goal_h').notNull().default(8),
  glassSizesMl: integer('glass_sizes_ml').array().notNull().default([150, 250, 500]),
  onboardedAt: ts('onboarded_at'),
  privacy: jsonb('privacy').$type<{ profileVisible: boolean; leaderboard: boolean }>().notNull().default({ profileVisible: false, leaderboard: false }),
  notifyPrefs: jsonb('notify_prefs').$type<NotifyPrefs>().notNull().default({ water: { on: false, everyH: 2 }, bedtime: null, workout: null, meditation: null, email: false, push: false, sms: false }),
  createdAt: createdAt(), updatedAt: updatedAt(),
});
export type NotifyPrefs = { water: { on: boolean; everyH: number }; bedtime: string | null; workout: string | null; meditation: string | null; email: boolean; push: boolean; sms: boolean };

export const familyMembers = pgTable('family_members', {
  id: id(),
  ownerId: text('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  memberId: text('member_id').references(() => users.id, { onDelete: 'set null' }),
  inviteEmail: text('invite_email'),
  displayName: text('display_name').notNull(),
  createdAt: createdAt(),
}, (t) => [index('family_owner_idx').on(t.ownerId)]);

// ---------- tracking ----------
export const healthMetrics = pgTable('health_metrics', {
  id: id(), userId: userRef(),
  kind: metricKind('kind').notNull(),
  value: real('value').notNull(),
  value2: real('value2'),
  unit: text('unit').notNull(),
  source: dataSource('source').notNull().default('MANUAL'),
  deviceId: text('device_id'),
  measuredAt: ts('measured_at').notNull(),
  noteEnc: text('note_enc'),
  createdAt: createdAt(),
}, (t) => [index('metrics_user_kind_idx').on(t.userId, t.kind, t.measuredAt)]);

export const activityLogs = pgTable('activity_logs', {
  id: id(), userId: userRef(),
  date: date('date').notNull(),
  steps: integer('steps').notNull().default(0),
  distanceKm: real('distance_km'),
  source: dataSource('source').notNull().default('MANUAL'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('activity_user_date_src').on(t.userId, t.date, t.source)]);

export const exercises = pgTable('exercises', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  muscles: text('muscles').notNull(),
  instructions: text('instructions').array().notNull(),
  mediaUrl: text('media_url'),
  published: boolean('published').notNull().default(true),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const workouts = pgTable('workouts', {
  id: id(), userId: userRef(),
  type: workoutType('type').notNull(),
  startedAt: ts('started_at').notNull(),
  durationMin: integer('duration_min').notNull(),
  distanceKm: real('distance_km'),
  intensity: intensity('intensity').notNull().default('MODERATE'),
  calories: integer('calories').notNull(),
  source: dataSource('source').notNull().default('ESTIMATED'),
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [index('workouts_user_idx').on(t.userId, t.startedAt)]);

export const workoutPlans = pgTable('workout_plans', {
  id: id(), userId: userRef(),
  weekday: integer('weekday').notNull(),
  type: workoutType('type').notNull(),
  minutes: integer('minutes').notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('plan_user_day').on(t.userId, t.weekday)]);

export const foodItems = pgTable('food_items', {
  id: id(),
  name: text('name').notNull(),
  serving: text('serving').notNull(),
  calories: real('calories').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  fiber: real('fiber'),
  micros: jsonb('micros'),
  barcode: text('barcode').unique(),
  source: text('source').notNull().default('vitalora'),
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [index('food_name_idx').on(t.name), index('food_owner_idx').on(t.ownerId)]);

export const nutritionLogs = pgTable('nutrition_logs', {
  id: id(), userId: userRef(),
  foodId: text('food_id').references(() => foodItems.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  serving: text('serving').notNull(),
  quantity: real('quantity').notNull().default(1),
  meal: mealType('meal').notNull(),
  calories: real('calories').notNull(),
  protein: real('protein').notNull(),
  carbs: real('carbs').notNull(),
  fat: real('fat').notNull(),
  source: dataSource('source').notNull().default('MANUAL'),
  eatenAt: ts('eaten_at').notNull(),
  createdAt: createdAt(),
}, (t) => [index('nutrition_user_idx').on(t.userId, t.eatenAt)]);

export const groceryItems = pgTable('grocery_items', {
  id: id(), userId: userRef(),
  text: text('text').notNull(),
  done: boolean('done').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('grocery_user_idx').on(t.userId)]);

export const waterLogs = pgTable('water_logs', {
  id: id(), userId: userRef(),
  amountMl: integer('amount_ml').notNull(),
  loggedAt: ts('logged_at').notNull().defaultNow(),
}, (t) => [index('water_user_idx').on(t.userId, t.loggedAt)]);

export const sleepLogs = pgTable('sleep_logs', {
  id: id(), userId: userRef(),
  wakeDate: date('wake_date').notNull(),
  bedtime: ts('bedtime').notNull(),
  wakeTime: ts('wake_time').notNull(),
  quality: integer('quality').notNull(),
  stages: jsonb('stages'), // only for DEVICE source
  source: dataSource('source').notNull().default('MANUAL'),
  noteEnc: text('note_enc'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('sleep_user_date_src').on(t.userId, t.wakeDate, t.source)]);

export const moodLogs = pgTable('mood_logs', {
  id: id(), userId: userRef(),
  mood: integer('mood').notNull(),
  stress: integer('stress').notNull(),
  tags: text('tags').array().notNull().default([]),
  noteEnc: text('note_enc'),
  loggedAt: ts('logged_at').notNull().defaultNow(),
}, (t) => [index('mood_user_idx').on(t.userId, t.loggedAt)]);

export const journalEntries = pgTable('journal_entries', {
  id: id(), userId: userRef(),
  kind: journalKind('kind').notNull(),
  bodyEnc: text('body_enc').notNull(),
  createdAt: createdAt(),
}, (t) => [index('journal_user_idx').on(t.userId, t.createdAt)]);

export const assessments = pgTable('assessments', {
  id: id(), userId: userRef(),
  instrument: text('instrument').notNull(),
  answers: integer('answers').array().notNull(),
  score: integer('score').notNull(),
  createdAt: createdAt(),
}, (t) => [index('assess_user_idx').on(t.userId, t.instrument)]);

export const habits = pgTable('habits', {
  id: id(), userId: userRef(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Other'),
  reminderAt: text('reminder_at'),
  archivedAt: ts('archived_at'),
  createdAt: createdAt(),
}, (t) => [index('habits_user_idx').on(t.userId)]);

export const habitCompletions = pgTable('habit_completions', {
  id: id(),
  habitId: text('habit_id').notNull().references(() => habits.id, { onDelete: 'cascade' }),
  userId: userRef(),
  date: date('date').notNull(),
}, (t) => [uniqueIndex('habit_day').on(t.habitId, t.date), index('habit_comp_user_idx').on(t.userId, t.date)]);

export const content = pgTable('content', {
  id: id(),
  type: contentType('type').notNull(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary'),
  body: text('body'),
  category: text('category'),
  level: text('level'),
  durationMin: integer('duration_min'),
  mediaUrl: text('media_url'),
  premium: boolean('premium').notNull().default(false),
  published: boolean('published').notNull().default(false),
  createdById: text('created_by_id'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('content_type_idx').on(t.type, t.published)]);

export const meditationSessions = pgTable('meditation_sessions', {
  id: id(), userId: userRef(),
  contentId: text('content_id').references(() => content.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  minutes: integer('minutes').notNull(),
  completedAt: ts('completed_at').notNull().defaultNow(),
}, (t) => [index('med_user_idx').on(t.userId, t.completedAt)]);

// ---------- AI ----------
export const aiConversations = pgTable('ai_conversations', {
  id: id(), userId: userRef(),
  title: text('title').notNull().default('New conversation'),
  language: text('language').notNull().default('en'),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('aiconv_user_idx').on(t.userId, t.updatedAt)]);

export const aiChatMessages = pgTable('ai_chat_messages', {
  id: id(),
  conversationId: text('conversation_id').notNull().references(() => aiConversations.id, { onDelete: 'cascade' }),
  role: chatRole('role').notNull(),
  contentEnc: text('content_enc').notNull(),
  flagged: boolean('flagged').notNull().default(false),
  tokensIn: integer('tokens_in'),
  tokensOut: integer('tokens_out'),
  createdAt: createdAt(),
}, (t) => [index('aimsg_conv_idx').on(t.conversationId, t.createdAt)]);

export const aiReports = pgTable('ai_reports', { // generated AI artefacts: meal plans, workout plans, weekly reports, doctor summaries
  id: id(), userId: userRef(),
  kind: text('kind').notNull(), // meal_plan | workout_plan | weekly_report | sleep_coach | doctor_summary | journal_reflection | lab_explainer | meal_photo | stress_coach
  input: jsonb('input'),
  outputEnc: text('output_enc').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  createdAt: createdAt(),
}, (t) => [index('aireport_user_idx').on(t.userId, t.kind, t.createdAt)]);

// ---------- notifications & devices ----------
export const notifications = pgTable('notifications', {
  id: id(), userId: userRef(),
  type: notificationType('type').notNull(),
  channel: notificationChannel('channel').notNull().default('IN_APP'),
  title: text('title').notNull(),
  body: text('body').notNull(),
  data: jsonb('data'),
  dedupeKey: text('dedupe_key').unique(),
  sendAt: ts('send_at').notNull().defaultNow(),
  sentAt: ts('sent_at'),
  readAt: ts('read_at'),
  error: text('error'),
  createdAt: createdAt(),
}, (t) => [index('notif_user_idx').on(t.userId, t.readAt), index('notif_due_idx').on(t.sentAt, t.sendAt)]);

export const devices = pgTable('devices', {
  id: id(), userId: userRef(),
  platform: text('platform').notNull(),
  pushToken: text('push_token').unique(),
  name: text('name'),
  lastSeenAt: ts('last_seen_at').notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [index('devices_user_idx').on(t.userId)]);

export const integrations = pgTable('integrations', {
  id: id(), userId: userRef(),
  provider: integrationProvider('provider').notNull(),
  status: integrationStatus('status').notNull().default('PENDING'),
  externalUserId: text('external_user_id'),
  accessTokenEnc: text('access_token_enc'),
  refreshTokenEnc: text('refresh_token_enc'),
  tokenExpiresAt: ts('token_expires_at'),
  scopes: text('scopes').array().notNull().default([]),
  sandbox: boolean('sandbox').notNull().default(false),
  lastSyncAt: ts('last_sync_at'),
  lastError: text('last_error'),
  oauthState: text('oauth_state').unique(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [uniqueIndex('integration_user_provider').on(t.userId, t.provider)]);

export const webhookEvents = pgTable('webhook_events', {
  id: id(),
  provider: text('provider').notNull(),
  externalId: text('external_id'),
  payload: jsonb('payload').notNull(),
  processedAt: ts('processed_at'),
  error: text('error'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('webhook_provider_ext').on(t.provider, t.externalId)]);

// ---------- professionals & appointments ----------
export const professionals = pgTable('professionals', {
  id: id(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  title: text('title').notNull(),
  specializations: text('specializations').array().notNull().default([]),
  bio: text('bio'),
  languages: text('languages').array().notNull().default([]),
  city: text('city'),
  registrationNo: text('registration_no'),
  yearsExp: integer('years_exp'),
  feeInr: integer('fee_inr'),
  status: professionalStatus('status').notNull().default('PENDING'),
  verifiedAt: ts('verified_at'),
  verifiedById: text('verified_by_id'),
  ratingAvg: real('rating_avg').notNull().default(0),
  ratingCount: integer('rating_count').notNull().default(0),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('pro_status_idx').on(t.status)]);

export const availabilitySlots = pgTable('availability_slots', {
  id: id(),
  professionalId: text('professional_id').notNull().references(() => professionals.id, { onDelete: 'cascade' }),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  booked: boolean('booked').notNull().default(false),
}, (t) => [uniqueIndex('slot_pro_start').on(t.professionalId, t.startsAt)]);

export const appointments = pgTable('appointments', {
  id: id(), userId: userRef(),
  professionalId: text('professional_id').references(() => professionals.id, { onDelete: 'set null' }),
  slotId: text('slot_id').unique(),
  externalName: text('external_name'),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at'),
  status: appointmentStatus('status').notNull().default('REQUESTED'),
  videoRoomUrl: text('video_room_url'),
  notesEnc: text('notes_enc'),
  documentUrls: text('document_urls').array().notNull().default([]),
  reminderSentAt: ts('reminder_sent_at'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('appt_user_idx').on(t.userId, t.startsAt), index('appt_pro_idx').on(t.professionalId, t.startsAt)]);

export const reviews = pgTable('reviews', {
  id: id(),
  professionalId: text('professional_id').notNull().references(() => professionals.id, { onDelete: 'cascade' }),
  userId: userRef(),
  appointmentId: text('appointment_id').notNull().unique(),
  rating: integer('rating').notNull(),
  comment: text('comment'),
  createdAt: createdAt(),
});

// ---------- billing ----------
export const subscriptions = pgTable('subscriptions', {
  id: id(), userId: userRef(),
  plan: planCode('plan').notNull(),
  status: subscriptionStatus('status').notNull(),
  provider: text('provider'),
  providerSubId: text('provider_sub_id').unique(),
  currentPeriodEnd: ts('current_period_end'),
  trialEndsAt: ts('trial_ends_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  cancelledAt: ts('cancelled_at'),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('subs_user_idx').on(t.userId, t.status)]);

export const payments = pgTable('payments', {
  id: id(), userId: userRef(),
  subscriptionId: text('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  plan: planCode('plan'),
  provider: text('provider').notNull(),
  providerOrderId: text('provider_order_id').unique(),
  providerPaymentId: text('provider_payment_id').unique(),
  amountPaise: integer('amount_paise').notNull(),
  currency: text('currency').notNull().default('INR'),
  status: paymentStatus('status').notNull().default('CREATED'),
  couponCode: text('coupon_code'),
  invoiceNo: text('invoice_no').unique(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('payments_user_idx').on(t.userId, t.createdAt)]);

export const refunds = pgTable('refunds', {
  id: id(),
  paymentId: text('payment_id').notNull().references(() => payments.id, { onDelete: 'cascade' }),
  amountPaise: integer('amount_paise').notNull(),
  reason: text('reason').notNull(),
  status: refundStatus('status').notNull().default('REQUESTED'),
  providerRefundId: text('provider_refund_id'),
  decidedById: text('decided_by_id'),
  createdAt: createdAt(), updatedAt: updatedAt(),
});

export const coupons = pgTable('coupons', {
  id: id(),
  code: text('code').notNull().unique(),
  percentOff: integer('percent_off'),
  amountOffPaise: integer('amount_off_paise'),
  plans: planCode('plans').array().notNull().default([]),
  maxUses: integer('max_uses'),
  usedCount: integer('used_count').notNull().default(0),
  expiresAt: ts('expires_at'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

// ---------- gamification & community ----------
export const challenges = pgTable('challenges', {
  id: id(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  metric: challengeMetric('metric').notNull(),
  target: integer('target').notNull(),
  startsAt: ts('starts_at').notNull(),
  endsAt: ts('ends_at').notNull(),
  community: boolean('community').notNull().default(false),
  points: integer('points').notNull().default(50),
  published: boolean('published').notNull().default(true),
  createdAt: createdAt(),
});

export const challengeParticipants = pgTable('challenge_participants', {
  id: id(),
  challengeId: text('challenge_id').notNull().references(() => challenges.id, { onDelete: 'cascade' }),
  userId: userRef(),
  joinedAt: ts('joined_at').notNull().defaultNow(),
  completedAt: ts('completed_at'),
}, (t) => [uniqueIndex('challenge_user').on(t.challengeId, t.userId)]);

export const achievements = pgTable('achievements', {
  id: id(),
  key: text('key').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  points: integer('points').notNull().default(10),
});

export const userAchievements = pgTable('user_achievements', {
  id: id(), userId: userRef(),
  achievementId: text('achievement_id').notNull().references(() => achievements.id, { onDelete: 'cascade' }),
  earnedAt: ts('earned_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('user_ach').on(t.userId, t.achievementId)]);

export const communityGroups = pgTable('community_groups', {
  id: id(),
  name: text('name').notNull(),
  description: text('description'),
  createdById: text('created_by_id'),
  createdAt: createdAt(),
});

export const groupMembers = pgTable('group_members', {
  id: id(),
  groupId: text('group_id').notNull().references(() => communityGroups.id, { onDelete: 'cascade' }),
  userId: userRef(),
  joinedAt: ts('joined_at').notNull().defaultNow(),
}, (t) => [uniqueIndex('group_user').on(t.groupId, t.userId)]);

export const communityPosts = pgTable('community_posts', {
  id: id(),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  groupId: text('group_id').references(() => communityGroups.id, { onDelete: 'set null' }),
  body: text('body').notNull(),
  visibility: postVisibility('visibility').notNull().default('PUBLIC'),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('posts_group_idx').on(t.groupId, t.createdAt), index('posts_created_idx').on(t.createdAt)]);

export const comments = pgTable('comments', {
  id: id(),
  postId: text('post_id').notNull().references(() => communityPosts.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: createdAt(),
}, (t) => [index('comments_post_idx').on(t.postId, t.createdAt)]);

export const postLikes = pgTable('post_likes', {
  id: id(),
  postId: text('post_id').notNull().references(() => communityPosts.id, { onDelete: 'cascade' }),
  userId: userRef(),
}, (t) => [uniqueIndex('like_post_user').on(t.postId, t.userId)]);

export const reports = pgTable('reports', {
  id: id(),
  reporterId: text('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull(),
  status: reportStatus('status').notNull().default('OPEN'),
  resolvedById: text('resolved_by_id'),
  createdAt: createdAt(),
}, (t) => [index('reports_status_idx').on(t.status)]);

export const blocks = pgTable('blocks', {
  id: id(),
  blockerId: text('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: text('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('block_pair').on(t.blockerId, t.blockedId)]);

// ---------- support, audit, system ----------
export const supportTickets = pgTable('support_tickets', {
  id: id(), userId: userRef(),
  subject: text('subject').notNull(),
  status: ticketStatus('status').notNull().default('OPEN'),
  priority: ticketPriority('priority').notNull().default('NORMAL'),
  assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, (t) => [index('tickets_status_idx').on(t.status, t.priority)]);

export const ticketMessages = pgTable('ticket_messages', {
  id: id(),
  ticketId: text('ticket_id').notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  internal: boolean('internal').notNull().default(false),
  createdAt: createdAt(),
});

export const contactMessages = pgTable('contact_messages', {
  id: id(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  message: text('message').notNull(),
  handled: boolean('handled').notNull().default(false),
  createdAt: createdAt(),
});

export const auditLogs = pgTable('audit_logs', {
  id: id(),
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  meta: jsonb('meta'),
  ip: text('ip'),
  createdAt: createdAt(),
}, (t) => [index('audit_actor_idx').on(t.actorId, t.createdAt), index('audit_action_idx').on(t.action, t.createdAt)]);

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: updatedAt(),
});
