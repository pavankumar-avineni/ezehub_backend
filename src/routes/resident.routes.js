import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { uploadSingle } from '../middleware/upload.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import prisma from '../config/database.js';
import { successResponse, paginatedResponse, generateReceiptNumber } from '../utils/response.js';

const router = Router();

// All routes require resident authentication
router.use(authenticate);

// Middleware to ensure only residents access these routes
router.use((req, res, next) => {
  if (req.user.scope !== 'RESIDENT') {
    return res.status(403).json({ success: false, message: 'Resident access only' });
  }
  next();
});

// GET /resident/me - Get own profile with full details
router.get('/me', async (req, res, next) => {
  try {
    const resident = await prisma.resident.findFirst({
      where: { id: req.user.userId, deletedAt: null },
      include: {
        tenant: true,
        bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
        documents: { where: { deletedAt: null } },
      },
    });
    successResponse(res, resident);
  } catch (error) { next(error); }
});

// GET /resident/rent - Get own rent charges with payment status
router.get('/rent', async (req, res, next) => {
  try {
    const charges = await prisma.rentCharge.findMany({
      where: { residentId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { payments: true },
    });
    successResponse(res, charges);
  } catch (error) { next(error); }
});

// GET /resident/rent/payment-config - Get tenant's payment QR and UPI for this resident
router.get('/rent/payment-config', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.user.tenantId },
      select: { settings: true, name: true },
    });
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });

    const settings = typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : (tenant.settings || {});
    successResponse(res, {
      tenantName: tenant.name,
      qrUrl: settings.paymentQrUrl || '',
      upiId: settings.paymentUpiId || '',
      bankName: settings.paymentBankName || '',
      accountNumber: settings.paymentAccountNumber || '',
      ifscCode: settings.paymentIfscCode || '',
      accountHolder: settings.paymentAccountHolder || '',
      instructions: settings.paymentInstructions || 'Pay using any UPI app (GPay, PhonePe, Paytm) and submit proof below.',
    });
  } catch (error) { next(error); }
});

// POST /resident/rent/:chargeId/pay - Submit payment proof for a rent charge
router.post('/rent/:chargeId/pay', uploadSingle('proof'), async (req, res, next) => {
  try {
    const { chargeId } = req.params;
    const { transactionId, paymentMethod, amount, notes } = req.body;

    if (!transactionId) {
      return res.status(400).json({ success: false, message: 'Transaction ID is required' });
    }

    // Verify charge belongs to this resident
    const charge = await prisma.rentCharge.findFirst({
      where: { id: chargeId, residentId: req.user.userId },
    });
    if (!charge) return res.status(404).json({ success: false, message: 'Rent charge not found' });
    if (charge.status === 'PAID') return res.status(400).json({ success: false, message: 'This charge is already fully paid' });

    // Upload proof image if provided
    let paymentProofUrl = null;
    if (req.file) {
      const result = await uploadToCloudinary(req.file.buffer, { folder: `ezehub/${req.user.tenantId}/rent-proofs` });
      paymentProofUrl = result.secure_url;
    }

    const paymentAmount = amount ? parseFloat(amount) : Number(charge.totalAmount) - Number(charge.paidAmount);

    // Create payment record with PENDING status (awaiting tenant confirmation)
    const payment = await prisma.payment.create({
      data: {
        tenantId: req.user.tenantId,
        residentId: req.user.userId,
        rentChargeId: chargeId,
        amount: paymentAmount,
        method: paymentMethod || 'UPI',
        status: 'PENDING',
        transactionId,
        receiptNumber: generateReceiptNumber(),
        notes: notes || null,
        paymentProofUrl,
      },
    });

    // Notify tenant about the payment proof submission
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId: req.user.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (tenantUser) {
      const resident = await prisma.resident.findFirst({ where: { id: req.user.userId } });
      await prisma.notification.create({
        data: {
          tenantId: req.user.tenantId,
          userId: tenantUser.id,
          userType: 'TENANT',
          title: 'Rent Payment Proof Submitted',
          message: `${resident?.firstName} ${resident?.lastName} submitted payment proof of ₹${paymentAmount} for ${charge.month}/${charge.year}. Transaction ID: ${transactionId}`,
          channel: 'IN_APP',
          status: 'PENDING',
        },
      });
    }

    successResponse(res, payment, 'Payment proof submitted. Awaiting confirmation.', 201);
  } catch (error) { next(error); }
});

// GET /resident/rent/payments - Get own payment history
router.get('/rent/payments', async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { residentId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { rentCharge: { select: { month: true, year: true, totalAmount: true } } },
    });
    successResponse(res, payments);
  } catch (error) { next(error); }
});

// GET /resident/complaints - Get own complaints
router.get('/complaints', async (req, res, next) => {
  try {
    const complaints = await prisma.complaint.findMany({
      where: { residentId: req.user.userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { building: true },
    });
    successResponse(res, complaints);
  } catch (error) { next(error); }
});

// POST /resident/complaints - Create a complaint
router.post('/complaints', async (req, res, next) => {
  try {
    const resident = await prisma.resident.findFirst({
      where: { id: req.user.userId },
      include: { bed: true },
    });
    if (!resident) return res.status(404).json({ success: false, message: 'Resident not found' });

    const complaint = await prisma.complaint.create({
      data: {
        tenantId: req.user.tenantId,
        buildingId: resident.bed?.buildingId || req.body.buildingId,
        residentId: resident.id,
        title: req.body.title,
        description: req.body.description,
        category: req.body.category || 'OTHER',
        priority: req.body.priority || 'MEDIUM',
      },
    });
    successResponse(res, complaint, 'Complaint submitted', 201);
  } catch (error) { next(error); }
});

// GET /resident/visitors - Get visitors I registered
router.get('/visitors', async (req, res, next) => {
  try {
    const visitors = await prisma.visitor.findMany({
      where: { residentId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    successResponse(res, visitors);
  } catch (error) { next(error); }
});

// POST /resident/visitors - Pre-register a visitor
router.post('/visitors', async (req, res, next) => {
  try {
    const resident = await prisma.resident.findFirst({
      where: { id: req.user.userId },
      include: { bed: true },
    });
    if (!resident) return res.status(404).json({ success: false, message: 'Resident not found' });

    const visitor = await prisma.visitor.create({
      data: {
        tenantId: req.user.tenantId,
        buildingId: resident.bed?.buildingId || req.body.buildingId,
        residentId: resident.id,
        name: req.body.name,
        phone: req.body.phone,
        purpose: req.body.purpose || 'Visit',
        hostName: `${resident.firstName} ${resident.lastName}`,
        hostPhone: resident.phone,
      },
    });
    successResponse(res, visitor, 'Visitor pre-registered', 201);
  } catch (error) { next(error); }
});

// GET /resident/notifications - Get notifications
router.get('/notifications', async (req, res, next) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.userId, userType: 'RESIDENT' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    successResponse(res, notifications);
  } catch (error) { next(error); }
});

// PUT /resident/notifications/:id/read
router.put('/notifications/:id/read', async (req, res, next) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { readAt: new Date(), status: 'READ' },
    });
    successResponse(res, null, 'Marked as read');
  } catch (error) { next(error); }
});

// GET /resident/documents - Get own documents
router.get('/documents', async (req, res, next) => {
  try {
    const documents = await prisma.document.findMany({
      where: { residentId: req.user.userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    successResponse(res, documents);
  } catch (error) { next(error); }
});

// GET /resident/discounts - Get active discounts for this resident
router.get('/discounts', async (req, res, next) => {
  try {
    const { default: discountService } = await import('../services/discount.service.js');
    const discounts = await discountService.getResidentDiscounts(req.user.tenantId, req.user.userId);
    successResponse(res, discounts);
  } catch (error) { next(error); }
});

// GET /resident/promotions - Get active promotions from tenant
router.get('/promotions', async (req, res, next) => {
  try {
    const { default: promotionService } = await import('../services/promotion.service.js');
    const promotions = await promotionService.getActivePromotions(req.user.tenantId);
    successResponse(res, promotions);
  } catch (error) { next(error); }
});

// GET /resident/menu - Get food menu for my building
router.get('/menu', async (req, res, next) => {
  try {
    const resident = await prisma.resident.findFirst({
      where: { id: req.user.userId },
      include: { bed: true },
    });
    if (!resident?.bed?.buildingId) return successResponse(res, {});
    const { default: foodMenuService } = await import('../services/foodmenu.service.js');
    const menu = await foodMenuService.getWeeklyMenu(req.user.tenantId, resident.bed.buildingId);
    successResponse(res, menu);
  } catch (error) { next(error); }
});

// GET /resident/menu/today - Get today's menu
router.get('/menu/today', async (req, res, next) => {
  try {
    const resident = await prisma.resident.findFirst({
      where: { id: req.user.userId },
      include: { bed: true },
    });
    if (!resident?.bed?.buildingId) return successResponse(res, []);
    const { default: foodMenuService } = await import('../services/foodmenu.service.js');
    const menu = await foodMenuService.getTodayMenu(req.user.tenantId, resident.bed.buildingId);
    successResponse(res, menu);
  } catch (error) { next(error); }
});

// POST /resident/complaints/:id/comments - Add comment to a complaint
router.post('/complaints/:id/comments', async (req, res, next) => {
  try {
    const complaint = await prisma.complaint.findFirst({
      where: { id: req.params.id, residentId: req.user.userId },
    });
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found' });

    const comment = await prisma.complaintComment.create({
      data: {
        complaintId: req.params.id,
        userId: req.user.userId,
        userType: 'RESIDENT',
        comment: req.body.comment,
      },
    });
    successResponse(res, comment, 'Reply added', 201);
  } catch (error) { next(error); }
});

// GET /resident/complaints/:id/comments - Get comments for a complaint
router.get('/complaints/:id/comments', async (req, res, next) => {
  try {
    const comments = await prisma.complaintComment.findMany({
      where: { complaintId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    successResponse(res, comments);
  } catch (error) { next(error); }
});

export default router;
