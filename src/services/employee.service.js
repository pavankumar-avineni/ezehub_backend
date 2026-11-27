import crypto from 'crypto';
import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../utils/errors.js';
import { parsePagination, parseSort } from '../utils/response.js';
import { PLATFORM_ROLES, PERMISSIONS } from '../constants/index.js';
import { invalidatePlatformUsers } from '../utils/authCache.js';
import platformAccess from './platformAccess.service.js';
import { hasPermission } from '../middleware/authorize.js';

const fullName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim();
const mask = (value) => (value ? `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}` : null);

const EDITABLE_FIELDS = [
  'firstName', 'lastName', 'phone', 'personalEmail', 'personalPhone', 'department', 'designation',
  'reportsToId', 'joiningDate', 'employmentType', 'address', 'city', 'state', 'pincode',
  'emergencyContact', 'idProofType', 'idProofNumber', 'notes', 'avatar',
];

const ROLE_SELECT = { id: true, name: true, code: true, isSystem: true };
const PERSON_SELECT = { id: true, firstName: true, lastName: true, employeeCode: true, designation: true };

/** Generates a readable temporary password that satisfies the password rules. */
export const generateTemporaryPassword = () => {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]);
  const chars = [...pick(upper, 3), ...pick(lower, 5), ...pick(digits, 3), ...pick(upper + lower + digits, 1)];
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/** The people who work for you (platform employees): records, roles, status and security. */
class EmployeeService {
  // ─── helpers ──────────────────────────────────────────────────

  /** What the API returns for an employee. The password hash never leaves the server. */
  _format(user, { includeSensitive = false } = {}) {
    const { passwordHash: _hash, sessionsValidAfter: _sv, idProofNumber, ...rest } = user;
    return {
      ...rest,
      name: fullName(user),
      idProofNumber: includeSensitive ? idProofNumber : mask(idProofNumber),
    };
  }

  async _getUser(id, db = prisma) {
    const user = await db.platformUser.findFirst({
      where: { id, deletedAt: null },
      include: { role: { select: ROLE_SELECT } },
    });
    if (!user) throw new NotFoundError('Employee');
    return user;
  }

  async _getAssignableRole(roleId) {
    const role = await prisma.role.findFirst({
      where: { id: roleId, scope: 'PLATFORM', tenantId: null, deletedAt: null },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundError('Role');
    return role;
  }

  /** Nobody can hand out access they do not have themselves (only Super Admin can hand out everything). */
  _assertCanAssignRole(actor, role) {
    if (actor.role.code === PLATFORM_ROLES.SUPER_ADMIN) return;
    if (role.code === PLATFORM_ROLES.SUPER_ADMIN) throw new ForbiddenError('Only a Super Admin can assign the Super Admin role');
    const missing = role.permissions.map((p) => p.permission.code).filter((c) => !actor.permissions.includes(c));
    if (missing.length) {
      throw new ForbiddenError(`You cannot assign a role with permissions you do not have (${missing.join(', ')})`);
    }
  }

  async _assertNotLastSuperAdmin(user) {
    if (user.role.code !== PLATFORM_ROLES.SUPER_ADMIN || !user.isActive) return;
    if ((await platformAccess.countActiveSuperAdmins(user.id)) === 0) {
      throw new ConflictError('This is the last active Super Admin. Make someone else a Super Admin first');
    }
  }

  async _assertValidManager(reportsToId, selfId = null) {
    if (!reportsToId) return;
    if (reportsToId === selfId) throw new ValidationError('An employee cannot report to themselves');
    const manager = await prisma.platformUser.findFirst({
      where: { id: reportsToId, deletedAt: null, isActive: true, employeeStatus: { not: 'EXITED' } },
      select: { id: true },
    });
    if (!manager) throw new ValidationError('The reporting manager must be an active employee');

    // Walk up the chain so nobody ends up reporting (in)directly to themselves.
    if (selfId) {
      let cursor = reportsToId;
      for (let i = 0; i < 50 && cursor; i += 1) {
        if (cursor === selfId) throw new ValidationError('This would create a reporting loop');
        const up = await prisma.platformUser.findUnique({ where: { id: cursor }, select: { reportsToId: true } });
        cursor = up?.reportsToId;
      }
    }
  }

  async _nextEmployeeCode() {
    const rows = await prisma.$queryRaw`
      SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code FROM 5) AS INTEGER)), 0)::int AS n
      FROM platform_users WHERE employee_code ~ '^EMP-[0-9]+$'`;
    return `EMP-${String((rows[0]?.n || 0) + 1).padStart(4, '0')}`;
  }

  _revokeSessionsData() {
    return { sessionsValidAfter: new Date() };
  }

  async _revokeRefreshTokens(userId, db = prisma) {
    await db.refreshToken.updateMany({ where: { platformUserId: userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  // ─── list / read ──────────────────────────────────────────────

  async list(query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'firstName', 'employeeCode', 'department', 'joiningDate'], 'createdAt');
    const where = { deletedAt: null };
    if (query.status) where.employeeStatus = query.status;
    if (query.isActive !== undefined) where.isActive = query.isActive === true || query.isActive === 'true';
    if (query.roleId) where.roleId = query.roleId;
    if (query.department) where.department = { equals: query.department, mode: 'insensitive' };
    if (query.reportsToId) where.reportsToId = query.reportsToId;
    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' };
      where.OR = ['firstName', 'lastName', 'email', 'employeeCode', 'department', 'designation'].map((f) => ({ [f]: contains }));
    }

    const [rows, total] = await Promise.all([
      prisma.platformUser.findMany({
        where, skip, take: limit, orderBy,
        include: { role: { select: ROLE_SELECT }, reportsTo: { select: PERSON_SELECT } },
      }),
      prisma.platformUser.count({ where }),
    ]);

    const managed = await prisma.tenant.groupBy({
      by: ['accountManagerId'],
      where: { deletedAt: null, accountManagerId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    const managedMap = new Map(managed.map((m) => [m.accountManagerId, m._count._all]));

    const items = rows.map((r) => ({
      ...this._format(r),
      reportsTo: r.reportsTo ? { ...r.reportsTo, name: fullName(r.reportsTo) } : null,
      tenantsManaged: managedMap.get(r.id) || 0,
    }));
    return { items, pagination: { page, limit, total } };
  }

  async get(id, actor) {
    const user = await prisma.platformUser.findFirst({
      where: { id, deletedAt: null },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        reportsTo: { select: PERSON_SELECT },
        directReports: {
          where: { deletedAt: null, employeeStatus: { not: 'EXITED' } },
          select: { ...PERSON_SELECT, employeeStatus: true },
        },
      },
    });
    if (!user) throw new NotFoundError('Employee');

    const [managed, created, activeManaged, creator] = await Promise.all([
      prisma.tenant.count({ where: { accountManagerId: id, deletedAt: null } }),
      prisma.tenant.count({ where: { createdById: id, deletedAt: null } }),
      prisma.tenant.count({ where: { accountManagerId: id, deletedAt: null, status: 'ACTIVE' } }),
      user.createdById ? prisma.platformUser.findUnique({ where: { id: user.createdById }, select: PERSON_SELECT }) : null,
    ]);

    const { permissions, ...role } = user.role;
    const canSeeSensitive = hasPermission(actor, PERMISSIONS.PLATFORM_EMPLOYEES_MANAGE);
    return {
      ...this._format({ ...user, role: undefined }, { includeSensitive: canSeeSensitive }),
      role: { id: role.id, name: role.name, code: role.code, isSystem: role.isSystem },
      permissions: permissions.map((rp) => rp.permission.code),
      reportsTo: user.reportsTo ? { ...user.reportsTo, name: fullName(user.reportsTo) } : null,
      directReports: user.directReports.map((d) => ({ ...d, name: fullName(d) })),
      createdBy: creator ? { ...creator, name: fullName(creator) } : null,
      stats: { tenantsManaged: managed, activeTenantsManaged: activeManaged, tenantsCreated: created },
    };
  }

  async orgChart() {
    const users = await prisma.platformUser.findMany({
      where: { deletedAt: null, employeeStatus: { not: 'EXITED' } },
      select: {
        ...PERSON_SELECT, department: true, reportsToId: true, employeeStatus: true, avatar: true,
        role: { select: { name: true } },
      },
      orderBy: { firstName: 'asc' },
    });
    const nodes = new Map(users.map((u) => [u.id, {
      id: u.id, name: fullName(u), employeeCode: u.employeeCode, designation: u.designation,
      department: u.department, role: u.role?.name ?? null, employeeStatus: u.employeeStatus,
      avatar: u.avatar, directReports: [],
    }]));
    const roots = [];
    for (const u of users) {
      const node = nodes.get(u.id);
      const parent = u.reportsToId && nodes.get(u.reportsToId);
      if (parent) parent.directReports.push(node); else roots.push(node);
    }
    return roots;
  }

  async tenantsOf(id, query) {
    await this._getUser(id);
    const { page, limit, skip } = parsePagination(query);
    const relation = query.relation || 'managed';
    const where = { deletedAt: null };
    if (relation === 'managed') where.accountManagerId = id;
    else if (relation === 'created') where.createdById = id;
    else where.OR = [{ accountManagerId: id }, { createdById: id }];

    const [rows, total] = await Promise.all([
      prisma.tenant.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, email: true, status: true, createdAt: true,
          createdById: true, accountManagerId: true, accountManagerAssignedAt: true,
          subscription: { select: { status: true, ratePerBed: true, trialEndsAt: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ]);
    const items = rows.map((t) => ({
      ...t,
      subscription: t.subscription ? { ...t.subscription, ratePerBed: Number(t.subscription.ratePerBed) } : null,
      isManager: t.accountManagerId === id,
      isCreator: t.createdById === id,
    }));
    return { items, pagination: { page, limit, total } };
  }

  // ─── create / update ──────────────────────────────────────────

  async create(data, actor) {
    const email = data.email.trim().toLowerCase();
    const clash = await prisma.platformUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
    if (clash) throw new ConflictError('An employee with this email already exists');

    const role = await this._getAssignableRole(data.roleId);
    this._assertCanAssignRole(actor, role);
    await this._assertValidManager(data.reportsToId);

    const temporaryPassword = data.password || generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const employeeCode = await this._nextEmployeeCode();
      try {
        const created = await prisma.platformUser.create({
          data: {
            employeeCode,
            email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            roleId: role.id,
            phone: data.phone ?? null,
            personalEmail: data.personalEmail ?? null,
            personalPhone: data.personalPhone ?? null,
            department: data.department ?? null,
            designation: data.designation ?? null,
            reportsToId: data.reportsToId ?? null,
            joiningDate: data.joiningDate ? new Date(data.joiningDate) : null,
            employmentType: data.employmentType ?? 'FULL_TIME',
            address: data.address ?? null,
            city: data.city ?? null,
            state: data.state ?? null,
            pincode: data.pincode ?? null,
            emergencyContact: data.emergencyContact ?? {},
            idProofType: data.idProofType ?? null,
            idProofNumber: data.idProofNumber ?? null,
            notes: data.notes ?? null,
            avatar: data.avatar ?? null,
            mustChangePassword: true,
            createdById: actor.id,
          },
          include: { role: { select: ROLE_SELECT } },
        });
        return { employee: this._format(created, { includeSensitive: true }), temporaryPassword };
      } catch (error) {
        if (error.code === 'P2002' && String(error.meta?.target).includes('employee_code')) continue;
        throw error;
      }
    }
    throw new ConflictError('Could not generate an employee code. Please try again');
  }

  async update(id, data) {
    const user = await this._getUser(id);
    const patch = {};
    for (const field of EDITABLE_FIELDS) {
      if (data[field] === undefined) continue;
      patch[field] = field === 'joiningDate' ? (data[field] ? new Date(data[field]) : null) : data[field];
    }
    if (patch.reportsToId !== undefined) await this._assertValidManager(patch.reportsToId, id);

    const changed = Object.keys(patch).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(user[k]));
    if (!changed.length) throw new ConflictError('Nothing to change');

    await prisma.platformUser.update({ where: { id }, data: patch });
    await invalidatePlatformUsers(id);
    return { changed };
  }

  async setRole(id, roleId, actor) {
    const user = await this._getUser(id);
    if (user.id === actor.id) throw new ConflictError('You cannot change your own role');
    if (user.roleId === roleId) throw new ConflictError('The employee already has this role');

    const role = await this._getAssignableRole(roleId);
    this._assertCanAssignRole(actor, role);
    // Taking Super Admin away from someone also needs the same caution as removing them.
    if (user.role.code === PLATFORM_ROLES.SUPER_ADMIN) {
      if (actor.role.code !== PLATFORM_ROLES.SUPER_ADMIN) throw new ForbiddenError('Only a Super Admin can change a Super Admin\'s role');
      await this._assertNotLastSuperAdmin(user);
    }

    await prisma.platformUser.update({ where: { id }, data: { roleId, ...this._revokeSessionsData() } });
    await invalidatePlatformUsers(id);
    return { from: user.role, to: { id: role.id, name: role.name, code: role.code } };
  }

  // ─── status: leave, exit, reactivate ──────────────────────────

  /** Move every tenant of `fromId` to `toId` and record it in the assignment history. */
  async _reassignAll(tx, fromId, toId, byId, reason) {
    const tenants = await tx.tenant.findMany({ where: { accountManagerId: fromId, deletedAt: null }, select: { id: true } });
    if (!tenants.length) return 0;
    const now = new Date();
    await tx.tenant.updateMany({
      where: { id: { in: tenants.map((t) => t.id) } },
      data: { accountManagerId: toId, accountManagerAssignedAt: now },
    });
    await tx.tenantAssignmentHistory.createMany({
      data: tenants.map((t) => ({ tenantId: t.id, fromUserId: fromId, toUserId: toId, reason, assignedById: byId })),
    });
    return tenants.length;
  }

  async setStatus(id, { status, reason, exitDate, reassignTenantsTo }, actor) {
    const user = await this._getUser(id);
    if (user.id === actor.id) throw new ConflictError('You cannot change your own status');
    if (user.employeeStatus === status) throw new ConflictError(`The employee is already ${status}`);
    if (user.role.code === PLATFORM_ROLES.SUPER_ADMIN && actor.role.code !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenError('Only a Super Admin can change a Super Admin\'s status');
    }

    let reassigned = 0;
    if (status === 'EXITED') {
      await this._assertNotLastSuperAdmin(user);

      const managed = await prisma.tenant.count({ where: { accountManagerId: id, deletedAt: null } });
      if (managed > 0 && !reassignTenantsTo) {
        throw new ConflictError(`${managed} tenant(s) are maintained by this employee. Choose an employee to take them over (reassignTenantsTo)`);
      }
      if (reassignTenantsTo) {
        if (reassignTenantsTo === id) throw new ValidationError('The tenants cannot be handed back to the same employee');
        await this._assertActiveEmployee(reassignTenantsTo);
      }

      await prisma.$transaction(async (tx) => {
        if (reassignTenantsTo) {
          reassigned = await this._reassignAll(tx, id, reassignTenantsTo, actor.id, `Handover: ${fullName(user)} left`);
        }
        // People who reported to them now report to their manager.
        await tx.platformUser.updateMany({ where: { reportsToId: id }, data: { reportsToId: user.reportsToId } });
        await tx.platformUser.update({
          where: { id },
          data: {
            employeeStatus: 'EXITED', isActive: false,
            exitDate: exitDate ? new Date(exitDate) : new Date(),
            exitReason: reason ?? null,
            ...this._revokeSessionsData(),
          },
        });
        await this._revokeRefreshTokens(id, tx);
      }, { timeout: 30000 });
    } else {
      await prisma.platformUser.update({
        where: { id },
        data: { employeeStatus: status, isActive: true, exitDate: null, exitReason: null },
      });
    }

    await invalidatePlatformUsers(id);
    return { from: user.employeeStatus, to: status, tenantsReassigned: reassigned };
  }

  async _assertActiveEmployee(id) {
    const target = await prisma.platformUser.findFirst({
      where: { id, deletedAt: null, isActive: true, employeeStatus: { not: 'EXITED' } },
      select: { id: true },
    });
    if (!target) throw new ValidationError('The selected employee must be active');
    return target;
  }

  // ─── security ─────────────────────────────────────────────────

  async resetPassword(id, actor, password = null) {
    const user = await this._getUser(id);
    if (user.id === actor.id) throw new ConflictError('Use "change password" for your own account');
    if (user.role.code === PLATFORM_ROLES.SUPER_ADMIN && actor.role.code !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenError('Only a Super Admin can reset a Super Admin\'s password');
    }

    const temporaryPassword = password || generateTemporaryPassword();
    await prisma.$transaction(async (tx) => {
      await tx.platformUser.update({
        where: { id },
        data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, ...this._revokeSessionsData() },
      });
      await this._revokeRefreshTokens(id, tx);
    });
    await invalidatePlatformUsers(id);
    return { temporaryPassword };
  }

  async revokeSessions(id) {
    await this._getUser(id);
    await prisma.$transaction(async (tx) => {
      await tx.platformUser.update({ where: { id }, data: this._revokeSessionsData() });
      await this._revokeRefreshTokens(id, tx);
    });
    await invalidatePlatformUsers(id);
  }

  async remove(id, actor) {
    const user = await this._getUser(id);
    if (user.id === actor.id) throw new ConflictError('You cannot delete your own account');
    if (user.role.code === PLATFORM_ROLES.SUPER_ADMIN && actor.role.code !== PLATFORM_ROLES.SUPER_ADMIN) {
      throw new ForbiddenError('Only a Super Admin can delete a Super Admin');
    }
    await this._assertNotLastSuperAdmin(user);

    const managed = await prisma.tenant.count({ where: { accountManagerId: id, deletedAt: null } });
    if (managed > 0) {
      throw new ConflictError(`${managed} tenant(s) are maintained by this employee. Hand them over first (set the status to EXITED with reassignTenantsTo)`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.platformUser.updateMany({ where: { reportsToId: id }, data: { reportsToId: user.reportsToId } });
      await tx.platformUser.update({
        where: { id },
        data: {
          deletedAt: new Date(), isActive: false, employeeStatus: 'EXITED',
          exitDate: user.exitDate ?? new Date(), ...this._revokeSessionsData(),
        },
      });
      await this._revokeRefreshTokens(id, tx);
    });
    await invalidatePlatformUsers(id);
  }
}

export default new EmployeeService();
