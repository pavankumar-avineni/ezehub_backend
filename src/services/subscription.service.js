import prisma from '../config/database.js';
import config from '../config/index.js';
import { NotFoundError, ForbiddenError, ValidationError, ConflictError } from '../utils/errors.js';
import { BILLING_DEFAULTS } from '../constants/index.js';
import billingService from './billing.service.js';
import featureService from './feature.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

class SubscriptionService {
  // Public pricing (for the pricing page / sign-up screen)
  async getPricing() {
    const settings = await billingService.getSettings();
    const rate = settings.defaultRatePerBed;
    return {
      model: 'PER_BED',
      ratePerBed: rate,
      currency: settings.currency,
      billingPeriodDays: settings.billingPeriodDays,
      trialDays: settings.trialDays,
      taxPercent: settings.taxPercent,
      priceFormatted: `₹${rate} per bed per month`,
      examples: [10, 50, 100].map((beds) => ({ beds, monthlyAmount: billingService.computeCharge(beds, rate, 0).amount })),
      // Core features are included in the per-bed rate. Add-ons are priced per bed or flat per month.
      features: await featureService.getPublicCatalog(),
    };
  }

  // Generate invoice for a tenant (Platform admin only)
  async generateInvoice(tenantId, createdBy) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: { subscription: true },
    });
    if (!tenant) throw new NotFoundError('Tenant');
    if (!tenant.subscription) throw new NotFoundError('Subscription');

    const sub = tenant.subscription;

    // Bill every bed that exists today, at this tenant's current rate and the current tax %.
    const [settings, beds, features] = await Promise.all([
      billingService.getSettings(),
      billingService.countBillableBeds(tenantId),
      featureService.getBillableFeatures(tenantId),
    ]);
    if (beds === 0) throw new ValidationError('This tenant has no beds yet, so there is nothing to bill');
    // Beds at the tenant's rate + one line per priced add-on feature, plus tax.
    const charge = billingService.computeInvoice(beds, sub.ratePerBed, settings.taxPercent, features);
    if (charge.total <= 0) throw new ValidationError('The invoice total would be 0 (the tenant rate is 0), so no invoice was created');

    // Billing period starts after the free trial / current paid period ends
    const billingStart = sub.endDate && sub.endDate > new Date() ? new Date(sub.endDate) : new Date();
    const billingEnd = new Date(billingStart.getTime() + BILLING_DEFAULTS.BILLING_PERIOD_DAYS * DAY_MS);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // 7 days to pay

    // Invoice numbers are unique across ALL tenants: INV-YYYYMMDD-XXXX, counted per day.
    // Two invoices created at the same moment can pick the same number, so retry on a clash.
    const dayPrefix = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-`;
    const data = {
      subscriptionId: sub.id,
      tenantId,
      bedCount: charge.beds,
      ratePerBed: charge.ratePerBed,
      taxPercent: charge.taxPercent,
      lineItems: charge.lines,
      amount: charge.amount,
      tax: charge.tax,
      total: charge.total,
      billingStart,
      billingEnd,
      dueDate,
      createdBy,
      status: 'PENDING',
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      // Continue after the highest number already used today (counting would reuse numbers after a delete).
      const last = await prisma.billingInvoice.findFirst({
        where: { invoiceNumber: { startsWith: dayPrefix } },
        orderBy: { invoiceNumber: 'desc' },
        select: { invoiceNumber: true },
      });
      const lastSeq = last ? parseInt(last.invoiceNumber.slice(dayPrefix.length), 10) || 0 : 0;
      const invoiceNumber = `${dayPrefix}${String(lastSeq + 1 + attempt).padStart(4, '0')}`;
      try {
        return await prisma.billingInvoice.create({
          data: { ...data, invoiceNumber },
          include: { tenant: { select: { name: true, email: true } } },
        });
      } catch (error) {
        const isNumberClash = error.code === 'P2002' && String(error.meta?.target).includes('invoice_number');
        if (!isNumberClash || attempt === 4) throw error;
      }
    }
    throw new ConflictError('Could not generate a unique invoice number. Please try again');
  }

  // Get all invoices for a tenant
  async getInvoices(tenantId) {
    return prisma.billingInvoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { tenant: { select: { name: true } } },
    });
  }

  // Get single invoice
  async getInvoice(invoiceId) {
    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { tenant: { select: { name: true, email: true, phone: true } }, subscription: true },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    return invoice;
  }

  // Tenant submits payment proof
  async submitPaymentProof(tenantId, invoiceId, data) {
    const invoice = await prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId, status: 'PENDING' },
    });
    if (!invoice) throw new NotFoundError('Pending invoice not found');

    return prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: {
        paymentMethod: data.paymentMethod || 'UPI',
        transactionId: data.transactionId,
        paymentProofUrl: data.paymentProofUrl,
        notes: data.notes,
        status: 'PARTIAL', // Mark as "proof submitted, awaiting confirmation"
      },
    });
  }

  // Platform admin confirms payment
  async confirmPayment(invoiceId, confirmedBy) {
    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
      include: { subscription: true },
    });
    if (!invoice) throw new NotFoundError('Invoice');
    if (invoice.status === 'PAID') throw new ForbiddenError('Invoice already paid');

    // Update invoice
    await prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: new Date(), confirmedBy },
    });

    // Extend subscription period
    await prisma.subscription.update({
      where: { id: invoice.subscriptionId },
      data: {
        status: 'ACTIVE',
        endDate: invoice.billingEnd,
      },
    });

    // Activate tenant if not already
    await prisma.tenant.update({
      where: { id: invoice.tenantId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });

    // Create notification for tenant
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId: invoice.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (tenantUser) {
      await prisma.notification.create({
        data: {
          tenantId: invoice.tenantId,
          userId: tenantUser.id,
          userType: 'TENANT',
          title: 'Payment Confirmed',
          message: `Your payment of ₹${invoice.total}${invoice.bedCount ? ` (${invoice.bedCount} beds × ₹${invoice.ratePerBed})` : ''} has been confirmed. Subscription active until ${invoice.billingEnd.toLocaleDateString('en-IN')}.`,
          channel: 'IN_APP',
          status: 'PENDING',
        },
      });
    }

    return { message: 'Payment confirmed, subscription extended' };
  }

  // Platform admin rejects payment
  async rejectPayment(invoiceId, reason) {
    const invoice = await prisma.billingInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundError('Invoice');

    await prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: { status: 'PENDING', paymentProofUrl: null, transactionId: null, notes: `Rejected: ${reason}` },
    });

    // Notify tenant
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId: invoice.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (tenantUser) {
      await prisma.notification.create({
        data: {
          tenantId: invoice.tenantId,
          userId: tenantUser.id,
          userType: 'TENANT',
          title: 'Payment Rejected',
          message: `Your payment proof was rejected. Reason: ${reason}. Please resubmit.`,
          channel: 'IN_APP',
          status: 'PENDING',
        },
      });
    }

    return { message: 'Payment rejected, tenant notified' };
  }

  // Put tenant on hold
  async holdTenant(tenantId) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'ON_HOLD' } });
    return { message: 'Tenant put on hold' };
  }

  // Dismiss tenant permanently
  async dismissTenant(tenantId) {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: 'DISMISSED' } });
    return { message: 'Tenant dismissed permanently' };
  }

  // Get subscription status for a tenant (used by tenant portal)
  async getMySubscription(tenantId) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId },
      include: { subscription: true, billingInvoices: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });
    if (!tenant) throw new NotFoundError('Tenant');

    const sub = tenant.subscription;
    let subscription = null;
    let pricing = null;

    if (sub) {
      const [settings, breakdown, billableFeatures] = await Promise.all([
        billingService.getSettings(),
        billingService.getBedBreakdown(tenantId),
        featureService.getBillableFeatures(tenantId),
      ]);
      const beds = breakdown.reduce((s, b) => s + b.beds, 0);
      const formatted = billingService.formatSubscription(sub, settings);
      subscription = {
        ...formatted,
        isExpiringSoon: formatted.daysLeft <= 7 && formatted.daysLeft > 0,
      };
      pricing = {
        model: 'PER_BED',
        ratePerBed: formatted.ratePerBed,
        isCustomRate: formatted.isCustomRate,
        currency: settings.currency,
        taxPercent: settings.taxPercent,
        billableBeds: beds,
        bedsByBuilding: breakdown,
        enabledAddOns: billableFeatures.map((f) => f.code),
        estimatedNextInvoice: billingService.computeInvoice(beds, sub.ratePerBed, settings.taxPercent, billableFeatures),
      };
    }

    return {
      tenant: { id: tenant.id, name: tenant.name, status: tenant.status },
      subscription,
      pricing,
      enabledFeatures: await featureService.getEnabledCodes(tenantId),
      invoices: tenant.billingInvoices,
      payment: {
        qrUrl: config.payment.qrUrl,
        upiId: config.payment.upiId,
      },
    };
  }

  // Platform analytics for subscriptions
  async getSubscriptionAnalytics() {
    const [total, active, onHold, suspended, dismissed, expiringSoon, revenue, activeSubs, bedsByTenant] = await Promise.all([
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'ON_HOLD' } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      prisma.tenant.count({ where: { status: 'DISMISSED' } }),
      prisma.subscription.count({
        where: {
          status: 'ACTIVE',
          endDate: { lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), gte: new Date() },
        },
      }),
      prisma.billingInvoice.aggregate({
        where: { status: 'PAID', paidAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        _sum: { total: true },
      }),
      prisma.subscription.findMany({
        where: { tenant: { deletedAt: null, status: { in: ['ACTIVE', 'ON_HOLD'] } }, status: { in: ['ACTIVE', 'TRIAL'] } },
        select: { tenantId: true, status: true, ratePerBed: true },
      }),
      billingService.countBillableBedsByTenant(),
    ]);
    const featuresByTenant = await featureService.getBillableFeaturesByTenant();

    // Expected monthly income at today's bed counts, rates and enabled add-ons (before tax).
    let totalBillableBeds = 0;
    let estimatedMonthlyRecurring = 0;
    let trialPipeline = 0;
    let trialTenants = 0;
    let payingTenants = 0;
    for (const s of activeSubs) {
      const beds = bedsByTenant.get(s.tenantId) || 0;
      const amount = billingService.computeInvoice(beds, s.ratePerBed, 0, featuresByTenant.get(s.tenantId) || []).amount;
      totalBillableBeds += beds;
      if (s.status === 'TRIAL') { trialTenants += 1; trialPipeline += amount; } else { payingTenants += 1; estimatedMonthlyRecurring += amount; }
    }

    return {
      total, active, onHold, suspended, dismissed, expiringSoon,
      monthlyRevenue: Number(revenue._sum.total || 0),
      trialTenants,
      payingTenants,
      totalBillableBeds,
      estimatedMonthlyRecurring: Math.round(estimatedMonthlyRecurring * 100) / 100,
      trialPipeline: Math.round(trialPipeline * 100) / 100,
    };
  }
}

export default new SubscriptionService();
