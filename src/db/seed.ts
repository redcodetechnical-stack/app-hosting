/**
 * Seeds reference data only: roles & permissions, achievements, the curated food list,
 * exercise library, starter content, a current weekly challenge and community groups.
 * Creates the first SUPER_ADMIN from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD when set.
 * Never creates fake users, logs, payments or analytics. Safe to re-run (idempotent).
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from './index';
import * as s from './schema';

const PERMS: Record<string, string> = {
  'users.read': 'View user accounts (no health data)', 'users.manage': 'Suspend / reactivate users', 'roles.manage': 'Manage roles and permissions',
  'content.manage': 'Manage meditation, workouts, articles, challenges, foods, exercises', 'professionals.verify': 'Verify professionals',
  'appointments.manage': 'View all appointments', 'subscriptions.manage': 'Manage subscriptions', 'payments.read': 'View payments',
  'payments.refund': 'Approve refunds', 'coupons.manage': 'Manage coupons', 'support.manage': 'Handle support tickets',
  'moderation.manage': 'Moderate community reports', 'audit.read': 'Read audit logs', 'integrations.read': 'View integration status',
  'system.manage': 'System health and settings', 'analytics.read': 'Platform analytics', 'notifications.broadcast': 'Send broadcasts',
  'professional.portal': 'Use the professional portal',
};
const ALL = Object.keys(PERMS);
const ROLES: [string, string, string[]][] = [
  ['SUPER_ADMIN', 'Super Admin', ALL],
  ['ADMIN', 'Admin', ALL.filter((p) => !['roles.manage', 'professional.portal'].includes(p))],
  ['CONTENT_MANAGER', 'Content Manager', ['content.manage', 'notifications.broadcast', 'analytics.read']],
  ['SUPPORT_AGENT', 'Support Agent', ['users.read', 'support.manage', 'moderation.manage', 'appointments.manage', 'payments.read']],
  ['PROFESSIONAL', 'Healthcare Professional', ['professional.portal']],
  ['USER', 'End User', []],
];

const FOODS: [string, string, number, number, number, number][] = [
  ['Roti / chapati', '1 medium', 110, 3, 18, 3], ['Steamed rice', '1 cup cooked', 205, 4, 45, 0.4], ['Brown rice', '1 cup cooked', 215, 5, 45, 1.8], ['Toor dal', '1 bowl', 180, 11, 27, 3], ['Rajma curry', '1 bowl', 240, 13, 38, 4], ['Chole', '1 bowl', 270, 12, 40, 8], ['Paneer', '50 g', 150, 9, 2, 11], ['Mixed veg sabzi', '1 bowl', 150, 4, 15, 9], ['Idli', '2 pieces', 130, 4, 27, 0.5], ['Plain dosa', '1 dosa', 170, 4, 29, 4], ['Poha', '1 plate', 250, 5, 45, 6], ['Upma', '1 bowl', 250, 6, 38, 8], ['Moong dal chilla', '2 pieces', 220, 13, 28, 6], ['Aloo paratha', '1 paratha', 290, 6, 40, 12], ['Khichdi', '1 bowl', 220, 8, 36, 5], ['Chicken curry', '1 bowl', 300, 25, 8, 18], ['Fish curry', '1 bowl', 280, 24, 8, 17], ['Chicken biryani', '1 plate', 500, 25, 60, 18], ['Grilled chicken breast', '100 g', 165, 31, 0, 3.6], ['Salmon', '100 g', 208, 20, 0, 13], ['Tofu (firm)', '100 g', 144, 17, 3, 9], ['Boiled egg', '1 large', 78, 6, 0.6, 5], ['Omelette', '2 eggs', 190, 13, 2, 15], ['Sprouts salad', '1 bowl', 120, 8, 20, 1], ['Green salad', '1 bowl', 35, 2, 7, 0.3], ['Broccoli', '1 cup', 55, 3.7, 11, 0.6], ['Sweet potato', '1 medium', 115, 2, 27, 0.1], ['Banana', '1 medium', 105, 1.3, 27, 0.4], ['Apple', '1 medium', 95, 0.5, 25, 0.3], ['Orange', '1 medium', 62, 1.2, 15, 0.2], ['Mango', '1 cup', 100, 1.4, 25, 0.6], ['Toned milk', '1 glass (250 ml)', 145, 8, 12, 7], ['Curd', '1 bowl (150 g)', 90, 5, 7, 4.5], ['Greek yogurt', '170 g', 100, 17, 6, 0.7], ['Sweet lassi', '1 glass', 220, 7, 32, 7], ['Masala chai', '1 cup with sugar', 90, 2.5, 13, 3], ['Black coffee', '1 cup', 5, 0.3, 0, 0], ['Coconut water', '1 glass', 45, 1.7, 9, 0.5], ['Oats porridge', '1 cup cooked', 165, 6, 28, 3.5], ['Whole wheat bread', '1 slice', 80, 4, 14, 1], ['Peanut butter', '1 tbsp', 95, 4, 3, 8], ['Almonds', '10 nuts', 70, 2.6, 2.5, 6], ['Whey protein shake', '1 scoop + water', 120, 24, 3, 1.5], ['Samosa', '1 piece', 260, 4, 30, 14], ['Pasta', '1 cup cooked', 220, 8, 43, 1.3], ['Pizza', '1 slice', 285, 12, 36, 10],
];

const EXERCISES: [string, string, string, string[]][] = [
  ['Bodyweight squat', 'Strength', 'Legs, glutes', ['Stand with feet shoulder-width apart, toes slightly out.', 'Push hips back and bend knees until thighs are near parallel, chest up.', 'Drive through your heels to stand. Aim for 3 sets of 12.']],
  ['Push-up', 'Strength', 'Chest, shoulders, triceps', ['Hands slightly wider than shoulders, body in one straight line.', 'Lower your chest until elbows reach about 90 degrees.', 'Press back up. Drop to your knees to make it easier.']],
  ['Plank', 'Strength', 'Core', ['Forearms under shoulders, legs extended.', 'Brace your stomach and squeeze your glutes; keep hips level.', 'Hold 20 to 45 seconds, breathing steadily.']],
  ['Glute bridge', 'Strength', 'Glutes, hamstrings', ['Lie on your back, knees bent, feet flat.', 'Press through heels to lift hips until body forms a line from shoulders to knees.', 'Pause at the top, lower slowly. 3 sets of 12.']],
  ['Reverse lunge', 'Strength', 'Legs, balance', ['Stand tall, step one foot back.', 'Lower until both knees are near 90 degrees.', 'Push through the front heel to return. Alternate legs.']],
  ['Dumbbell row', 'Strength', 'Back, biceps', ['Hinge forward with a flat back, one hand on a bench.', 'Pull the dumbbell toward your hip, elbow close to the body.', 'Lower with control. 3 sets of 10 per side.']],
  ['Jumping jacks', 'Cardio', 'Full body', ['Start with feet together, arms at sides.', 'Jump feet out while raising arms overhead.', 'Jump back to start. Try 30 to 60 seconds.']],
  ['Mountain climbers', 'HIIT', 'Core, cardio', ['Start in a high plank.', 'Drive one knee toward the chest, then switch quickly.', 'Keep hips low. 20 to 40 seconds per round.']],
  ['Burpee', 'HIIT', 'Full body', ['Squat down and place hands on the floor.', 'Jump feet back to a plank, then jump them forward again.', 'Stand and jump with arms overhead. Step instead of jumping to go easier.']],
  ['Downward dog', 'Yoga', 'Hamstrings, shoulders', ['From hands and knees, tuck toes and lift hips up and back.', 'Press the floor away, lengthen your spine, heels toward the mat.', 'Hold for 5 slow breaths.']],
  ["Child's pose", 'Yoga', 'Back, hips', ['Kneel, bring big toes together and knees apart.', 'Fold forward, arms extended or by your sides.', 'Rest for 5 to 10 breaths.']],
  ['Sun salutation', 'Yoga', 'Full body flow', ['Inhale arms up, exhale fold forward.', 'Step back to plank, lower, lift into cobra, then downward dog.', 'Step forward, fold, and rise. Repeat 3 to 5 rounds.']],
];

const CONTENT: (typeof s.content.$inferInsert)[] = [
  { type: 'MEDITATION', slug: 'arrive-5', title: 'Arrive', level: 'Beginner', durationMin: 5, category: 'Calm', premium: false, published: true, summary: 'Settle into the present with the breath.', body: 'Find a comfortable seat and let your eyes close or soften. Notice where your body touches the chair or the floor. Take a slow breath in through your nose and let it go through your mouth. Let your breathing find its own pace. When thoughts arrive, notice them and come back to the breath.' },
  { type: 'MEDITATION', slug: 'body-scan-8', title: 'Body scan', level: 'Beginner', durationMin: 8, category: 'Relax', premium: false, published: true, summary: 'Release tension from head to toe.', body: 'Bring attention to the top of your head, then slowly down through your face, jaw, neck, shoulders, arms, chest, stomach, hips, legs and feet, softening each area as you go.' },
  { type: 'MEDITATION', slug: 'sleep-wind-down-10', title: 'Sleep wind-down', level: 'Sleep', durationMin: 10, category: 'Sleep', premium: true, published: true, summary: 'Long exhales and a quiet mind before bed.', body: 'Breathe in for four and out for six. Picture thoughts as clouds drifting across a night sky. Feel your body grow heavy against the mattress.' },
  { type: 'MEDITATION', slug: 'focus-reset-3', title: 'Focus reset', level: 'Focus', durationMin: 3, category: 'Focus', premium: false, published: true, summary: 'A three-minute reset before deep work.', body: 'Three counted breaths, one sound, one point of focus, then choose the single next task.' },
  { type: 'MEDITATION', slug: 'open-awareness-15', title: 'Open awareness', level: 'Advanced', durationMin: 15, category: 'Insight', premium: true, published: true, summary: 'Widen attention to sounds, sensations and thoughts.', body: 'Start with the breath, then let awareness widen to include everything arising, without holding on.' },
  { type: 'SLEEP_SOUND', slug: 'rain', title: 'Rain', durationMin: 60, premium: false, published: true, summary: 'Generated on device in the app.' },
  { type: 'SLEEP_SOUND', slug: 'brown-noise', title: 'Brown noise', durationMin: 60, premium: false, published: true, summary: 'Generated on device in the app.' },
  { type: 'WORKOUT_PROGRAM', slug: 'beginner-strength-4w', title: 'Beginner strength, 4 weeks', level: 'Beginner', durationMin: 25, category: 'Strength', premium: false, published: true, summary: 'Three bodyweight sessions a week: squats, push-ups, bridges, planks.' },
  { type: 'WORKOUT_PROGRAM', slug: 'walk-to-run-6w', title: 'Walk to 5 km run, 6 weeks', level: 'Beginner', durationMin: 30, category: 'Cardio', premium: true, published: true, summary: 'Run-walk intervals that build to 30 minutes of easy running.' },
  { type: 'ARTICLE', slug: 'sleep-basics', title: 'Five habits that improve sleep', category: 'Sleep', premium: false, published: true, summary: 'Consistent wake time, morning light, caffeine timing, a cool room, and getting up when you cannot sleep.' },
  { type: 'ARTICLE', slug: 'protein-veg-india', title: 'Getting enough protein on an Indian vegetarian diet', category: 'Nutrition', premium: false, published: true, summary: 'Dal, paneer, curd, soy, sprouts and besan: how to spread protein across the day.' },
  { type: 'RESOURCE', slug: 'tele-manas', title: 'Tele-MANAS mental health helpline', category: 'Support', premium: false, published: true, summary: 'Free, 24x7, many languages. Call 14416 or 1-800-891-4416. Emergency: 112.' },
];

const ACH: [string, string, string, number][] = [
  ['first_log', 'First log', 'Logged anything', 5], ['week_one', 'Week one', 'Logged on 7 different days', 20], ['hydrated_3', 'Hydrated 3', 'Met your water goal 3 days in a row', 15],
  ['steps_goal_7', 'Step streak', 'Met your step goal 7 days in a row', 30], ['ten_workouts', '10 workouts', 'Logged 10 workouts', 25], ['journal_keeper', 'Journal keeper', 'Wrote 5 journal entries', 15],
  ['calm_mind', 'Calm mind', '60 mindful minutes in total', 20], ['score_8', 'Score 8+', 'A daily wellness score of 8 or more', 25],
];

async function main() {
  for (const [k, d] of Object.entries(PERMS)) await db.insert(s.permissions).values({ key: k, description: d }).onConflictDoUpdate({ target: s.permissions.key, set: { description: d } });
  const perms = await db.select().from(s.permissions);
  for (const [key, name, ps] of ROLES) {
    const [r] = await db.insert(s.adminRoles).values({ key, name, system: true }).onConflictDoUpdate({ target: s.adminRoles.key, set: { name } }).returning();
    await db.delete(s.rolePermissions).where(eq(s.rolePermissions.roleId, r.id));
    const ids = perms.filter((p) => ps.includes(p.key)).map((p) => ({ roleId: r.id, permissionId: p.id }));
    if (ids.length) await db.insert(s.rolePermissions).values(ids);
  }
  for (const [key, title, description, points] of ACH) await db.insert(s.achievements).values({ key, title, description, points }).onConflictDoUpdate({ target: s.achievements.key, set: { title, description, points } });

  const haveFoods = (await db.execute(sql`select count(*)::int n from food_items where source='vitalora' and owner_id is null`)).rows[0] as { n: number };
  if (!haveFoods.n) await db.insert(s.foodItems).values(FOODS.map(([name, serving, calories, protein, carbs, fat]) => ({ name, serving, calories, protein, carbs, fat, source: 'vitalora' })));
  for (const [name, category, muscles, instructions] of EXERCISES) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await db.insert(s.exercises).values({ slug, name, category, muscles, instructions }).onConflictDoNothing();
  }
  for (const c of CONTENT) await db.insert(s.content).values(c).onConflictDoNothing();

  // A rolling "this week" challenge so the feature has something live; admins add more in /api/admin/challenges.
  const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday.getTime() + 7 * 864e5 - 1000);
  const existing = (await db.execute(sql`select count(*)::int n from challenges where starts_at = ${monday}`)).rows[0] as { n: number };
  if (!existing.n) await db.insert(s.challenges).values([
    { title: '50k step week', description: 'Walk 50,000 steps this week.', metric: 'STEPS', target: 50000, startsAt: monday, endsAt: sunday, community: true, points: 50 },
    { title: 'Hydration hero', description: 'Drink 15 litres of water across the week.', metric: 'WATER_ML', target: 15000, startsAt: monday, endsAt: sunday, community: false, points: 30 },
    { title: 'Move 150', description: '150 active minutes, the WHO weekly guideline.', metric: 'ACTIVE_MINUTES', target: 150, startsAt: monday, endsAt: sunday, community: true, points: 50 },
  ]);
  const groups = (await db.execute(sql`select count(*)::int n from community_groups`)).rows[0] as { n: number };
  if (!groups.n) await db.insert(s.communityGroups).values([{ name: 'Morning walkers', description: 'Share your morning walks and routes.' }, { name: 'Better sleep club', description: 'Habits and wins for better sleep.' }, { name: 'Veg protein ideas', description: 'High-protein vegetarian meals and recipes.' }]);

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase(), pw = process.env.SEED_ADMIN_PASSWORD;
  if (email && pw) {
    if (pw.length < 12) throw new Error('SEED_ADMIN_PASSWORD must be at least 12 characters');
    const [role] = await db.select().from(s.adminRoles).where(eq(s.adminRoles.key, 'SUPER_ADMIN'));
    const [ex] = await db.select().from(s.users).where(eq(s.users.email, email));
    if (!ex) {
      const [u] = await db.insert(s.users).values({ email, emailVerifiedAt: new Date(), passwordHash: await bcrypt.hash(pw, 12), roleId: role.id }).returning();
      await db.insert(s.profiles).values({ userId: u.id, name: 'Super Admin', onboardedAt: new Date() });
      console.log(`Super admin created: ${email}`);
    } else console.log(`Super admin already exists: ${email}`);
  } else console.log('SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set: no admin account created.');
  console.log('Seed complete.');
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
