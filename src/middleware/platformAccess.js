import prisma from '../config/database.js';
import { PERMISSIONS } from '../constants/index.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import { hasPermission } from './authorize.js';

/** true when the employee may see every tenant (otherwise only the ones they created or manage). */
export const canViewAllTenants = (user) => hasPermission(user, PERMISSIONS.PLATFORM_TENANTS_VIEW_ALL);

/** Prisma `where` limiting tenants to the ones an employee owns. Empty object = no limit. */
export const tenantScopeWhere = (user) =>
  (canViewAllTenants(user) ? {} : { OR: [{ accountManagerId: user.id }, { createdById: user.id }] });

/** Ids of the tenants an employee owns (used to scope activity logs). */
export const ownedTenantIds = async (user) => {
  const rows = await prisma.tenant.findMany({ where: { deletedAt: null, ...tenantScopeWhere(user) }, select: { id: true } });
  return rows.map((t) => t.id);
};

/**
 * Employees without "view all tenants" can only open tenants they created or manage.
 * Other tenants answer 404 so their existence is not revealed.
 */
export const requireTenantAccess = (param = 'tenantId') => async (req, _res, next) => {
  try {
    if (canViewAllTenants(req.user)) return next();
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params[param], deletedAt: null, ...tenantScopeWhere(req.user) },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundError('Tenant');
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Same rule for routes that only carry an invoice id. */
export const requireInvoiceAccess = (param = 'invoiceId') => async (req, _res, next) => {
  try {
    if (canViewAllTenants(req.user)) return next();
    const invoice = await prisma.billingInvoice.findUnique({ where: { id: req.params[param] }, select: { tenantId: true } });
    if (!invoice) throw new NotFoundError('Invoice');
    const tenant = await prisma.tenant.findFirst({
      where: { id: invoice.tenantId, deletedAt: null, ...tenantScopeWhere(req.user) },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundError('Invoice');
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Platform-wide numbers (analytics) only make sense for people who can see every tenant. */
export const requireViewAllTenants = (req, _res, next) => {
  if (!canViewAllTenants(req.user)) {
    return next(new ForbiddenError('This needs the "View all tenants" permission'));
  }
  return next();
};
