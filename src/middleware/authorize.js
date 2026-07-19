import { ForbiddenError } from '../utils/errors.js';

export const authorize = (...requiredPermissions) => {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new ForbiddenError('Authentication required'));
    }

    const hasPermission = requiredPermissions.some((perm) =>
      req.user.permissions.includes(perm)
    );

    if (!hasPermission) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

export const requirePlatform = (req, _res, next) => {
  if (req.user?.scope !== 'PLATFORM') {
    return next(new ForbiddenError('Platform access required'));
  }
  next();
};

export const requireTenant = (req, _res, next) => {
  if (req.user?.scope !== 'TENANT') {
    return next(new ForbiddenError('Tenant access required'));
  }
  next();
};

export const requireRole = (...roles) => {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role.slug)) {
      return next(new ForbiddenError('Insufficient role'));
    }
    next();
  };
};
