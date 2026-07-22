import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePlatform } from '../middleware/authorize.js';
import { requireTenant } from '../middleware/authorize.js';
import { tenantIsolation } from '../middleware/tenant.js';
import { uploadSingle } from '../middleware/upload.js';
import subscriptionService from '../services/subscription.service.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { successResponse } from '../utils/response.js';
import config from '../config/index.js';

const router = Router();

// ─── PUBLIC ────────────────────────────────────────────────────

// Get all plans (public - for pricing page)
router.get('/plans', (_req, res) => {
  successResponse(res, subscriptionService.getAllPlans(), 'Plans retrieved');
});

// Get payment config (UPI ID, QR URL)
router.get('/payment-config', (_req, res) => {
  successResponse(res, { qrUrl: config.payment.qrUrl, upiId: config.payment.upiId });
});

// ─── PLATFORM ADMIN ────────────────────────────────────────────

// Generate invoice for a tenant
router.post('/admin/invoices/:tenantId', authenticate, requirePlatform, async (req, res, next) => {
  try {
    const invoice = await subscriptionService.generateInvoice(req.params.tenantId, req.user.id);
    successResponse(res, invoice, 'Invoice generated', 201);
  } catch (error) { next(error); }
});

// Get all invoices for a tenant
router.get('/admin/invoices/:tenantId', authenticate, requirePlatform, async (req, res, next) => {
  try {
    const invoices = await subscriptionService.getInvoices(req.params.tenantId);
    successResponse(res, invoices);
  } catch (error) { next(error); }
});

// Confirm payment
router.post('/admin/invoices/:invoiceId/confirm', authenticate, requirePlatform, async (req, res, next) => {
  try {
    const result = await subscriptionService.confirmPayment(req.params.invoiceId, req.user.id);
    successResponse(res, result);
  } catch (error) { next(error); }
});

// Reject payment
router.post('/admin/invoices/:invoiceId/reject', authenticate, requirePlatform, async (req, res, next) => {
  try {
    const result = await subscriptionService.rejectPayment(req.params.invoiceId, req.body.reason);
    successResponse(res, result);
  } catch (error) { next(error); }
});

// Hold tenant
router.post('/admin/:tenantId/hold', authenticate, requirePlatform, async (req, res, next) => {
  try {
    const result = await subscriptionService.holdTenant(req.params.tenantId);
    successResponse(res, result);
  } catch (error) { next(error); }
});

// Dismiss tenant
router.post('/admin/:tenantId/dismiss', authenticate, requirePlatform, async (req, res, next) => {
  try {
    const result = await subscriptionService.dismissTenant(req.params.tenantId);
    successResponse(res, result);
  } catch (error) { next(error); }
});

// Subscription analytics
router.get('/admin/analytics', authenticate, requirePlatform, async (req, res, next) => {
  try {
    const analytics = await subscriptionService.getSubscriptionAnalytics();
    successResponse(res, analytics);
  } catch (error) { next(error); }
});

// ─── TENANT ────────────────────────────────────────────────────

// Get my subscription info
router.get('/my', authenticate, requireTenant, tenantIsolation, async (req, res, next) => {
  try {
    const data = await subscriptionService.getMySubscription(req.tenantId);
    successResponse(res, data);
  } catch (error) { next(error); }
});

// Submit payment proof
router.post('/my/pay/:invoiceId', authenticate, requireTenant, tenantIsolation, uploadSingle('proof'), async (req, res, next) => {
  try {
    let paymentProofUrl = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: `ezehub/${req.tenantId}/payments` });
      paymentProofUrl = result.secure_url;
    }
    const invoice = await subscriptionService.submitPaymentProof(req.tenantId, req.params.invoiceId, {
      paymentMethod: req.body.paymentMethod || 'UPI',
      transactionId: req.body.transactionId,
      paymentProofUrl,
      notes: req.body.notes,
    });
    successResponse(res, invoice, 'Payment proof submitted');
  } catch (error) { next(error); }
});

// Get my invoices
router.get('/my/invoices', authenticate, requireTenant, tenantIsolation, async (req, res, next) => {
  try {
    const invoices = await subscriptionService.getInvoices(req.tenantId);
    successResponse(res, invoices);
  } catch (error) { next(error); }
});

export default router;
