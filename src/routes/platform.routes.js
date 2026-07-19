import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requirePlatform } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../constants/index.js';
import { createTenantSchema, updateTenantSchema, idParamSchema, paginationSchema } from '../validators/index.js';
import * as tenantController from '../controllers/tenant.controller.js';

const router = Router();

router.use(authenticate, requirePlatform);

router.get('/analytics', authorize(PERMISSIONS.PLATFORM_ANALYTICS), tenantController.getPlatformAnalytics);
router.get('/', authorize(PERMISSIONS.TENANTS_READ), validate(paginationSchema), tenantController.getTenants);
router.post('/', authorize(PERMISSIONS.TENANTS_CREATE), validate(createTenantSchema), tenantController.createTenant);
router.get('/:id', authorize(PERMISSIONS.TENANTS_READ), validate(idParamSchema), tenantController.getTenant);
router.put('/:id', authorize(PERMISSIONS.TENANTS_UPDATE), validate(updateTenantSchema), tenantController.updateTenant);
router.post('/:id/suspend', authorize(PERMISSIONS.TENANTS_SUSPEND), validate(idParamSchema), tenantController.suspendTenant);
router.post('/:id/activate', authorize(PERMISSIONS.TENANTS_ACTIVATE), validate(idParamSchema), tenantController.activateTenant);
router.delete('/:id', authorize(PERMISSIONS.TENANTS_DELETE), validate(idParamSchema), tenantController.deleteTenant);

export default router;
