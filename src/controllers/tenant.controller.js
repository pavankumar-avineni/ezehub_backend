import tenantService from '../services/tenant.service.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

export const createTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.create(req.body);
    successResponse(res, tenant, 'Tenant created successfully', 201);
  } catch (error) { next(error); }
};

export const getTenants = async (req, res, next) => {
  try {
    const { tenants, pagination } = await tenantService.findAll(req.query);
    paginatedResponse(res, tenants, pagination);
  } catch (error) { next(error); }
};

export const getTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.findById(req.params.id);
    successResponse(res, tenant);
  } catch (error) { next(error); }
};

export const updateTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.update(req.params.id, req.body);
    successResponse(res, tenant, 'Tenant updated');
  } catch (error) { next(error); }
};

export const suspendTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.suspend(req.params.id);
    successResponse(res, tenant, 'Tenant suspended');
  } catch (error) { next(error); }
};

export const activateTenant = async (req, res, next) => {
  try {
    const tenant = await tenantService.activate(req.params.id);
    successResponse(res, tenant, 'Tenant activated');
  } catch (error) { next(error); }
};

export const deleteTenant = async (req, res, next) => {
  try {
    await tenantService.softDelete(req.params.id);
    successResponse(res, null, 'Tenant deleted');
  } catch (error) { next(error); }
};

export const getPlatformAnalytics = async (req, res, next) => {
  try {
    const analytics = await tenantService.getAnalytics();
    successResponse(res, analytics);
  } catch (error) { next(error); }
};
