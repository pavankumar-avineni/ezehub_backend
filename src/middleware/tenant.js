import prisma from '../config/database.js';

export const tenantIsolation = (req, _res, next) => {
  if (req.user?.scope === 'TENANT') {
    req.tenantId = req.user.tenantId;
  }
  next();
};

export const enforceTenantScope = (req, _res, next) => {
  if (req.user?.scope === 'TENANT') {
    req.queryFilters = { tenantId: req.user.tenantId };
  }
  next();
};

export const auditLog = (action, entity) => {
  return async (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        prisma.auditLog.create({
          data: {
            tenantId: req.tenantId || null,
            platformUserId: req.user?.scope === 'PLATFORM' ? req.user.id : null,
            tenantUserId: req.user?.scope === 'TENANT' ? req.user.id : null,
            action,
            entity,
            entityId: data?.data?.id || req.params?.id || null,
            newData: req.method !== 'DELETE' ? req.body : null,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          },
        }).catch(() => {});
      }
      return originalJson(data);
    };
    next();
  };
};
