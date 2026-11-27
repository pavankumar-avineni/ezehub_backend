import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { requirePlatform, requireRole } from '../middleware/authorize.js';
import { requireTenant } from '../middleware/authorize.js';
import { tenantIsolation } from '../middleware/tenant.js';
import { uploadSingle } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { PLATFORM_ROLES } from '../constants/index.js';
import {
  updateBillingSettingsSchema, tenantIdParamSchema, setTenantRateSchema, setTenantTrialSchema,
  updateCatalogFeatureSchema, setTenantFeaturesSchema, tenantFeatureActionSchema,
  setTenantFeaturePriceSchema, featureHistoryQuerySchema,
} from '../validators/index.js';
import subscriptionService from '../services/subscription.service.js';
import billingService from '../services/billing.service.js';
import featureService from '../services/feature.service.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { successResponse, paginatedResponse } from '../utils/response.js';
import config from '../config/index.js';

const router = Router();

// ─── PUBLIC ────────────────────────────────────────────────────

// Feature catalog with default prices (public - for the pricing page)
router.get('/features', async (_req, res, next) => {
  try {
    successResponse(res, await featureService.getPublicCatalog(), 'Features retrieved');
  } catch (error) { next(error); }
});

// Per-bed pricing + free trial length (public - for pricing page / sign-up screen)
router.get('/pricing', async (_req, res, next) => {
  try {
    successResponse(res, await subscriptionService.getPricing(), 'Pricing retrieved');
  } catch (error) { next(error); }
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

// ─── Pricing controls: platform super admin only ───────────────

const superAdminOnly = requireRole(PLATFORM_ROLES.SUPER_ADMIN);

// ── Feature catalog ──
router.get('/admin/features', authenticate, requirePlatform, async (_req, res, next) => {
  try {
    successResponse(res, await featureService.getCatalog());
  } catch (error) { next(error); }
});

router.get('/admin/features/history', authenticate, requirePlatform, validate(featureHistoryQuerySchema), async (req, res, next) => {
  try {
    const { history, pagination } = await featureService.getHistory(req.query);
    paginatedResponse(res, history, pagination);
  } catch (error) { next(error); }
});

router.put('/admin/features/:code', authenticate, requirePlatform, superAdminOnly, validate(updateCatalogFeatureSchema), async (req, res, next) => {
  try {
    successResponse(res, await featureService.updateCatalogFeature(req.params.code, req.body, req.user.id), 'Feature updated');
  } catch (error) { next(error); }
});

// ── Features of one tenant ──
router.get('/admin/:tenantId/features', authenticate, requirePlatform, validate(tenantIdParamSchema), async (req, res, next) => {
  try {
    const beds = await billingService.countBillableBeds(req.params.tenantId);
    successResponse(res, { billableBeds: beds, ...(await featureService.getTenantFeatures(req.params.tenantId, { beds })) });
  } catch (error) { next(error); }
});

router.put('/admin/:tenantId/features', authenticate, requirePlatform, superAdminOnly, validate(setTenantFeaturesSchema), async (req, res, next) => {
  try {
    const { features, reason } = req.body;
    successResponse(res, await featureService.setTenantFeatures(req.params.tenantId, features, { reason }, req.user.id), 'Tenant features updated');
  } catch (error) { next(error); }
});

router.post('/admin/:tenantId/features/:code/enable', authenticate, requirePlatform, superAdminOnly, validate(tenantFeatureActionSchema), async (req, res, next) => {
  try {
    successResponse(res, await featureService.enableFeature(req.params.tenantId, req.params.code, req.body, req.user.id), 'Feature enabled');
  } catch (error) { next(error); }
});

router.post('/admin/:tenantId/features/:code/disable', authenticate, requirePlatform, superAdminOnly, validate(tenantFeatureActionSchema), async (req, res, next) => {
  try {
    successResponse(res, await featureService.disableFeature(req.params.tenantId, req.params.code, req.body, req.user.id), 'Feature disabled');
  } catch (error) { next(error); }
});

router.put('/admin/:tenantId/features/:code/price', authenticate, requirePlatform, superAdminOnly, validate(setTenantFeaturePriceSchema), async (req, res, next) => {
  try {
    successResponse(res, await featureService.setTenantFeaturePrice(req.params.tenantId, req.params.code, req.body, req.user.id), 'Tenant feature price updated');
  } catch (error) { next(error); }
});

// Platform billing settings (default rate per bed, free-trial days, tax %, default features)
router.get('/admin/settings', authenticate, requirePlatform, async (_req, res, next) => {
  try {
    successResponse(res, await billingService.getSettings());
  } catch (error) { next(error); }
});

router.put('/admin/settings', authenticate, requirePlatform, superAdminOnly, validate(updateBillingSettingsSchema), async (req, res, next) => {
  try {
    successResponse(res, await billingService.updateSettings(req.body, req.user.id), 'Billing settings updated');
  } catch (error) { next(error); }
});

// One tenant's pricing: rate, beds, estimate, trial, rate history
router.get('/admin/:tenantId/pricing', authenticate, requirePlatform, validate(tenantIdParamSchema), async (req, res, next) => {
  try {
    successResponse(res, await billingService.getTenantPricing(req.params.tenantId));
  } catch (error) { next(error); }
});

// Set a custom per-bed rate for a tenant (or send useDefault to go back to the default)
router.put('/admin/:tenantId/rate', authenticate, requirePlatform, superAdminOnly, validate(setTenantRateSchema), async (req, res, next) => {
  try {
    successResponse(res, await billingService.setTenantRate(req.params.tenantId, req.body, req.user.id), 'Tenant rate updated');
  } catch (error) { next(error); }
});

// Change when a tenant's free trial ends
router.put('/admin/:tenantId/trial', authenticate, requirePlatform, superAdminOnly, validate(setTenantTrialSchema), async (req, res, next) => {
  try {
    successResponse(res, await billingService.setTenantTrial(req.params.tenantId, req.body), 'Tenant trial updated');
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

// Which features I have, which are locked, and what each costs me
router.get('/my/features', authenticate, requireTenant, tenantIsolation, async (req, res, next) => {
  try {
    const beds = await billingService.countBillableBeds(req.tenantId);
    const { history, ...view } = await featureService.getTenantFeatures(req.tenantId, { beds, historyLimit: 0 });
    successResponse(res, { billableBeds: beds, ...view });
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
