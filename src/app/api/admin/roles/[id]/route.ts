import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { adminRoles, permissions, rolePermissions } from '@/db/schema';
import { route, notFound, badRequest } from '@/lib/http';
import { audit } from '@/lib/audit';
import { clearPermCache } from '@/lib/auth';

/** Replace a role's permission set. SUPER_ADMIN always keeps every permission. */
export const PATCH = route({ perm: 'roles.manage', body: z.object({ permissions: z.array(z.string()).max(100), name: z.string().min(2).max(60).optional() }) }, async ({ user, params, body, ip }) => {
  const [r] = await db.select().from(adminRoles).where(eq(adminRoles.id, params.id));
  if (!r) throw notFound();
  if (r.key === 'SUPER_ADMIN') throw badRequest('The super admin role cannot be edited');
  const keys = [...new Set(body.permissions)];
  const ps = keys.length ? await db.select().from(permissions).where(inArray(permissions.key, keys)) : [];
  if (ps.length !== keys.length) throw badRequest('Unknown permission key');
  await db.transaction(async (tx) => {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, r.id));
    if (ps.length) await tx.insert(rolePermissions).values(ps.map((p) => ({ roleId: r.id, permissionId: p.id })));
    if (body.name) await tx.update(adminRoles).set({ name: body.name }).where(eq(adminRoles.id, r.id));
  });
  clearPermCache();
  await audit(user.id, 'admin.role_permissions', { type: 'role', id: r.id }, { permissions: keys }, ip);
  return { ok: true, role: r.key, permissions: keys };
});
