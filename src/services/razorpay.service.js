import Razorpay from 'razorpay';
import crypto from 'crypto';
import prisma from '../config/database.js';
import { NotFoundError, ForbiddenError } from '../utils/errors.js';

class RazorpayService {
  // Get platform Razorpay instance (tenant pays platform)
  getPlatformInstance() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) throw new ForbiddenError('Platform Razorpay not configured');
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
  }

  // Get tenant Razorpay instance (resident pays tenant)
  async getTenantInstance(tenantId) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } });
    if (!tenant) throw new NotFoundError('Tenant');
    const settings = typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : (tenant.settings || {});
    const keyId = settings.razorpayKeyId;
    const keySecret = settings.razorpayKeySecret;
    if (!keyId || !keySecret) throw new ForbiddenError('Tenant Razorpay not configured. Ask your PG admin to set it up.');
    return { instance: new Razorpay({ key_id: keyId, key_secret: keySecret }), keyId };
  }

  // ─── PLATFORM SUBSCRIPTION PAYMENTS ───────────────────────────

  // Create order for tenant subscription payment
  async createSubscriptionOrder(tenantId, invoiceId) {
    const invoice = await prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId, status: 'PENDING' },
    });
    if (!invoice) throw new NotFoundError('Pending invoice not found');

    const rzp = this.getPlatformInstance();
    const order = await rzp.orders.create({
      amount: Math.round(Number(invoice.total) * 100), // paise
      currency: 'INR',
      receipt: invoice.invoiceNumber,
      notes: { tenantId, invoiceId, type: 'SUBSCRIPTION' },
    });

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, invoiceNumber: invoice.invoiceNumber };
  }

  // Verify and confirm subscription payment
  async verifySubscriptionPayment(tenantId, data) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, invoiceId } = data;

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (expectedSignature !== razorpay_signature) throw new ForbiddenError('Payment verification failed');

    // Update invoice
    const invoice = await prisma.billingInvoice.findFirst({ where: { id: invoiceId, tenantId } });
    if (!invoice) throw new NotFoundError('Invoice');

    await prisma.billingInvoice.update({
      where: { id: invoiceId },
      data: { status: 'PAID', paidAt: new Date(), transactionId: razorpay_payment_id, paymentMethod: 'RAZORPAY' },
    });

    // Extend subscription
    await prisma.subscription.update({
      where: { tenantId },
      data: { status: 'ACTIVE', endDate: invoice.billingEnd },
    });

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: 'ACTIVE', activatedAt: new Date() },
    });

    return { message: 'Payment successful, subscription extended', paymentId: razorpay_payment_id };
  }

  // ─── TENANT RENT PAYMENTS (Resident → Tenant) ─────────────────

  // Create order for resident rent payment
  async createRentOrder(tenantId, residentId, chargeId) {
    const charge = await prisma.rentCharge.findFirst({
      where: { id: chargeId, residentId, tenantId },
    });
    if (!charge) throw new NotFoundError('Rent charge not found');
    if (charge.status === 'PAID') throw new ForbiddenError('Already paid');

    const remaining = Number(charge.totalAmount) - Number(charge.paidAmount);
    if (remaining <= 0) throw new ForbiddenError('No amount pending');

    const { instance: rzp, keyId } = await this.getTenantInstance(tenantId);
    const order = await rzp.orders.create({
      amount: Math.round(remaining * 100), // paise
      currency: 'INR',
      receipt: `RENT-${charge.month}-${charge.year}-${chargeId.slice(0, 8)}`,
      notes: { tenantId, residentId, chargeId, type: 'RENT' },
    });

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId, chargeId };
  }

  // Verify and confirm rent payment
  async verifyRentPayment(tenantId, residentId, data) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, chargeId } = data;

    // Get tenant's key secret for verification
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId }, select: { settings: true } });
    const settings = typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : (tenant.settings || {});
    const keySecret = settings.razorpayKeySecret;
    if (!keySecret) throw new ForbiddenError('Tenant Razorpay not configured');

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto.createHmac('sha256', keySecret).update(body).digest('hex');
    if (expectedSignature !== razorpay_signature) throw new ForbiddenError('Payment verification failed');

    // Record payment and update rent charge
    const charge = await prisma.rentCharge.findFirst({ where: { id: chargeId, residentId, tenantId } });
    if (!charge) throw new NotFoundError('Rent charge');

    const amount = Number(charge.totalAmount) - Number(charge.paidAmount);

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          tenantId,
          residentId,
          rentChargeId: chargeId,
          amount,
          method: 'ONLINE',
          status: 'PAID',
          transactionId: razorpay_payment_id,
          receiptNumber: `RZP-${Date.now()}`,
          confirmedAt: new Date(),
        },
      });

      const newPaid = Number(charge.paidAmount) + amount;
      const status = newPaid >= Number(charge.totalAmount) ? 'PAID' : 'PARTIAL';
      await tx.rentCharge.update({
        where: { id: chargeId },
        data: { paidAmount: newPaid, status },
      });

      return p;
    });

    return { message: 'Rent payment successful', paymentId: razorpay_payment_id, amount };
  }
}

export default new RazorpayService();
