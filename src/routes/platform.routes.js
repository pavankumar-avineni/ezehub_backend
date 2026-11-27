import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requirePlatform } from '../middleware/authorize.js';
import { requireTenantAccess, requireViewAllTenants } from '../middleware/platformAccess.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../constants/index.js';
import {
  createTenantSchema, updateTenantSchema, idParamSchema, listPlatformTenantsSchema,
  assignAccountManagerSchema, bulkAssignTenantsSchema,
} from '../validators/index.js';
import * as tenantController from '../controllers/tenant.controller.js';

const router = Router();

router.use(authenticate, requirePlatform);

// Tenant rules for platform employees:
//  - every route needs its permission;
//  - without "View all tenants" an employee only reaches tenants they created or maintain (others answer 404).
router.get('/analytics', authorize(PERMISSIONS.PLATFORM_ANALYTICS), requireViewAllTenants, tenantController.getPlatformAnalytics);
router.get('/', authorize(PERMISSIONS.TENANTS_READ), validate(listPlatformTenantsSchema), tenantController.getTenants);
router.post('/', authorize(PERMISSIONS.TENANTS_CREATE), validate(createTenantSchema), tenantController.createTenant);
router.post('/bulk-assign', authorize(PERMISSIONS.PLATFORM_TENANTS_ASSIGN), requireViewAllTenants, validate(bulkAssignTenantsSchema), tenantController.bulkAssign);
router.get('/:id', authorize(PERMISSIONS.TENANTS_READ), validate(idParamSchema), requireTenantAccess('id'), tenantController.getTenant);
router.put('/:id', authorize(PERMISSIONS.TENANTS_UPDATE), validate(updateTenantSchema), requireTenantAccess('id'), tenantController.updateTenant);
router.put('/:id/account-manager', authorize(PERMISSIONS.PLATFORM_TENANTS_ASSIGN), validate(assignAccountManagerSchema), requireTenantAccess('id'), tenantController.assignAccountManager);
router.get('/:id/assignment-history', authorize(PERMISSIONS.TENANTS_READ), validate(idParamSchema), requireTenantAccess('id'), tenantController.getAssignmentHistory);
router.post('/:id/suspend', authorize(PERMISSIONS.TENANTS_SUSPEND), validate(idParamSchema), requireTenantAccess('id'), tenantController.suspendTenant);
router.post('/:id/activate', authorize(PERMISSIONS.TENANTS_ACTIVATE), validate(idParamSchema), requireTenantAccess('id'), tenantController.activateTenant);
router.delete('/:id', authorize(PERMISSIONS.TENANTS_DELETE), validate(idParamSchema), requireTenantAccess('id'), tenantController.deleteTenant);

export default router;
