import tenantService from '../services/tenant.service.js';
import activityService from '../services/activity.service.js';
import { successResponse, paginatedResponse } from '../utils/response.js';
import { PERMISSIONS } from '../constants/index.js';
import { ForbiddenError } from '../utils/errors.js';
import { hasPermission } from '../middleware/authorize.js';

const who = (req) => `${req.user.firstName} ${req.user.lastName}`.trim();

export const createTenant = async (req, res, next) => {
  try {
    const { user, body } = req;
    // A custom rate or trial changes what the tenant pays, so it needs the pricing permission.
    if ((body.ratePerBed !== undefined || body.trialDays !== undefined) && !hasPermission(user, PERMISSIONS.PLATFORM_PRICING_MANAGE)) {
      throw new ForbiddenError('Setting a custom rate or trial length needs the pricing permission');
    }
    if (body.accountManagerId && body.accountManagerId !== user.id && !hasPermission(user, PERMISSIONS.PLATFORM_TENANTS_ASSIGN)) {
      throw new ForbiddenError('Assigning another employee as account manager needs the assign permission');
    }

    const tenant = await tenantService.create({ ...body, createdBy: user.id });
    await activityService.log(req, {
      event: 'tenant.created', entity: 'tenant', entityId: tenant.id, tenantId: tenant.id,
      summary: `${who(req)} created tenant "${tenant.name}"`,
      details: {
        accountManagerId: tenant.accountManagerId, ratePerBed: body.ratePerBed ?? null,
        trialDays: body.trialDays ?? null, features: body.features ?? 'platform defaults',
      },
    });
    successResponse(res, tenant, 'Tenant created successfully', 201);
  } catch (error) { next(error); }
};

export const getTenants = async (req, res, next) => {
  try {
    const { tenants, pagination } = await tenantService.findAll(req.query, req.user);
    paginatedResponse(res, tenants, pagination);
  } catch (error) { next(error); }
};

export const getTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.findByIdWithBilling(req.params.id);
    successResponse(res, tenant);
  } catch (error) { next(error); }
};

export const updateTenant = async (req, res, next) => {
  try {
    // Tenant settings hold payment details (UPI, Razorpay keys), so only billing staff may touch them.
    if (req.body.settings !== undefined && !hasPermission(req.user, PERMISSIONS.PLATFORM_BILLING_MANAGE)) {
      throw new ForbiddenError('Changing tenant settings needs the billing permission');
    }
    const tenant = await tenantService.update(req.params.id, req.body);
    await activityService.log(req, {
      event: 'tenant.updated', entity: 'tenant', entityId: tenant.id, tenantId: tenant.id,
      summary: `${who(req)} updated tenant "${tenant.name}" (${Object.keys(req.body).filter((k) => k !== 'settings').join(', ') || 'settings'})`,
      details: { fields: Object.keys(req.body) },
    });
    successResponse(res, tenant, 'Tenant updated');
  } catch (error) { next(error); }
};

export const suspendTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.suspend(req.params.id);
    await activityService.log(req, {
      event: 'tenant.suspended', entity: 'tenant', entityId: tenant.id, tenantId: tenant.id,
      summary: `${who(req)} suspended tenant "${tenant.name}"`,
    });
    successResponse(res, tenant, 'Tenant suspended');
  } catch (error) { next(error); }
};

export const activateTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.activate(req.params.id);
    await activityService.log(req, {
      event: 'tenant.activated', entity: 'tenant', entityId: tenant.id, tenantId: tenant.id,
      summary: `${who(req)} activated tenant "${tenant.name}"`,
    });
    successResponse(res, tenant, 'Tenant activated');
  } catch (error) { next(error); }
};

export const deleteTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.findById(req.params.id);
    await tenantService.softDelete(req.params.id);
    await activityService.log(req, {
      event: 'tenant.deleted', entity: 'tenant', entityId: tenant.id, tenantId: tenant.id,
      summary: `${who(req)} deleted tenant "${tenant.name}"`,
    });
    successResponse(res, null, 'Tenant deleted');
  } catch (error) { next(error); }
};

export const getPlatformAnalytics = async (req, res, next) => {
  try {
    const analytics = await tenantService.getAnalytics();
    successResponse(res, analytics);
  } catch (error) { next(error); }
};

// ─── account manager (who maintains the tenant) ───────────────────

export const assignAccountManager = async (req, res, next) => {
  try {
    const { accountManagerId, reason } = req.body;
    const result = await tenantService.assignAccountManager(req.params.id, accountManagerId, { reason }, req.user.id);
    await activityService.log(req, {
      event: 'tenant.account_manager_changed', entity: 'tenant', entityId: req.params.id, tenantId: req.params.id,
      summary: `${who(req)} changed the account manager of "${result.tenantName}" from ${result.from?.name || 'nobody'} to ${result.to?.name || 'nobody'}`,
      details: { from: result.from?.id ?? null, to: result.to?.id ?? null, reason: reason ?? null },
    });
    successResponse(res, result, 'Account manager updated');
  } catch (error) { next(error); }
};

export const bulkAssign = async (req, res, next) => {
  try {
    const { tenantIds, accountManagerId, reason } = req.body;
    const result = await tenantService.bulkAssign(tenantIds, accountManagerId, { reason }, req.user.id);
    await activityService.log(req, {
      event: 'tenant.account_manager_changed', entity: 'tenant', entityId: null,
      summary: `${who(req)} assigned ${result.changed} tenant(s) to a new account manager in bulk`,
      details: { tenantIds: result.tenants.map((t) => t.id), to: accountManagerId, reason: reason ?? null },
    });
    successResponse(res, result, `${result.changed} tenant(s) reassigned`);
  } catch (error) { next(error); }
};

export const getAssignmentHistory = async (req, res, next) => {
  try {
    successResponse(res, await tenantService.getAssignmentHistory(req.params.id));
  } catch (error) { next(error); }
};
