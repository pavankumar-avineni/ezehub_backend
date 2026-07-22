import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import prisma from '../config/database.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

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

// GET /resident/rent - Get own rent charges
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

export default router;
