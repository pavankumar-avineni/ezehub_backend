import { verifyAccessToken } from '../utils/jwt.js';
import { UnauthorizedError } from '../utils/errors.js';
import prisma from '../config/database.js';
import { cacheGet, cacheSet } from '../utils/cache.js';

// Short TTL: fast enough to cut per-request DB load on hot paths, short
// enough that a deactivated/suspended account is locked out within seconds.
const USER_CACHE_TTL = 30;
const userCacheKey = (scope, id) => `auth:user:${scope}:${id}`;

export const authenticate = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Access token required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    const cached = await cacheGet(userCacheKey(decoded.scope || 'TENANT', decoded.userId));
    if (cached) {
      req.user = cached;
      return next();
    }

    if (decoded.scope === 'PLATFORM') {
      const user = await prisma.platformUser.findFirst({
        where: { id: decoded.userId, isActive: true, deletedAt: null },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      if (!user) throw new UnauthorizedError('User not found or inactive');
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        scope: 'PLATFORM',
        role: user.role,
        permissions: user.role.permissions.map((rp) => rp.permission.slug),
      };
    } else if (decoded.scope === 'RESIDENT') {
      const resident = await prisma.resident.findFirst({
        where: { id: decoded.userId, status: 'ACTIVE', deletedAt: null },
        include: { tenant: true, bed: { include: { room: { include: { floor: { include: { building: true } } } } } } },
      });
      if (!resident) throw new UnauthorizedError('Resident not found or inactive');
      req.user = {
        userId: resident.id,
        id: resident.id,
        phone: resident.phone,
        email: resident.email,
        firstName: resident.firstName,
        lastName: resident.lastName,
        scope: 'RESIDENT',
        tenantId: resident.tenantId,
        tenant: resident.tenant,
        bed: resident.bed,
        permissions: [],
      };
    } else {
      const user = await prisma.tenantUser.findFirst({
        where: { id: decoded.userId, isActive: true, deletedAt: null },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          tenant: { include: { subscription: true } },
        },
      });
      if (!user) throw new UnauthorizedError('User not found or inactive');
      if (user.tenant.status === 'SUSPENDED' || user.tenant.status === 'DISMISSED') {
        throw new UnauthorizedError('Tenant account is suspended or terminated');
      }
      req.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        scope: 'TENANT',
        tenantId: user.tenantId,
        tenant: user.tenant,
        role: user.role,
        permissions: user.role.permissions.map((rp) => rp.permission.slug),
        isOnHold: user.tenant.status === 'ON_HOLD',
      };
    }

    // Best-effort cache of the resolved identity (no-op when Redis is off).
    cacheSet(userCacheKey(req.user.scope, decoded.userId), req.user, USER_CACHE_TTL);

    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      await authenticate(req, _res, next);
    } else {
      next();
    }
  } catch {
    next();
  }
};
