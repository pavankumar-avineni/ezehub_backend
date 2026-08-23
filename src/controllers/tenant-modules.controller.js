import buildingService from '../services/building.service.js';
import { floorService, roomService, bedService } from '../services/structure.service.js';
import residentService from '../services/resident.service.js';
import staffService from '../services/staff.service.js';
import inventoryService from '../services/inventory.service.js';
import rentService from '../services/rent.service.js';
import { complaintService, visitorService } from '../services/complaint.service.js';
import { financeService, maintenanceService } from '../services/finance.service.js';
import { documentService, notificationService, reportService } from '../services/document.service.js';
import tenantService from '../services/tenant.service.js';
import discountService from '../services/discount.service.js';
import promotionService from '../services/promotion.service.js';
import foodMenuService from '../services/foodmenu.service.js';
import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { successResponse, paginatedResponse, generateReceiptNumber } from '../utils/response.js';

const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); } catch (error) { next(error); }
};

// Buildings
export const createBuilding = wrap(async (req, res) => {
  await tenantService.checkBuildingLimit(req.tenantId);
  const building = await buildingService.create(req.tenantId, req.body);
  successResponse(res, building, 'Building created', 201);
});

export const getBuildings = wrap(async (req, res) => {
  const { buildings, pagination } = await buildingService.findAll(req.tenantId, req.query);
  paginatedResponse(res, buildings, pagination);
});

export const getBuilding = wrap(async (req, res) => {
  const building = await buildingService.findById(req.tenantId, req.params.id);
  successResponse(res, building);
});

export const updateBuilding = wrap(async (req, res) => {
  const building = await buildingService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, building, 'Building updated');
});

export const deleteBuilding = wrap(async (req, res) => {
  await buildingService.softDelete(req.tenantId, req.params.id);
  successResponse(res, null, 'Building deleted');
});

export const getBuildingStats = wrap(async (req, res) => {
  const stats = await buildingService.getStats(req.tenantId, req.params.id);
  successResponse(res, stats);
});

export const getBuildingTypes = wrap(async (req, res) => {
  const buildingTypes = await buildingService.getBuildingTypes(req.tenantId);
  successResponse(res, buildingTypes);
});

// Floors
export const createFloor = wrap(async (req, res) => {
  const floor = await floorService.create(req.tenantId, req.body);
  successResponse(res, floor, 'Floor created', 201);
});

export const getFloors = wrap(async (req, res) => {
  const { floors, pagination } = await floorService.findAll(req.tenantId, req.query.buildingId, req.query);
  paginatedResponse(res, floors, pagination);
});

export const getFloor = wrap(async (req, res) => {
  const floor = await floorService.findById(req.tenantId, req.params.id);
  successResponse(res, floor);
});

export const updateFloor = wrap(async (req, res) => {
  const floor = await floorService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, floor, 'Floor updated');
});

export const deleteFloor = wrap(async (req, res) => {
  await floorService.softDelete(req.tenantId, req.params.id);
  successResponse(res, null, 'Floor deleted');
});

// Rooms
export const createRoom = wrap(async (req, res) => {
  const room = await roomService.create(req.tenantId, req.body);
  successResponse(res, room, 'Room created', 201);
});

export const getRooms = wrap(async (req, res) => {
  const { rooms, pagination } = await roomService.findAll(req.tenantId, req.query);
  paginatedResponse(res, rooms, pagination);
});

export const getRoom = wrap(async (req, res) => {
  const room = await roomService.findById(req.tenantId, req.params.id);
  successResponse(res, room);
});

export const updateRoom = wrap(async (req, res) => {
  const room = await roomService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, room, 'Room updated');
});

export const deleteRoom = wrap(async (req, res) => {
  await roomService.softDelete(req.tenantId, req.params.id);
  successResponse(res, null, 'Room deleted');
});

// Beds
export const createBed = wrap(async (req, res) => {
  const bed = await bedService.create(req.tenantId, req.body);
  successResponse(res, bed, 'Bed created', 201);
});

export const getBeds = wrap(async (req, res) => {
  const { beds, pagination } = await bedService.findAll(req.tenantId, req.query);
  paginatedResponse(res, beds, pagination);
});

export const getBed = wrap(async (req, res) => {
  const bed = await bedService.findById(req.tenantId, req.params.id);
  successResponse(res, bed);
});

export const updateBed = wrap(async (req, res) => {
  const bed = await bedService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, bed, 'Bed updated');
});

export const deleteBed = wrap(async (req, res) => {
  await bedService.softDelete(req.tenantId, req.params.id);
  successResponse(res, null, 'Bed deleted');
});

// Residents
export const createResident = wrap(async (req, res) => {
  const resident = await residentService.create(req.tenantId, req.body);
  successResponse(res, resident, 'Resident created', 201);
});

export const getResidents = wrap(async (req, res) => {
  const { residents, pagination } = await residentService.findAll(req.tenantId, req.query);
  paginatedResponse(res, residents, pagination);
});

export const getResident = wrap(async (req, res) => {
  const resident = await residentService.findById(req.tenantId, req.params.id);
  successResponse(res, resident);
});

export const updateResident = wrap(async (req, res) => {
  const resident = await residentService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, resident, 'Resident updated');
});

export const transferResident = wrap(async (req, res) => {
  const resident = await residentService.transfer(req.tenantId, req.params.id, req.body.toBedId, req.body.reason);
  successResponse(res, resident, 'Resident transferred');
});

export const checkoutResident = wrap(async (req, res) => {
  const resident = await residentService.checkout(req.tenantId, req.params.id, req.body.checkOutDate, req.body.notes);
  successResponse(res, resident, 'Resident checked out');
});

export const deleteResident = wrap(async (req, res) => {
  await residentService.softDelete(req.tenantId, req.params.id);
  successResponse(res, null, 'Resident deleted');
});

// Staff
export const createStaff = wrap(async (req, res) => {
  const staff = await staffService.create(req.tenantId, req.body);
  successResponse(res, staff, 'Staff created', 201);
});

export const getStaff = wrap(async (req, res) => {
  const { staff, pagination } = await staffService.findAll(req.tenantId, req.query);
  paginatedResponse(res, staff, pagination);
});

export const getStaffMember = wrap(async (req, res) => {
  const staff = await staffService.findById(req.tenantId, req.params.id);
  successResponse(res, staff);
});

export const updateStaff = wrap(async (req, res) => {
  const staff = await staffService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, staff, 'Staff updated');
});

export const deleteStaff = wrap(async (req, res) => {
  await staffService.softDelete(req.tenantId, req.params.id);
  successResponse(res, null, 'Staff deleted');
});

export const recordAttendance = wrap(async (req, res) => {
  const attendance = await staffService.recordAttendance(req.tenantId, req.body);
  successResponse(res, attendance, 'Attendance recorded');
});

export const createLeaveRequest = wrap(async (req, res) => {
  const leave = await staffService.createLeaveRequest(req.tenantId, req.params.id, req.body);
  successResponse(res, leave, 'Leave request created', 201);
});

export const updateLeaveStatus = wrap(async (req, res) => {
  const leave = await staffService.updateLeaveStatus(req.tenantId, req.params.leaveId, req.body.status, req.user.id);
  successResponse(res, leave, 'Leave status updated');
});

// Inventory
export const createInventory = wrap(async (req, res) => {
  const item = await inventoryService.create(req.tenantId, req.body, req.user.id);
  successResponse(res, item, 'Inventory item created', 201);
});

export const getInventory = wrap(async (req, res) => {
  const { items, pagination } = await inventoryService.findAll(req.tenantId, req.query);
  paginatedResponse(res, items, pagination);
});

export const getInventoryItem = wrap(async (req, res) => {
  const item = await inventoryService.findById(req.tenantId, req.params.id);
  successResponse(res, item);
});

export const updateInventory = wrap(async (req, res) => {
  const item = await inventoryService.update(req.tenantId, req.params.id, req.body, req.user.id);
  successResponse(res, item, 'Inventory updated');
});

export const deleteInventory = wrap(async (req, res) => {
  await inventoryService.softDelete(req.tenantId, req.params.id);
  successResponse(res, null, 'Inventory deleted');
});

// Rent & Payments
export const generateRent = wrap(async (req, res) => {
  const result = await rentService.generateMonthlyRent(req.tenantId, req.body.month, req.body.year, req.body.buildingId);
  successResponse(res, result, `Generated ${result.generated} rent charges`);
});

export const getRentCharges = wrap(async (req, res) => {
  const { charges, pagination } = await rentService.findAllCharges(req.tenantId, req.query);
  paginatedResponse(res, charges, pagination);
});

export const updateRentCharge = wrap(async (req, res) => {
  const charge = await rentService.updateCharge(req.tenantId, req.params.id, req.body);
  successResponse(res, charge, 'Rent charge updated');
});

export const recordPayment = wrap(async (req, res) => {
  const payment = await rentService.recordPayment(req.tenantId, req.body);
  successResponse(res, payment, 'Payment recorded', 201);
});

export const getPayments = wrap(async (req, res) => {
  const { payments, pagination } = await rentService.findAllPayments(req.tenantId, req.query);
  paginatedResponse(res, payments, pagination);
});

export const getOutstandingBalance = wrap(async (req, res) => {
  const balance = await rentService.getOutstandingBalance(req.tenantId);
  successResponse(res, balance);
});

// Payment Proof Management (Resident → Tenant flow)
export const getPendingPaymentProofs = wrap(async (req, res) => {
  const payments = await prisma.payment.findMany({
    where: { tenantId: req.tenantId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: {
      resident: { select: { id: true, firstName: true, lastName: true, phone: true } },
      rentCharge: { select: { id: true, month: true, year: true, totalAmount: true, paidAmount: true } },
    },
  });
  successResponse(res, payments);
});

export const confirmResidentPayment = wrap(async (req, res) => {
  const { paymentId } = req.params;

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId: req.tenantId, status: 'PENDING' },
  });
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Pending payment not found' });
  }

  // Confirm payment and update rent charge in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const confirmedPayment = await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'PAID', confirmedBy: req.user.id, confirmedAt: new Date() },
    });

    // Update rent charge paid amount
    if (payment.rentChargeId) {
      const charge = await tx.rentCharge.findUnique({ where: { id: payment.rentChargeId } });
      if (charge) {
        const newPaidAmount = Number(charge.paidAmount) + Number(payment.amount);
        const status = newPaidAmount >= Number(charge.totalAmount) ? 'PAID' : 'PARTIAL';
        await tx.rentCharge.update({
          where: { id: payment.rentChargeId },
          data: { paidAmount: newPaidAmount, status },
        });
      }
    }

    // Notify resident
    await tx.notification.create({
      data: {
        tenantId: req.tenantId,
        userId: payment.residentId,
        userType: 'RESIDENT',
        title: 'Payment Confirmed',
        message: `Your payment of ₹${payment.amount} has been confirmed. Receipt: ${confirmedPayment.receiptNumber}`,
        channel: 'IN_APP',
        status: 'PENDING',
      },
    });

    return confirmedPayment;
  });

  successResponse(res, result, 'Payment confirmed');
});

export const rejectResidentPayment = wrap(async (req, res) => {
  const { paymentId } = req.params;
  const { reason } = req.body;

  const payment = await prisma.payment.findFirst({
    where: { id: paymentId, tenantId: req.tenantId, status: 'PENDING' },
  });
  if (!payment) {
    return res.status(404).json({ success: false, message: 'Pending payment not found' });
  }

  const rejectedPayment = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: paymentId },
      data: { status: 'CANCELLED', rejectedReason: reason || 'Payment rejected by admin', confirmedBy: req.user.id, confirmedAt: new Date() },
    });

    // Notify resident
    await tx.notification.create({
      data: {
        tenantId: req.tenantId,
        userId: payment.residentId,
        userType: 'RESIDENT',
        title: 'Payment Rejected',
        message: `Your payment of ₹${payment.amount} was rejected. Reason: ${reason || 'Invalid proof'}. Please resubmit.`,
        channel: 'IN_APP',
        status: 'PENDING',
      },
    });

    return updated;
  });

  successResponse(res, rejectedPayment, 'Payment rejected, resident notified');
});

// Payment Settings
export const getPaymentSettings = wrap(async (req, res) => {
  const tenant = await prisma.tenant.findFirst({
    where: { id: req.tenantId },
    select: { settings: true },
  });
  const settings = typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : (tenant.settings || {});
  successResponse(res, {
    paymentQrUrl: settings.paymentQrUrl || '',
    paymentUpiId: settings.paymentUpiId || '',
    paymentBankName: settings.paymentBankName || '',
    paymentAccountNumber: settings.paymentAccountNumber || '',
    paymentIfscCode: settings.paymentIfscCode || '',
    paymentAccountHolder: settings.paymentAccountHolder || '',
    paymentInstructions: settings.paymentInstructions || '',
    razorpayKeyId: settings.razorpayKeyId || '',
    razorpayKeySecret: settings.razorpayKeySecret ? '••••••••' : '',
    razorpayConfigured: !!(settings.razorpayKeyId && settings.razorpayKeySecret),
  });
});

export const updatePaymentSettings = wrap(async (req, res) => {
  const tenant = await prisma.tenant.findFirst({
    where: { id: req.tenantId },
    select: { settings: true },
  });
  const currentSettings = typeof tenant.settings === 'string' ? JSON.parse(tenant.settings) : (tenant.settings || {});
  const { paymentQrUrl, paymentUpiId, paymentBankName, paymentAccountNumber, paymentIfscCode, paymentAccountHolder, paymentInstructions, razorpayKeyId, razorpayKeySecret } = req.body;

  const updatedSettings = {
    ...currentSettings,
    ...(paymentQrUrl !== undefined && { paymentQrUrl }),
    ...(paymentUpiId !== undefined && { paymentUpiId }),
    ...(paymentBankName !== undefined && { paymentBankName }),
    ...(paymentAccountNumber !== undefined && { paymentAccountNumber }),
    ...(paymentIfscCode !== undefined && { paymentIfscCode }),
    ...(paymentAccountHolder !== undefined && { paymentAccountHolder }),
    ...(paymentInstructions !== undefined && { paymentInstructions }),
    ...(razorpayKeyId !== undefined && { razorpayKeyId }),
    ...(razorpayKeySecret !== undefined && razorpayKeySecret !== '••••••••' && { razorpayKeySecret }),
  };

  await prisma.tenant.update({
    where: { id: req.tenantId },
    data: { settings: updatedSettings },
  });

  successResponse(res, { ...updatedSettings, razorpayKeySecret: updatedSettings.razorpayKeySecret ? '••••••••' : '' }, 'Payment settings updated');
});

// Complaints
export const createComplaint = wrap(async (req, res) => {
  const complaint = await complaintService.create(req.tenantId, req.body);
  successResponse(res, complaint, 'Complaint created', 201);
});

export const getComplaints = wrap(async (req, res) => {
  const { complaints, pagination } = await complaintService.findAll(req.tenantId, req.query);
  paginatedResponse(res, complaints, pagination);
});

export const getComplaint = wrap(async (req, res) => {
  const complaint = await complaintService.findById(req.tenantId, req.params.id);
  successResponse(res, complaint);
});

export const assignComplaint = wrap(async (req, res) => {
  const complaint = await complaintService.assign(req.tenantId, req.params.id, req.body.assignedStaffId);
  successResponse(res, complaint, 'Complaint assigned');
});

export const updateComplaintStatus = wrap(async (req, res) => {
  const complaint = await complaintService.updateStatus(req.tenantId, req.params.id, req.body.status, req.body.resolution);
  successResponse(res, complaint, 'Complaint status updated');
});

export const addComplaintComment = wrap(async (req, res) => {
  const comment = await complaintService.addComment(req.tenantId, req.params.id, req.user.id, req.user.scope, req.body.comment, req.body.attachments);
  successResponse(res, comment, 'Comment added', 201);
});

// Visitors
export const createVisitor = wrap(async (req, res) => {
  const visitor = await visitorService.create(req.tenantId, req.body);
  successResponse(res, visitor, 'Visitor registered', 201);
});

export const getVisitors = wrap(async (req, res) => {
  const { visitors, pagination } = await visitorService.findAll(req.tenantId, req.query);
  paginatedResponse(res, visitors, pagination);
});

export const getVisitor = wrap(async (req, res) => {
  const visitor = await visitorService.findById(req.tenantId, req.params.id);
  successResponse(res, visitor);
});

export const verifyVisitorOtp = wrap(async (req, res) => {
  const visitor = await visitorService.verifyOtp(req.tenantId, req.params.id, req.body.otp);
  successResponse(res, visitor, 'OTP verified');
});

export const checkInVisitor = wrap(async (req, res) => {
  const visitor = await visitorService.checkIn(req.tenantId, req.params.id);
  successResponse(res, visitor, 'Visitor checked in');
});

export const checkOutVisitor = wrap(async (req, res) => {
  const visitor = await visitorService.checkOut(req.tenantId, req.params.id);
  successResponse(res, visitor, 'Visitor checked out');
});

// Finance
export const createIncome = wrap(async (req, res) => {
  const record = await financeService.createIncome(req.tenantId, req.body);
  successResponse(res, record, 'Income recorded', 201);
});

export const createExpense = wrap(async (req, res) => {
  const record = await financeService.createExpense(req.tenantId, req.body);
  successResponse(res, record, 'Expense recorded', 201);
});

export const getIncome = wrap(async (req, res) => {
  const { records, pagination } = await financeService.findAllIncome(req.tenantId, req.query);
  paginatedResponse(res, records, pagination);
});

export const getExpenses = wrap(async (req, res) => {
  const { records, pagination } = await financeService.findAllExpenses(req.tenantId, req.query);
  paginatedResponse(res, records, pagination);
});

export const getFinanceDashboard = wrap(async (req, res) => {
  const dashboard = await financeService.getDashboard(req.tenantId, req.query.startDate, req.query.endDate);
  successResponse(res, dashboard);
});

// Maintenance
export const createMaintenance = wrap(async (req, res) => {
  const request = await maintenanceService.create(req.tenantId, req.body);
  successResponse(res, request, 'Maintenance request created', 201);
});

export const getMaintenance = wrap(async (req, res) => {
  const { requests, pagination } = await maintenanceService.findAll(req.tenantId, req.query);
  paginatedResponse(res, requests, pagination);
});

export const getMaintenanceRequest = wrap(async (req, res) => {
  const request = await maintenanceService.findById(req.tenantId, req.params.id);
  successResponse(res, request);
});

export const updateMaintenance = wrap(async (req, res) => {
  const request = await maintenanceService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, request, 'Maintenance request updated');
});

// Documents
export const uploadDocument = wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const doc = await documentService.upload(req.tenantId, req.file, {
    ...req.body,
    uploadedBy: req.user.id,
  });
  successResponse(res, doc, 'Document uploaded', 201);
});

export const getDocuments = wrap(async (req, res) => {
  const { documents, pagination } = await documentService.findAll(req.tenantId, req.query);
  paginatedResponse(res, documents, pagination);
});

export const deleteDocument = wrap(async (req, res) => {
  await documentService.delete(req.tenantId, req.params.id);
  successResponse(res, null, 'Document deleted');
});

// Notifications
export const createNotification = wrap(async (req, res) => {
  const notification = await notificationService.create(req.tenantId, req.body);
  successResponse(res, notification, 'Notification created', 201);
});

export const getNotifications = wrap(async (req, res) => {
  const result = await notificationService.findAll(req.user.id, req.query);
  successResponse(res, result);
});

export const markNotificationRead = wrap(async (req, res) => {
  await notificationService.markAsRead(req.params.id, req.user.id);
  successResponse(res, null, 'Notification marked as read');
});

export const markAllNotificationsRead = wrap(async (req, res) => {
  await notificationService.markAllAsRead(req.user.id);
  successResponse(res, null, 'All notifications marked as read');
});

// Reports
export const getTenantDashboard = wrap(async (req, res) => {
  const dashboard = await reportService.getTenantDashboard(req.tenantId);
  successResponse(res, dashboard);
});

export const getOccupancyReport = wrap(async (req, res) => {
  const report = await reportService.getOccupancyReport(req.tenantId, req.query.buildingId);
  successResponse(res, report);
});

export const getRentCollectionReport = wrap(async (req, res) => {
  const report = await reportService.getRentCollectionReport(req.tenantId, parseInt(req.query.month), parseInt(req.query.year));
  successResponse(res, report);
});


// ═══════════════════════════════════════════════════════════════
// DISCOUNTS
// ═══════════════════════════════════════════════════════════════

export const getDiscounts = wrap(async (req, res) => {
  const result = await discountService.findAll(req.tenantId, req.query);
  paginatedResponse(res, result.discounts, result.pagination);
});

export const createDiscount = wrap(async (req, res) => {
  const discount = await discountService.create(req.tenantId, req.body);
  successResponse(res, discount, 'Discount created', 201);
});

export const getDiscount = wrap(async (req, res) => {
  const discount = await discountService.findById(req.tenantId, req.params.id);
  successResponse(res, discount);
});

export const updateDiscount = wrap(async (req, res) => {
  const discount = await discountService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, discount, 'Discount updated');
});

export const deleteDiscount = wrap(async (req, res) => {
  await discountService.delete(req.tenantId, req.params.id);
  successResponse(res, null, 'Discount deleted');
});

// ═══════════════════════════════════════════════════════════════
// PROMOTIONS
// ═══════════════════════════════════════════════════════════════

export const getPromotions = wrap(async (req, res) => {
  const result = await promotionService.findAll(req.tenantId, req.query);
  paginatedResponse(res, result.promotions, result.pagination);
});

export const createPromotion = wrap(async (req, res) => {
  const promo = await promotionService.create(req.tenantId, req.body);
  successResponse(res, promo, 'Promotion created', 201);
});

export const getPromotion = wrap(async (req, res) => {
  const promo = await promotionService.findById(req.tenantId, req.params.id);
  successResponse(res, promo);
});

export const updatePromotion = wrap(async (req, res) => {
  const promo = await promotionService.update(req.tenantId, req.params.id, req.body);
  successResponse(res, promo, 'Promotion updated');
});

export const deletePromotion = wrap(async (req, res) => {
  await promotionService.delete(req.tenantId, req.params.id);
  successResponse(res, null, 'Promotion deleted');
});

// ═══════════════════════════════════════════════════════════════
// FOOD MENU
// ═══════════════════════════════════════════════════════════════

export const getWeeklyMenu = wrap(async (req, res) => {
  const menu = await foodMenuService.getWeeklyMenu(req.tenantId, req.params.buildingId);
  successResponse(res, menu);
});

export const getTodayMenu = wrap(async (req, res) => {
  const menu = await foodMenuService.getTodayMenu(req.tenantId, req.params.buildingId);
  successResponse(res, menu);
});

export const upsertMenu = wrap(async (req, res) => {
  const menu = await foodMenuService.upsert(req.tenantId, req.body);
  successResponse(res, menu, 'Menu saved');
});

export const bulkUpsertMenu = wrap(async (req, res) => {
  const { buildingId, menus } = req.body;
  const results = await foodMenuService.bulkUpsert(req.tenantId, buildingId, menus);
  successResponse(res, results, `${results.length} menu items saved`);
});

export const deleteMenu = wrap(async (req, res) => {
  await foodMenuService.delete(req.tenantId, req.params.id);
  successResponse(res, null, 'Menu deleted');
});

// ═══════════════════════════════════════════════════════════════
// ROLES & PERMISSIONS
// ═══════════════════════════════════════════════════════════════

export const getRoles = wrap(async (req, res) => {
  const roles = await prisma.role.findMany({
    where: { tenantId: req.tenantId, deletedAt: null },
    include: { permissions: { include: { permission: true } }, _count: { select: { tenantUsers: true, staffMembers: true } } },
    orderBy: { createdAt: 'asc' },
  });
  successResponse(res, roles);
});

export const createRole = wrap(async (req, res) => {
  const { name, slug, description, permissionIds } = req.body;
  const role = await prisma.role.create({
    data: { name, slug: slug || name.toLowerCase().replace(/\s+/g, '-'), description, scope: 'TENANT', tenantId: req.tenantId },
  });
  if (permissionIds?.length) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
    });
  }
  successResponse(res, role, 'Role created', 201);
});

export const updateRole = wrap(async (req, res) => {
  const { name, description } = req.body;
  const role = await prisma.role.update({
    where: { id: req.params.id },
    data: { name, description },
  });
  successResponse(res, role, 'Role updated');
});

export const deleteRole = wrap(async (req, res) => {
  await prisma.role.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  successResponse(res, null, 'Role deleted');
});

export const getPermissions = wrap(async (req, res) => {
  const permissions = await prisma.permission.findMany({ orderBy: { module: 'asc' } });
  successResponse(res, permissions);
});

export const updateRolePermissions = wrap(async (req, res) => {
  const { permissionIds } = req.body;
  const roleId = req.params.id;

  // Delete existing and recreate
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  if (permissionIds?.length) {
    await prisma.rolePermission.createMany({
      data: permissionIds.map((pid) => ({ roleId, permissionId: pid })),
    });
  }

  const role = await prisma.role.findUnique({
    where: { id: roleId },
    include: { permissions: { include: { permission: true } } },
  });
  successResponse(res, role, 'Permissions updated');
});

// ═══════════════════════════════════════════════════════════════
// BED VISUAL MAP
// ═══════════════════════════════════════════════════════════════

export const getBedMap = wrap(async (req, res) => {
  const { buildingId } = req.params;

  const floors = await prisma.floor.findMany({
    where: { buildingId, tenantId: req.tenantId, deletedAt: null },
    orderBy: { number: 'asc' },
    include: {
      rooms: {
        where: { deletedAt: null },
        orderBy: { number: 'asc' },
        include: {
          beds: {
            where: { deletedAt: null },
            orderBy: { label: 'asc' },
            include: {
              residents: {
                where: { status: 'ACTIVE', deletedAt: null },
                select: { id: true, firstName: true, lastName: true, gender: true, phone: true },
              },
            },
          },
        },
      },
    },
  });

  // Transform to visual map format
  const map = floors.map((floor) => ({
    id: floor.id,
    name: floor.name,
    number: floor.number,
    rooms: floor.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      number: room.number,
      status: room.status,
      beds: room.beds.map((bed) => {
        const resident = bed.residents?.[0] || null;
        return {
          id: bed.id,
          label: bed.label,
          status: bed.status,
          gender: resident?.gender || null,
          resident: resident ? { id: resident.id, name: `${resident.firstName} ${resident.lastName}`, gender: resident.gender, phone: resident.phone } : null,
        };
      }),
    })),
  }));

  successResponse(res, map);
});
