import prisma from '../config/database.js';
import config from '../config/index.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

class SubscriptionService {
  // Get plan details from config
  getPlanDetails(plan) {
    const planConfig = config.plans[plan];
    if (!planConfig) throw new NotFoundError('Plan');
    return { plan, price: planConfig.price, buildings: planConfig.buildings };
  }

  getAllPlans() {
    return Object.entries(config.plans).map(([name, details]) => ({
      name,
      price: details.price,
      buildings: details.buildings,
      priceFormatted: `₹${details.price}/month`,
    }));
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
    const planDetails = this.getPlanDetails(sub.plan);

    // Calculate billing period
    const billingStart = sub.endDate && sub.endDate > new Date() ? new Date(sub.endDate) : new Date();
    const billingEnd = new Date(billingStart);
    billingEnd.setDate(billingEnd.getDate() + 30);

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7); // 7 days to pay

    // Generate invoice number: INV-YYYYMMDD-XXXX
    const count = await prisma.billingInvoice.count({ where: { tenantId } });
    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(count + 1).padStart(4, '0')}`;

    const invoice = await prisma.billingInvoice.create({
      data: {
        subscriptionId: sub.id,
        tenantId,
        invoiceNumber,
        plan: sub.plan,
        amount: planDetails.price,
        tax: 0,
        total: planDetails.price,
        billingStart,
        billingEnd,
        dueDate,
        createdBy,
        status: 'PENDING',
      },
      include: { tenant: { select: { name: true, email: true } } },
    });

    return invoice;
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
          message: `Your payment of ₹${invoice.total} for ${invoice.plan} plan has been confirmed. Subscription active until ${invoice.billingEnd.toLocaleDateString('en-IN')}.`,
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
    const now = new Date();
    const daysLeft = sub?.endDate ? Math.max(0, Math.ceil((new Date(sub.endDate) - now) / (1000 * 60 * 60 * 24))) : 0;
    const isExpiringSoon = daysLeft <= 7 && daysLeft > 0;
    const isExpired = sub?.endDate && new Date(sub.endDate) < now;

    return {
      tenant: { id: tenant.id, name: tenant.name, status: tenant.status },
      subscription: sub ? {
        plan: sub.plan,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
        daysLeft,
        isExpiringSoon,
        isExpired,
        price: config.plans[sub.plan]?.price,
      } : null,
      invoices: tenant.billingInvoices,
      payment: {
        qrUrl: config.payment.qrUrl,
        upiId: config.payment.upiId,
      },
    };
  }

  // Platform analytics for subscriptions
  async getSubscriptionAnalytics() {
    const [total, active, onHold, suspended, dismissed, expiringSoon, revenue] = await Promise.all([
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
    ]);

    return { total, active, onHold, suspended, dismissed, expiringSoon, monthlyRevenue: Number(revenue._sum.total || 0) };
  }
}

export default new SubscriptionService();
