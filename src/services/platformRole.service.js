import crypto from 'crypto';
import prisma from '../config/database.js';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../utils/errors.js';
import { PLATFORM_ROLES } from '../constants/index.js';
import { PLATFORM_PERMISSION_INFO, isPlatformPermissionCode } from '../constants/platformAccess.js';
import { invalidatePlatformUsers } from '../utils/authCache.js';

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'role';

/** Roles for your own employees. Ready-made roles can be tuned, Super Admin is locked. */
class PlatformRoleService {
  async listPermissions() {
    const rows = await prisma.permission.findMany({
      where: { OR: [{ code: { startsWith: 'platform:' } }, { code: { startsWith: 'tenants:' } }] },
      orderBy: { code: 'asc' },
    });
    return rows.map((p) => {
      const info = PLATFORM_PERMISSION_INFO[p.code] || {};
      return { id: p.id, code: p.code, name: info.name || p.name, group: info.group || 'Other', description: info.description || p.description };
    }).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  }

  _format(role, employees = 0) {
    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: role.isSystem,
      isLocked: role.code === PLATFORM_ROLES.SUPER_ADMIN,
      employeeCount: employees,
      permissions: role.permissions.map((rp) => ({ id: rp.permission.id, code: rp.permission.code, name: PLATFORM_PERMISSION_INFO[rp.permission.code]?.name || rp.permission.name })),
      createdAt: role.createdAt,
    };
  }

  async list() {
    const roles = await prisma.role.findMany({
      where: { scope: 'PLATFORM', tenantId: null, deletedAt: null },
      include: { permissions: { include: { permission: true } }, _count: { select: { platformUsers: true } } },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return roles.map((r) => this._format(r, r._count.platformUsers));
  }

  async _get(id) {
    const role = await prisma.role.findFirst({
      where: { id, scope: 'PLATFORM', tenantId: null, deletedAt: null },
      include: { permissions: { include: { permission: true } }, _count: { select: { platformUsers: true } } },
    });
    if (!role) throw new NotFoundError('Role');
    return role;
  }

  async get(id) {
    const role = await this._get(id);
    return this._format(role, role._count.platformUsers);
  }

  /** Only platform permissions, and nobody can grant a permission they do not have (except Super Admin). */
  async _validatePermissions(permissionIds, actor) {
    const unique = [...new Set(permissionIds || [])];
    if (!unique.length) return unique;
    const found = await prisma.permission.findMany({ where: { id: { in: unique } }, select: { id: true, code: true } });
    const foundIds = new Set(found.map((p) => p.id));
    const missing = unique.filter((id) => !foundIds.has(id));
    if (missing.length) throw new ValidationError('Unknown permission id(s)', missing.map((id) => ({ field: 'permissionIds', message: id })));

    const notPlatform = found.filter((p) => !isPlatformPermissionCode(p.code));
    if (notPlatform.length) throw new ValidationError(`Not a platform permission: ${notPlatform.map((p) => p.code).join(', ')}`);

    if (actor.role.code !== PLATFORM_ROLES.SUPER_ADMIN) {
      const notOwned = found.filter((p) => !actor.permissions.includes(p.code));
      if (notOwned.length) throw new ForbiddenError(`You cannot grant permissions you do not have: ${notOwned.map((p) => p.code).join(', ')}`);
    }
    return unique;
  }

  async create({ name, description, permissionIds }, actor) {
    const ids = await this._validatePermissions(permissionIds, actor);
    const code = `custom-${slug(name)}-${crypto.randomBytes(3).toString('hex')}`;
    const role = await prisma.$transaction(async (tx) => {
      const created = await tx.role.create({ data: { name, code, description: description ?? null, scope: 'PLATFORM', isSystem: false } });
      if (ids.length) await tx.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: created.id, permissionId })) });
      return created;
    });
    return this.get(role.id);
  }

  async update(id, { name, description }) {
    const role = await this._get(id);
    if (role.code === PLATFORM_ROLES.SUPER_ADMIN) throw new ConflictError('The Super Admin role cannot be changed');
    await prisma.role.update({ where: { id }, data: { ...(name !== undefined && { name }), ...(description !== undefined && { description }) } });
    return this.get(id);
  }

  async setPermissions(id, permissionIds, actor) {
    const role = await this._get(id);
    if (role.code === PLATFORM_ROLES.SUPER_ADMIN) throw new ConflictError('The Super Admin role always has every permission');
    const ids = await this._validatePermissions(permissionIds, actor);

    const before = new Set(role.permissions.map((rp) => rp.permission.code));
    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      if (ids.length) await tx.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: id, permissionId })) });
    });

    // People in this role pick up the change straight away.
    const users = await prisma.platformUser.findMany({ where: { roleId: id }, select: { id: true } });
    await invalidatePlatformUsers(...users.map((u) => u.id));

    const updated = await this.get(id);
    const after = new Set(updated.permissions.map((p) => p.code));
    return {
      role: updated,
      added: [...after].filter((c) => !before.has(c)),
      removed: [...before].filter((c) => !after.has(c)),
    };
  }

  async remove(id) {
    const role = await this._get(id);
    if (role.isSystem) throw new ConflictError('Ready-made roles cannot be deleted');
    if (role._count.platformUsers > 0) {
      throw new ConflictError(`This role is still assigned to ${role._count.platformUsers} employee(s). Move them to another role first`);
    }
    await prisma.role.update({ where: { id }, data: { deletedAt: new Date() } });
    return role;
  }
}

export default new PlatformRoleService();
