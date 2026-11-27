import { Router } from 'express';
import authRoutes from './auth.routes.js';
import platformRoutes from './platform.routes.js';
import tenantRoutes from './tenant.routes.js';
import employeeRoutes from './employee.routes.js';
import platformAdminRoutes from './platformAdmin.routes.js';
import residentRoutes from './resident.routes.js';
import subscriptionRoutes from './subscription.routes.js';
import paymentRoutes from './payment.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'EzeHub API is running', timestamp: new Date().toISOString() });
});

// Single source of truth for mount points (also read by the Swagger sync).
export const ROUTE_MOUNTS = [
  ['/auth', authRoutes],
  ['/platform/tenants', platformRoutes],
  ['/platform/employees', employeeRoutes],
  ['/platform', platformAdminRoutes],
  ['/tenant', tenantRoutes],
  ['/resident', residentRoutes],
  ['/subscription', subscriptionRoutes],
  ['/payment', paymentRoutes],
];

ROUTE_MOUNTS.forEach(([path, subRouter]) => router.use(path, subRouter));

export default router;
