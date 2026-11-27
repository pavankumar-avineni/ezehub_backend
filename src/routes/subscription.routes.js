import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requirePlatform, requireTenant } from '../middleware/authorize.js';
import { tenantIsolation } from '../middleware/tenant.js';
import {
  requireTenantAccess, requireInvoiceAccess, requireViewAllTenants, canViewAllTenants, tenantScopeWhere,
} from '../middleware/platformAccess.js';
import { uploadSingle } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../constants/index.js';
import {
  updateBillingSettingsSchema, tenantIdParamSchema, setTenantRateSchema, setTenantTrialSchema,
  updateCatalogFeatureSchema, setTenantFeaturesSchema, tenantFeatureActionSchema,
  setTenantFeaturePriceSchema, featureHistoryQuerySchema,
} from '../validators/index.js';
import subscriptionService from '../services/subscription.service.js';
import billingService from '../services/billing.service.js';
import featureService from '../services/feature.service.js';
import activityService from '../services/activity.service.js';
import prisma from '../config/database.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { successResponse, paginatedResponse } from '../utils/response.js';
import { ForbiddenError, NotFoundError } from '../utils/errors.js';
import config from '../config/index.js';

const router = Router();

const who = (req) => `${req.user.firstName} ${req.user.lastName}`.trim();
const tenantName = async (id) => (await prisma.tenant.findUnique({ where: { id }, select: { name: true } }))?.name ?? id;
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };

// ─── PUBLIC ────────────────────────────────────────────────────

// Feature catalog with default prices (public - for the pricing page)
router.get('/features', handle(async (_req, res) => {
  successResponse(res, await featureService.getPublicCatalog(), 'Features retrieved');
}));

// Per-bed pricing + free trial length (public - for pricing page / sign-up screen)
router.get('/pricing', handle(async (_req, res) => {
  successResponse(res, await subscriptionService.getPricing(), 'Pricing retrieved');
}));

// Get payment config (UPI ID, QR URL)
router.get('/payment-config', (_req, res) => {
  successResponse(res, { qrUrl: config.payment.qrUrl, upiId: config.payment.upiId });
});

// ─── PLATFORM ADMIN ────────────────────────────────────────────
//
// Every route needs a platform permission. Routes about one tenant also check that the employee
// may open that tenant (created it, maintains it, or has "View all tenants").

const BILLING_READ = authorize(PERMISSIONS.PLATFORM_BILLING_READ);
const BILLING_MANAGE = authorize(PERMISSIONS.PLATFORM_BILLING_MANAGE);
const PRICING_MANAGE = authorize(PERMISSIONS.PLATFORM_PRICING_MANAGE);
const tenantAccess = requireTenantAccess('tenantId');

// ── Invoices ──
router.post('/admin/invoices/:tenantId', authenticate, requirePlatform, BILLING_MANAGE, validate(tenantIdParamSchema), tenantAccess, handle(async (req, res) => {
  const invoice = await subscriptionService.generateInvoice(req.params.tenantId, req.user.id);
  await activityService.log(req, {
    event: 'invoice.generated', entity: 'invoice', entityId: invoice.id, tenantId: invoice.tenantId,
    summary: `${who(req)} generated invoice ${invoice.invoiceNumber} of ₹${Number(invoice.total)} for "${invoice.tenant.name}"`,
    details: { invoiceNumber: invoice.invoiceNumber, bedCount: invoice.bedCount, total: Number(invoice.total) },
  });
  successResponse(res, invoice, 'Invoice generated', 201);
}));

router.get('/admin/invoices/:tenantId', authenticate, requirePlatform, BILLING_READ, validate(tenantIdParamSchema), tenantAccess, handle(async (req, res) => {
  successResponse(res, await subscriptionService.getInvoices(req.params.tenantId));
}));

router.post('/admin/invoices/:invoiceId/confirm', authenticate, requirePlatform, BILLING_MANAGE, requireInvoiceAccess('invoiceId'), handle(async (req, res) => {
  const invoice = await prisma.billingInvoice.findUnique({ where: { id: req.params.invoiceId }, select: { invoiceNumber: true, tenantId: true, total: true } });
  if (!invoice) throw new NotFoundError('Invoice');
  const result = await subscriptionService.confirmPayment(req.params.invoiceId, req.user.id);
  await activityService.log(req, {
    event: 'invoice.confirmed', entity: 'invoice', entityId: req.params.invoiceId, tenantId: invoice.tenantId,
    summary: `${who(req)} confirmed the payment of invoice ${invoice.invoiceNumber} (₹${Number(invoice.total)}) for "${await tenantName(invoice.tenantId)}"`,
  });
  successResponse(res, result);
}));

router.post('/admin/invoices/:invoiceId/reject', authenticate, requirePlatform, BILLING_MANAGE, requireInvoiceAccess('invoiceId'), handle(async (req, res) => {
  const invoice = await prisma.billingInvoice.findUnique({ where: { id: req.params.invoiceId }, select: { invoiceNumber: true, tenantId: true } });
  if (!invoice) throw new NotFoundError('Invoice');
  const result = await subscriptionService.rejectPayment(req.params.invoiceId, req.body.reason);
  await activityService.log(req, {
    event: 'invoice.rejected', entity: 'invoice', entityId: req.params.invoiceId, tenantId: invoice.tenantId,
    summary: `${who(req)} rejected the payment proof of invoice ${invoice.invoiceNumber} for "${await tenantName(invoice.tenantId)}"`,
    details: { reason: req.body.reason ?? null },
  });
  successResponse(res, result);
}));

// ── Tenant status from the billing side ──
router.post('/admin/:tenantId/hold', authenticate, requirePlatform, BILLING_MANAGE, validate(tenantIdParamSchema), tenantAccess, handle(async (req, res) => {
  const result = await subscriptionService.holdTenant(req.params.tenantId);
  await activityService.log(req, {
    event: 'tenant.on_hold', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} put "${await tenantName(req.params.tenantId)}" on hold`,
  });
  successResponse(res, result);
}));

router.post('/admin/:tenantId/dismiss', authenticate, requirePlatform, authorize(PERMISSIONS.TENANTS_DELETE), validate(tenantIdParamSchema), tenantAccess, handle(async (req, res) => {
  const result = await subscriptionService.dismissTenant(req.params.tenantId);
  await activityService.log(req, {
    event: 'tenant.dismissed', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} dismissed "${await tenantName(req.params.tenantId)}" permanently`,
  });
  successResponse(res, result);
}));

// ── Feature catalog ──
router.get('/admin/features', authenticate, requirePlatform, BILLING_READ, handle(async (_req, res) => {
  successResponse(res, await featureService.getCatalog());
}));

router.get('/admin/features/history', authenticate, requirePlatform, BILLING_READ, validate(featureHistoryQuerySchema), handle(async (req, res) => {
  // Without "View all tenants" the history must be limited to one tenant the employee may open.
  if (!canViewAllTenants(req.user)) {
    if (!req.query.tenantId || req.query.scope === 'catalog') throw new ForbiddenError('This needs the "View all tenants" permission, or a tenantId you own');
    const own = await prisma.tenant.findFirst({ where: { id: req.query.tenantId, deletedAt: null, ...tenantScopeWhere(req.user) }, select: { id: true } });
    if (!own) throw new NotFoundError('Tenant');
  }
  const { history, pagination } = await featureService.getHistory(req.query);
  paginatedResponse(res, history, pagination);
}));

router.put('/admin/features/:code', authenticate, requirePlatform, PRICING_MANAGE, validate(updateCatalogFeatureSchema), handle(async (req, res) => {
  const feature = await featureService.updateCatalogFeature(req.params.code, req.body, req.user.id);
  await activityService.log(req, {
    event: 'feature.catalog_updated', entity: 'feature', entityId: req.params.code,
    summary: `${who(req)} updated the feature "${feature.name}" in the catalog (${Object.keys(req.body).filter((k) => k !== 'reason').join(', ')})`,
    details: { ...req.body, customPricesCleared: feature.customPricesCleared },
  });
  successResponse(res, feature, 'Feature updated');
}));

// ── Features of one tenant ──
router.get('/admin/:tenantId/features', authenticate, requirePlatform, BILLING_READ, validate(tenantIdParamSchema), tenantAccess, handle(async (req, res) => {
  const beds = await billingService.countBillableBeds(req.params.tenantId);
  successResponse(res, { billableBeds: beds, ...(await featureService.getTenantFeatures(req.params.tenantId, { beds })) });
}));

router.put('/admin/:tenantId/features', authenticate, requirePlatform, PRICING_MANAGE, validate(setTenantFeaturesSchema), tenantAccess, handle(async (req, res) => {
  const { features, reason } = req.body;
  const result = await featureService.setTenantFeatures(req.params.tenantId, features, { reason }, req.user.id);
  await activityService.log(req, {
    event: 'feature.tenant_features_set', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} set the features of "${await tenantName(req.params.tenantId)}" (+${result.enabled.length} / -${result.disabled.length})`,
    details: { enabled: result.enabled, disabled: result.disabled, reason: reason ?? null },
  });
  successResponse(res, result, 'Tenant features updated');
}));

router.post('/admin/:tenantId/features/:code/enable', authenticate, requirePlatform, PRICING_MANAGE, validate(tenantFeatureActionSchema), tenantAccess, handle(async (req, res) => {
  const result = await featureService.enableFeature(req.params.tenantId, req.params.code, req.body, req.user.id);
  await activityService.log(req, {
    event: 'feature.enabled', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} enabled ${req.params.code} for "${await tenantName(req.params.tenantId)}"`,
    details: { feature: req.params.code, reason: req.body.reason ?? null },
  });
  successResponse(res, result, 'Feature enabled');
}));

router.post('/admin/:tenantId/features/:code/disable', authenticate, requirePlatform, PRICING_MANAGE, validate(tenantFeatureActionSchema), tenantAccess, handle(async (req, res) => {
  const result = await featureService.disableFeature(req.params.tenantId, req.params.code, req.body, req.user.id);
  await activityService.log(req, {
    event: 'feature.disabled', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} disabled ${req.params.code} for "${await tenantName(req.params.tenantId)}"`,
    details: { feature: req.params.code, reason: req.body.reason ?? null },
  });
  successResponse(res, result, 'Feature disabled');
}));

router.put('/admin/:tenantId/features/:code/price', authenticate, requirePlatform, PRICING_MANAGE, validate(setTenantFeaturePriceSchema), tenantAccess, handle(async (req, res) => {
  const result = await featureService.setTenantFeaturePrice(req.params.tenantId, req.params.code, req.body, req.user.id);
  await activityService.log(req, {
    event: 'feature.price_changed', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} ${req.body.useCatalogPrice ? 'reset' : 'set'} the price of ${req.params.code} for "${await tenantName(req.params.tenantId)}"${req.body.price !== undefined ? ` to ₹${req.body.price}` : ''}`,
    details: { feature: req.params.code, price: req.body.price ?? null, useCatalogPrice: Boolean(req.body.useCatalogPrice), reason: req.body.reason ?? null },
  });
  successResponse(res, result, 'Tenant feature price updated');
}));

// ── Platform billing settings (default rate per bed, free-trial days, tax %, default features) ──
router.get('/admin/settings', authenticate, requirePlatform, BILLING_READ, handle(async (_req, res) => {
  successResponse(res, await billingService.getSettings());
}));

router.put('/admin/settings', authenticate, requirePlatform, PRICING_MANAGE, validate(updateBillingSettingsSchema), handle(async (req, res) => {
  const result = await billingService.updateSettings(req.body, req.user.id);
  await activityService.log(req, {
    event: 'billing.settings_updated', entity: 'settings', entityId: 'billing',
    summary: `${who(req)} changed the billing settings (${Object.keys(req.body).filter((k) => k !== 'applyToExistingTenants').join(', ')})`,
    details: { ...req.body, tenantsRepriced: result.tenantsRepriced },
  });
  successResponse(res, result, 'Billing settings updated');
}));

// ── One tenant's pricing: rate, beds, estimate, trial, rate history ──
router.get('/admin/:tenantId/pricing', authenticate, requirePlatform, BILLING_READ, validate(tenantIdParamSchema), tenantAccess, handle(async (req, res) => {
  successResponse(res, await billingService.getTenantPricing(req.params.tenantId));
}));

router.put('/admin/:tenantId/rate', authenticate, requirePlatform, PRICING_MANAGE, validate(setTenantRateSchema), tenantAccess, handle(async (req, res) => {
  const result = await billingService.setTenantRate(req.params.tenantId, req.body, req.user.id);
  await activityService.log(req, {
    event: 'billing.rate_changed', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} ${req.body.useDefault ? 'reset the rate to the platform default' : `set the rate to ₹${req.body.ratePerBed} per bed`} for "${result.tenant.name}"`,
    details: { ratePerBed: req.body.ratePerBed ?? null, useDefault: Boolean(req.body.useDefault), reason: req.body.reason ?? null },
  });
  successResponse(res, result, 'Tenant rate updated');
}));

router.put('/admin/:tenantId/trial', authenticate, requirePlatform, PRICING_MANAGE, validate(setTenantTrialSchema), tenantAccess, handle(async (req, res) => {
  const result = await billingService.setTenantTrial(req.params.tenantId, req.body);
  await activityService.log(req, {
    event: 'billing.trial_changed', entity: 'tenant', entityId: req.params.tenantId, tenantId: req.params.tenantId,
    summary: `${who(req)} changed the free trial of "${result.tenant.name}" (${req.body.extendDays ? `+${req.body.extendDays} days` : `ends ${req.body.trialEndsAt}`})`,
    details: req.body,
  });
  successResponse(res, result, 'Tenant trial updated');
}));

// ── Subscription analytics (platform-wide) ──
router.get('/admin/analytics', authenticate, requirePlatform, authorize(PERMISSIONS.PLATFORM_ANALYTICS), requireViewAllTenants, handle(async (_req, res) => {
  successResponse(res, await subscriptionService.getSubscriptionAnalytics());
}));

// ─── TENANT ────────────────────────────────────────────────────

// Get my subscription info
router.get('/my', authenticate, requireTenant, tenantIsolation, handle(async (req, res) => {
  successResponse(res, await subscriptionService.getMySubscription(req.tenantId));
}));

// Which features I have, which are locked, and what each costs me
router.get('/my/features', authenticate, requireTenant, tenantIsolation, handle(async (req, res) => {
  const beds = await billingService.countBillableBeds(req.tenantId);
  const { history: _history, ...view } = await featureService.getTenantFeatures(req.tenantId, { beds, historyLimit: 0 });
  successResponse(res, { billableBeds: beds, ...view });
}));

// Submit payment proof
router.post('/my/pay/:invoiceId', authenticate, requireTenant, tenantIsolation, uploadSingle('proof'), handle(async (req, res) => {
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
}));

// Get my invoices
router.get('/my/invoices', authenticate, requireTenant, tenantIsolation, handle(async (req, res) => {
  successResponse(res, await subscriptionService.getInvoices(req.tenantId));
}));

export default router;
