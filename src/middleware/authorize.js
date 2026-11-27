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
  // New employees get a temporary password. Until they set their own, only the auth
  // endpoints (change password, profile, logout, refresh) work.
  if (req.user.mustChangePassword) {
    return next(new ForbiddenError('You must change your temporary password before continuing', [
      { code: 'PASSWORD_CHANGE_REQUIRED' },
    ]));
  }
  next();
};

/** Permission check that also lets a caller test their own permissions in handlers. */
export const hasPermission = (user, code) => Boolean(user?.permissions?.includes(code));

export const requireTenant = (req, _res, next) => {
  if (req.user?.scope !== 'TENANT') {
    return next(new ForbiddenError('Tenant access required'));
  }
  next();
};

export const requireRole = (...roles) => {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role.code)) {
      return next(new ForbiddenError('Insufficient role'));
    }
    next();
  };
};
