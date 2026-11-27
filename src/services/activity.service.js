import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { parsePagination } from '../utils/response.js';
import { canViewAllTenants, ownedTenantIds } from '../middleware/platformAccess.js';

const fullName = (u) => [u?.firstName, u?.lastName].filter(Boolean).join(' ').trim() || null;

/**
 * "Who did what" for platform employees.
 * Writing a log entry must never break the real action, so failures are only logged.
 */
class ActivityService {
  /**
   * @param req   Express request (gives the actor, IP and browser)
   * @param entry { event, entity, entityId, tenantId, summary, details }
   */
  async log(req, entry) {
    try {
      await prisma.platformActivityLog.create({
        data: {
          actorId: req.user?.id ?? null,
          actorName: fullName(req.user),
          actorEmail: req.user?.email ?? null,
          event: entry.event,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          tenantId: entry.tenantId ?? null,
          summary: entry.summary,
          details: entry.details ?? undefined,
          ipAddress: req.ip ?? null,
          userAgent: req.headers?.['user-agent']?.slice(0, 300) ?? null,
        },
      });
    } catch (error) {
      logger.warn({ err: error.message, event: entry.event }, 'Could not write platform activity log');
    }
  }

  // ─── reading the activity log ─────────────────────────────────

  async list(query, user, { forceActorId = null } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const where = {};
    const and = [];

    const actorId = forceActorId || query.actorId;
    if (actorId) where.actorId = actorId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.entity) where.entity = query.entity;
    if (query.entityId) where.entityId = query.entityId;
    if (query.event) where.event = query.event;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }
    if (query.search) where.summary = { contains: query.search, mode: 'insensitive' };

    // Employees who cannot see every tenant only see their own actions and activity on their own tenants.
    if (!canViewAllTenants(user)) {
      const ids = await ownedTenantIds(user);
      and.push({ OR: [{ actorId: user.id }, { tenantId: { in: ids } }] });
    }
    if (and.length) where.AND = and;

    const [rows, total] = await Promise.all([
      prisma.platformActivityLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.platformActivityLog.count({ where }),
    ]);

    const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
    const tenantIds = [...new Set(rows.map((r) => r.tenantId).filter(Boolean))];
    const [actors, tenants] = await Promise.all([
      prisma.platformUser.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true, role: { select: { name: true } } },
      }),
      prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    ]);
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    const tenantMap = new Map(tenants.map((t) => [t.id, t]));

    const items = rows.map((r) => {
      const actor = actorMap.get(r.actorId);
      return {
        id: r.id,
        createdAt: r.createdAt,
        event: r.event,
        entity: r.entity,
        entityId: r.entityId,
        summary: r.summary,
        details: r.details,
        actor: {
          id: r.actorId,
          name: r.actorName || fullName(actor),
          email: r.actorEmail,
          employeeCode: actor?.employeeCode ?? null,
          designation: actor?.designation ?? null,
          role: actor?.role?.name ?? null,
        },
        tenant: r.tenantId ? { id: r.tenantId, name: tenantMap.get(r.tenantId)?.name ?? null } : null,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
      };
    });
    return { items, pagination: { page, limit, total } };
  }

  // ─── login history ────────────────────────────────────────────

  async recordLogin({ userId = null, email, success, reason = null, ctx = {} }) {
    try {
      await prisma.platformLoginHistory.create({
        data: {
          platformUserId: userId,
          email: String(email).slice(0, 200),
          success,
          failureReason: reason,
          ipAddress: ctx.ip ?? null,
          userAgent: ctx.userAgent?.slice(0, 300) ?? null,
        },
      });
    } catch (error) {
      logger.warn({ err: error.message }, 'Could not write login history');
    }
  }

  async listLogins(query, { forceUserId = null } = {}) {
    const { page, limit, skip } = parsePagination(query);
    const where = {};
    const userId = forceUserId || query.userId;
    if (userId) where.platformUserId = userId;
    if (query.success !== undefined) where.success = query.success === true || query.success === 'true';
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    const [rows, total] = await Promise.all([
      prisma.platformLoginHistory.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: { platformUser: { select: { firstName: true, lastName: true, employeeCode: true } } },
      }),
      prisma.platformLoginHistory.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      email: r.email,
      success: r.success,
      failureReason: r.failureReason,
      ipAddress: r.ipAddress,
      userAgent: r.userAgent,
      employee: r.platformUser
        ? { id: r.platformUserId, name: fullName(r.platformUser), employeeCode: r.platformUser.employeeCode }
        : null,
    }));
    return { items, pagination: { page, limit, total } };
  }
}

export default new ActivityService();
