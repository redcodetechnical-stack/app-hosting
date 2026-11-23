/** Central config. Every external provider is optional: when its keys are missing the
 *  related endpoints answer 503 `not_configured` (or sandbox data when SANDBOX_MODE=true
 *  outside production). Nothing is faked in production. */
const e = (k: string) => process.env[k]?.trim() || undefined;
/** APP_ENV lets a production build run as `staging`/`test`; defaults to NODE_ENV. */
const appEnv = e('APP_ENV') ?? process.env.NODE_ENV ?? 'development';

export const env = {
  nodeEnv: appEnv,
  isProd: appEnv === 'production',
  appUrl: e('APP_URL') ?? 'http://localhost:3000',
  corsOrigins: (e('CORS_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  jwtSecret: e('JWT_SECRET'),
  encryptionKey: e('ENCRYPTION_KEY'),
  otpSecret: e('OTP_SECRET') ?? e('JWT_SECRET'),
  cronSecret: e('CRON_SECRET'),
  redisUrl: e('REDIS_URL'),
  sandbox: process.env.SANDBOX_MODE === 'true' && appEnv !== 'production',
  trialDays: Number(e('FREE_TRIAL_DAYS') ?? 7),
  freeAiMessagesPerDay: Number(e('FREE_AI_MESSAGES_PER_DAY') ?? 5),

  // AI
  aiProvider: (e('AI_PROVIDER') ?? 'anthropic') as 'anthropic' | 'openai',
  anthropicKey: e('ANTHROPIC_API_KEY'),
  anthropicModel: e('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
  openaiKey: e('OPENAI_API_KEY'),
  openaiModel: e('OPENAI_MODEL') ?? 'gpt-4.1-mini',

  // Auth providers
  googleClientId: e('GOOGLE_CLIENT_ID'), googleClientSecret: e('GOOGLE_CLIENT_SECRET'),
  appleClientId: e('APPLE_CLIENT_ID'), appleTeamId: e('APPLE_TEAM_ID'), appleKeyId: e('APPLE_KEY_ID'), applePrivateKey: e('APPLE_PRIVATE_KEY'),

  // Messaging
  twilioSid: e('TWILIO_ACCOUNT_SID'), twilioToken: e('TWILIO_AUTH_TOKEN'), twilioFrom: e('TWILIO_FROM_NUMBER'),
  resendKey: e('RESEND_API_KEY'), emailFrom: e('EMAIL_FROM') ?? 'Vitalora <no-reply@vitalora.app>',
  fcmProjectId: e('FCM_PROJECT_ID'), fcmClientEmail: e('FCM_CLIENT_EMAIL'), fcmPrivateKey: e('FCM_PRIVATE_KEY'),

  // Payments
  razorpayKeyId: e('RAZORPAY_KEY_ID'), razorpayKeySecret: e('RAZORPAY_KEY_SECRET'), razorpayWebhookSecret: e('RAZORPAY_WEBHOOK_SECRET'),
  stripeKey: e('STRIPE_SECRET_KEY'), stripeWebhookSecret: e('STRIPE_WEBHOOK_SECRET'),
  paymentProvider: (e('PAYMENT_PROVIDER') ?? 'razorpay') as 'razorpay' | 'stripe',

  // Wearables
  fitbitClientId: e('FITBIT_CLIENT_ID'), fitbitClientSecret: e('FITBIT_CLIENT_SECRET'), fitbitVerifyCode: e('FITBIT_SUBSCRIBER_VERIFY'),
  ouraClientId: e('OURA_CLIENT_ID'), ouraClientSecret: e('OURA_CLIENT_SECRET'),
  whoopClientId: e('WHOOP_CLIENT_ID'), whoopClientSecret: e('WHOOP_CLIENT_SECRET'),
  garminConsumerKey: e('GARMIN_CONSUMER_KEY'), garminConsumerSecret: e('GARMIN_CONSUMER_SECRET'),
  healthIngestKey: e('HEALTH_INGEST_SIGNING_KEY'),

  // Food data
  nutritionixAppId: e('NUTRITIONIX_APP_ID'), nutritionixKey: e('NUTRITIONIX_API_KEY'),
  edamamAppId: e('EDAMAM_APP_ID'), edamamKey: e('EDAMAM_APP_KEY'),
  openFoodFacts: process.env.OPENFOODFACTS_ENABLED !== 'false',

  // Media & video & maps
  cloudinaryCloud: e('CLOUDINARY_CLOUD_NAME'), cloudinaryKey: e('CLOUDINARY_API_KEY'), cloudinarySecret: e('CLOUDINARY_API_SECRET'),
  dailyKey: e('DAILY_API_KEY'),
  mapsKey: e('GOOGLE_MAPS_API_KEY'),
};

export const configured = {
  ai: () => (env.aiProvider === 'openai' ? !!env.openaiKey : !!env.anthropicKey),
  google: () => !!(env.googleClientId && env.googleClientSecret),
  apple: () => !!(env.appleClientId && env.appleTeamId && env.appleKeyId && env.applePrivateKey),
  sms: () => !!(env.twilioSid && env.twilioToken && env.twilioFrom),
  email: () => !!env.resendKey,
  push: () => !!(env.fcmProjectId && env.fcmClientEmail && env.fcmPrivateKey),
  razorpay: () => !!(env.razorpayKeyId && env.razorpayKeySecret),
  stripe: () => !!env.stripeKey,
  payments: () => (env.paymentProvider === 'stripe' ? !!env.stripeKey : !!(env.razorpayKeyId && env.razorpayKeySecret)),
  fitbit: () => !!(env.fitbitClientId && env.fitbitClientSecret),
  oura: () => !!(env.ouraClientId && env.ouraClientSecret),
  whoop: () => !!(env.whoopClientId && env.whoopClientSecret),
  garmin: () => !!(env.garminConsumerKey && env.garminConsumerSecret),
  nutritionix: () => !!(env.nutritionixAppId && env.nutritionixKey),
  edamam: () => !!(env.edamamAppId && env.edamamKey),
  cloudinary: () => !!(env.cloudinaryCloud && env.cloudinaryKey && env.cloudinarySecret),
  video: () => !!env.dailyKey,
  maps: () => !!env.mapsKey,
  redis: () => !!env.redisUrl,
};

export function requireSecret(name: 'jwtSecret' | 'encryptionKey'): string {
  const v = env[name];
  if (!v) throw new Error(`Missing required env ${name === 'jwtSecret' ? 'JWT_SECRET' : 'ENCRYPTION_KEY'}`);
  return v;
}
