import prisma from '../config/database.js';
import { PERMISSIONS } from '../constants/index.js';
import { PRESET_ROLES, PLATFORM_PERMISSION_INFO, isPlatformPermissionCode } from '../constants/platformAccess.js';
import { PLATFORM_ROLES } from '../constants/index.js';
import { invalidatePlatformUsers } from '../utils/authCache.js';

const permissionName = (key) => key.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Keeps the platform permission catalog and the ready-made roles in the database.
 *
 *  - Every permission in code exists in the database (create-only for tenant ones).
 *  - The 5 ready-made roles are created if missing. Existing roles keep the permissions the owner chose.
 *  - Super Admin always holds every platform permission.
 *  - `topUp: true` also adds missing default permissions to existing ready-made roles (used by the seed).
 */
class PlatformAccessService {
  async ensureDefaults({ topUp = false } = {}) {
    // 1. permissions
    for (const [key, code] of Object.entries(PERMISSIONS)) {
      const info = PLATFORM_PERMISSION_INFO[code];
      await prisma.permission.upsert({
        where: { code },
        update: info ? { name: info.name, description: info.description } : {},
        create: {
          code,
          name: info?.name || permissionName(key),
          module: code.split(':')[0],
          description: info?.description || null,
        },
      });
    }

    const all = await prisma.permission.findMany({ select: { id: true, code: true } });
    const byCode = new Map(all.map((p) => [p.code, p.id]));
    const platformIds = all.filter((p) => isPlatformPermissionCode(p.code)).map((p) => p.id);

    // 2. ready-made roles
    for (const preset of PRESET_ROLES) {
      let role = await prisma.role.findFirst({ where: { code: preset.code, tenantId: null } });
      const isNew = !role;
      if (!role) {
        role = await prisma.role.create({
          data: { code: preset.code, name: preset.name, description: preset.description, scope: 'PLATFORM', isSystem: true },
        });
      } else if (!role.description || !role.isSystem) {
        role = await prisma.role.update({
          where: { id: role.id },
          data: { description: role.description || preset.description, isSystem: true },
        });
      }

      const wanted = preset.permissions === 'ALL' ? platformIds : preset.permissions.map((c) => byCode.get(c)).filter(Boolean);
      // Super Admin always gets everything. Other roles get their defaults when created (or on top-up).
      if (preset.permissions === 'ALL' || isNew || topUp) {
        const existing = await prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } });
        const have = new Set(existing.map((r) => r.permissionId));
        const missing = wanted.filter((id) => !have.has(id));
        if (missing.length) {
          await prisma.rolePermission.createMany({
            data: missing.map((permissionId) => ({ roleId: role.id, permissionId })),
            skipDuplicates: true,
          });
          const users = await prisma.platformUser.findMany({ where: { roleId: role.id }, select: { id: true } });
          await invalidatePlatformUsers(...users.map((u) => u.id));
        }
      }
    }
  }

  async getSuperAdminRoleId() {
    const role = await prisma.role.findFirst({ where: { code: PLATFORM_ROLES.SUPER_ADMIN, tenantId: null }, select: { id: true } });
    return role?.id || null;
  }

  /** Active, non-deleted Super Admins (used to make sure the last one is never removed). */
  async countActiveSuperAdmins(excludeUserId = null) {
    const roleId = await this.getSuperAdminRoleId();
    if (!roleId) return 0;
    return prisma.platformUser.count({
      where: {
        roleId, isActive: true, deletedAt: null, employeeStatus: { not: 'EXITED' },
        ...(excludeUserId && { id: { not: excludeUserId } }),
      },
    });
  }
}

export default new PlatformAccessService();
