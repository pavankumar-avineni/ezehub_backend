import { Router } from 'express';
import authRoutes from './auth.routes.js';
import platformRoutes from './platform.routes.js';
import tenantRoutes from './tenant.routes.js';
import residentRoutes from './resident.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'EzeHub API is running', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/platform/tenants', platformRoutes);
router.use('/tenant', tenantRoutes);
router.use('/resident', residentRoutes);

export default router;
