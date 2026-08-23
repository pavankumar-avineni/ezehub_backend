import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requireTenant } from '../middleware/authorize.js';
import { tenantIsolation } from '../middleware/tenant.js';
import razorpayService from '../services/razorpay.service.js';
import { successResponse } from '../utils/response.js';

const router = Router();

// ─── TENANT SUBSCRIPTION PAYMENTS (Tenant → Platform) ────────────

// Create order for subscription invoice payment
router.post('/subscription/create-order', authenticate, requireTenant, tenantIsolation, async (req, res, next) => {
  try {
    const order = await razorpayService.createSubscriptionOrder(req.tenantId, req.body.invoiceId);
    successResponse(res, order, 'Order created');
  } catch (error) { next(error); }
});

// Verify subscription payment
router.post('/subscription/verify', authenticate, requireTenant, tenantIsolation, async (req, res, next) => {
  try {
    const result = await razorpayService.verifySubscriptionPayment(req.tenantId, req.body);
    successResponse(res, result);
  } catch (error) { next(error); }
});

// ─── RESIDENT RENT PAYMENTS (Resident → Tenant) ──────────────────

// Create order for rent payment
router.post('/rent/create-order', authenticate, async (req, res, next) => {
  try {
    if (req.user.scope !== 'RESIDENT') return res.status(403).json({ success: false, message: 'Resident only' });
    const order = await razorpayService.createRentOrder(req.user.tenantId, req.user.userId, req.body.chargeId);
    successResponse(res, order, 'Order created');
  } catch (error) { next(error); }
});

// Verify rent payment
router.post('/rent/verify', authenticate, async (req, res, next) => {
  try {
    if (req.user.scope !== 'RESIDENT') return res.status(403).json({ success: false, message: 'Resident only' });
    const result = await razorpayService.verifyRentPayment(req.user.tenantId, req.user.userId, req.body);
    successResponse(res, result);
  } catch (error) { next(error); }
});

// Get tenant's Razorpay Key ID (public key only — for checkout)
router.get('/rent/key', authenticate, async (req, res, next) => {
  try {
    if (req.user.scope !== 'RESIDENT') return res.status(403).json({ success: false, message: 'Resident only' });
    const { keyId } = await razorpayService.getTenantInstance(req.user.tenantId);
    successResponse(res, { keyId });
  } catch (error) { next(error); }
});

export default router;
