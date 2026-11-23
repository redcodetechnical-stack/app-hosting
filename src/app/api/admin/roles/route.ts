import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminRoles, permissions, rolePermissions } from '@/db/schema';
import { route } from '@/lib/http';
import { audit } from '@/lib/audit';

export const GET = route({ perm: 'roles.manage' }, async () => {
  const roles = await db.select().from(adminRoles).orderBy(asc(adminRoles.name));
  const rp = await db.select({ roleId: rolePermissions.roleId, key: permissions.key }).from(rolePermissions).innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId));
  return { items: roles.map((r) => ({ ...r, permissions: rp.filter((x) => x.roleId === r.id).map((x) => x.key) })), allPermissions: await db.select().from(permissions).orderBy(asc(permissions.key)) };
});
export const POST = route({ perm: 'roles.manage', body: z.object({ key: z.string().regex(/^[A-Z_]{3,30}$/), name: z.string().min(2).max(60), description: z.string().max(200).optional() }) }, async ({ user, body, ip }) => {
  const [r] = await db.insert(adminRoles).values({ ...body, system: false }).returning();
  await audit(user.id, 'admin.role_create', { type: 'role', id: r.id }, body, ip);
  return Response.json(r, { status: 201 });
});
