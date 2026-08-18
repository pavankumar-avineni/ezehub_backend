import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requireTenant } from '../middleware/authorize.js';
import { tenantIsolation } from '../middleware/tenant.js';
import { validate } from '../middleware/validate.js';
import { uploadSingle } from '../middleware/upload.js';
import { PERMISSIONS } from '../constants/index.js';
import {
  createBuildingSchema, createFloorSchema, createRoomSchema, createBedSchema,
  createResidentSchema, createStaffSchema, createInventorySchema, createPaymentSchema,
  createComplaintSchema, createVisitorSchema, createFinanceRecordSchema, createMaintenanceSchema,
  createNotificationSchema, transferResidentSchema, checkoutResidentSchema,
  assignComplaintSchema, updateComplaintStatusSchema, verifyVisitorOtpSchema,
  attendanceSchema, leaveRequestSchema, generateRentSchema, idParamSchema, paginationSchema,
} from '../validators/index.js';

// Middleware to block write ops for ON_HOLD tenants
const requireActiveSubscription = (req, res, next) => {
  if (req.user?.isOnHold && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return res.status(403).json({ success: false, message: 'Your subscription is on hold. Please renew to continue.' });
  }
  next();
};
import * as ctrl from '../controllers/tenant-modules.controller.js';

const router = Router();

router.use(authenticate, requireTenant, tenantIsolation, requireActiveSubscription);

// Dashboard & Reports
router.get('/dashboard', ctrl.getTenantDashboard);
router.get('/reports/occupancy', authorize(PERMISSIONS.REPORTS_READ), ctrl.getOccupancyReport);
router.get('/reports/rent-collection', authorize(PERMISSIONS.REPORTS_READ), ctrl.getRentCollectionReport);

// Buildings
router.get('/buildings', authorize(PERMISSIONS.BUILDINGS_READ), validate(paginationSchema), ctrl.getBuildings);
router.post('/buildings', authorize(PERMISSIONS.BUILDINGS_CREATE), validate(createBuildingSchema), ctrl.createBuilding);
router.get('/buildings/:id', authorize(PERMISSIONS.BUILDINGS_READ), validate(idParamSchema), ctrl.getBuilding);
router.get('/buildings/:id/stats', authorize(PERMISSIONS.BUILDINGS_READ), validate(idParamSchema), ctrl.getBuildingStats);
router.get('/building-types', ctrl.getBuildingTypes);
router.put('/buildings/:id', authorize(PERMISSIONS.BUILDINGS_UPDATE), validate(idParamSchema), ctrl.updateBuilding);
router.delete('/buildings/:id', authorize(PERMISSIONS.BUILDINGS_DELETE), validate(idParamSchema), ctrl.deleteBuilding);

// Floors
router.get('/floors', authorize(PERMISSIONS.FLOORS_MANAGE), validate(paginationSchema), ctrl.getFloors);
router.post('/floors', authorize(PERMISSIONS.FLOORS_MANAGE), validate(createFloorSchema), ctrl.createFloor);
router.get('/floors/:id', authorize(PERMISSIONS.FLOORS_MANAGE), validate(idParamSchema), ctrl.getFloor);
router.put('/floors/:id', authorize(PERMISSIONS.FLOORS_MANAGE), validate(idParamSchema), ctrl.updateFloor);
router.delete('/floors/:id', authorize(PERMISSIONS.FLOORS_MANAGE), validate(idParamSchema), ctrl.deleteFloor);

// Rooms
router.get('/rooms', authorize(PERMISSIONS.ROOMS_MANAGE), validate(paginationSchema), ctrl.getRooms);
router.post('/rooms', authorize(PERMISSIONS.ROOMS_MANAGE), validate(createRoomSchema), ctrl.createRoom);
router.get('/rooms/:id', authorize(PERMISSIONS.ROOMS_MANAGE), validate(idParamSchema), ctrl.getRoom);
router.put('/rooms/:id', authorize(PERMISSIONS.ROOMS_MANAGE), validate(idParamSchema), ctrl.updateRoom);
router.delete('/rooms/:id', authorize(PERMISSIONS.ROOMS_MANAGE), validate(idParamSchema), ctrl.deleteRoom);

// Beds
router.get('/beds', authorize(PERMISSIONS.BEDS_MANAGE), validate(paginationSchema), ctrl.getBeds);
router.post('/beds', authorize(PERMISSIONS.BEDS_MANAGE), validate(createBedSchema), ctrl.createBed);
router.get('/beds/:id', authorize(PERMISSIONS.BEDS_MANAGE), validate(idParamSchema), ctrl.getBed);
router.put('/beds/:id', authorize(PERMISSIONS.BEDS_MANAGE), validate(idParamSchema), ctrl.updateBed);
router.delete('/beds/:id', authorize(PERMISSIONS.BEDS_MANAGE), validate(idParamSchema), ctrl.deleteBed);

// Residents
router.get('/residents', authorize(PERMISSIONS.RESIDENTS_READ), validate(paginationSchema), ctrl.getResidents);
router.post('/residents', authorize(PERMISSIONS.RESIDENTS_CREATE), validate(createResidentSchema), ctrl.createResident);
router.get('/residents/:id', authorize(PERMISSIONS.RESIDENTS_READ), validate(idParamSchema), ctrl.getResident);
router.put('/residents/:id', authorize(PERMISSIONS.RESIDENTS_UPDATE), validate(idParamSchema), ctrl.updateResident);
router.post('/residents/:id/transfer', authorize(PERMISSIONS.RESIDENTS_TRANSFER), validate(transferResidentSchema), ctrl.transferResident);
router.post('/residents/:id/checkout', authorize(PERMISSIONS.RESIDENTS_CHECKOUT), validate(checkoutResidentSchema), ctrl.checkoutResident);
router.delete('/residents/:id', authorize(PERMISSIONS.RESIDENTS_DELETE), validate(idParamSchema), ctrl.deleteResident);

// Staff
router.get('/staff', authorize(PERMISSIONS.STAFF_MANAGE), validate(paginationSchema), ctrl.getStaff);
router.post('/staff', authorize(PERMISSIONS.STAFF_MANAGE), validate(createStaffSchema), ctrl.createStaff);
router.get('/staff/:id', authorize(PERMISSIONS.STAFF_MANAGE), validate(idParamSchema), ctrl.getStaffMember);
router.put('/staff/:id', authorize(PERMISSIONS.STAFF_MANAGE), validate(idParamSchema), ctrl.updateStaff);
router.delete('/staff/:id', authorize(PERMISSIONS.STAFF_MANAGE), validate(idParamSchema), ctrl.deleteStaff);
router.post('/attendance', authorize(PERMISSIONS.ATTENDANCE_MANAGE), validate(attendanceSchema), ctrl.recordAttendance);
router.post('/staff/:id/leave', authorize(PERMISSIONS.LEAVE_MANAGE), validate(leaveRequestSchema), ctrl.createLeaveRequest);
router.put('/staff/:id/leave/:leaveId', authorize(PERMISSIONS.LEAVE_MANAGE), ctrl.updateLeaveStatus);

// Inventory
router.get('/inventory', authorize(PERMISSIONS.INVENTORY_MANAGE), validate(paginationSchema), ctrl.getInventory);
router.post('/inventory', authorize(PERMISSIONS.INVENTORY_MANAGE), validate(createInventorySchema), ctrl.createInventory);
router.get('/inventory/:id', authorize(PERMISSIONS.INVENTORY_MANAGE), validate(idParamSchema), ctrl.getInventoryItem);
router.put('/inventory/:id', authorize(PERMISSIONS.INVENTORY_MANAGE), validate(idParamSchema), ctrl.updateInventory);
router.delete('/inventory/:id', authorize(PERMISSIONS.INVENTORY_MANAGE), validate(idParamSchema), ctrl.deleteInventory);

// Rent & Payments
router.post('/rent/generate', authorize(PERMISSIONS.RENT_MANAGE), validate(generateRentSchema), ctrl.generateRent);
router.get('/rent/charges', authorize(PERMISSIONS.RENT_MANAGE), validate(paginationSchema), ctrl.getRentCharges);
router.put('/rent/charges/:id', authorize(PERMISSIONS.RENT_MANAGE), validate(idParamSchema), ctrl.updateRentCharge);
router.get('/rent/outstanding', authorize(PERMISSIONS.RENT_MANAGE), ctrl.getOutstandingBalance);
router.get('/payments', authorize(PERMISSIONS.PAYMENTS_MANAGE), validate(paginationSchema), ctrl.getPayments);
router.post('/payments', authorize(PERMISSIONS.PAYMENTS_MANAGE), validate(createPaymentSchema), ctrl.recordPayment);
router.get('/payments/pending-proofs', authorize(PERMISSIONS.PAYMENTS_MANAGE), ctrl.getPendingPaymentProofs);
router.post('/payments/:paymentId/confirm', authorize(PERMISSIONS.PAYMENTS_MANAGE), ctrl.confirmResidentPayment);
router.post('/payments/:paymentId/reject', authorize(PERMISSIONS.PAYMENTS_MANAGE), ctrl.rejectResidentPayment);

// Payment Settings (UPI, QR, Bank details for residents)
router.get('/settings/payment', ctrl.getPaymentSettings);
router.put('/settings/payment', ctrl.updatePaymentSettings);

// Complaints
router.get('/complaints', authorize(PERMISSIONS.COMPLAINTS_READ), validate(paginationSchema), ctrl.getComplaints);
router.post('/complaints', authorize(PERMISSIONS.COMPLAINTS_CREATE), validate(createComplaintSchema), ctrl.createComplaint);
router.get('/complaints/:id', authorize(PERMISSIONS.COMPLAINTS_READ), validate(idParamSchema), ctrl.getComplaint);
router.post('/complaints/:id/assign', authorize(PERMISSIONS.COMPLAINTS_MANAGE), validate(assignComplaintSchema), ctrl.assignComplaint);
router.put('/complaints/:id/status', authorize(PERMISSIONS.COMPLAINTS_MANAGE), validate(updateComplaintStatusSchema), ctrl.updateComplaintStatus);
router.post('/complaints/:id/comments', authorize(PERMISSIONS.COMPLAINTS_READ), validate(idParamSchema), ctrl.addComplaintComment);

// Visitors
router.get('/visitors', authorize(PERMISSIONS.VISITORS_MANAGE), validate(paginationSchema), ctrl.getVisitors);
router.post('/visitors', authorize(PERMISSIONS.VISITORS_MANAGE), validate(createVisitorSchema), ctrl.createVisitor);
router.get('/visitors/:id', authorize(PERMISSIONS.VISITORS_MANAGE), validate(idParamSchema), ctrl.getVisitor);
router.post('/visitors/:id/verify-otp', authorize(PERMISSIONS.VISITORS_MANAGE), validate(verifyVisitorOtpSchema), ctrl.verifyVisitorOtp);
router.post('/visitors/:id/check-in', authorize(PERMISSIONS.VISITORS_MANAGE), validate(idParamSchema), ctrl.checkInVisitor);
router.post('/visitors/:id/check-out', authorize(PERMISSIONS.VISITORS_MANAGE), validate(idParamSchema), ctrl.checkOutVisitor);

// Finance
router.get('/finance/dashboard', authorize(PERMISSIONS.FINANCE_READ), ctrl.getFinanceDashboard);
router.get('/finance/income', authorize(PERMISSIONS.FINANCE_READ), validate(paginationSchema), ctrl.getIncome);
router.post('/finance/income', authorize(PERMISSIONS.FINANCE_MANAGE), validate(createFinanceRecordSchema), ctrl.createIncome);
router.get('/finance/expenses', authorize(PERMISSIONS.FINANCE_READ), validate(paginationSchema), ctrl.getExpenses);
router.post('/finance/expenses', authorize(PERMISSIONS.FINANCE_MANAGE), validate(createFinanceRecordSchema), ctrl.createExpense);

// Maintenance
router.get('/maintenance', authorize(PERMISSIONS.MAINTENANCE_MANAGE), validate(paginationSchema), ctrl.getMaintenance);
router.post('/maintenance', authorize(PERMISSIONS.MAINTENANCE_MANAGE), validate(createMaintenanceSchema), ctrl.createMaintenance);
router.get('/maintenance/:id', authorize(PERMISSIONS.MAINTENANCE_MANAGE), validate(idParamSchema), ctrl.getMaintenanceRequest);
router.put('/maintenance/:id', authorize(PERMISSIONS.MAINTENANCE_MANAGE), validate(idParamSchema), ctrl.updateMaintenance);

// Documents
router.get('/documents', authorize(PERMISSIONS.DOCUMENTS_MANAGE), validate(paginationSchema), ctrl.getDocuments);
router.post('/documents/upload', authorize(PERMISSIONS.DOCUMENTS_MANAGE), uploadSingle('file'), ctrl.uploadDocument);
router.delete('/documents/:id', authorize(PERMISSIONS.DOCUMENTS_MANAGE), validate(idParamSchema), ctrl.deleteDocument);

// Notifications
router.get('/notifications', ctrl.getNotifications);
router.post('/notifications', authorize(PERMISSIONS.NOTIFICATIONS_MANAGE), validate(createNotificationSchema), ctrl.createNotification);
router.put('/notifications/:id/read', validate(idParamSchema), ctrl.markNotificationRead);
router.put('/notifications/read-all', ctrl.markAllNotificationsRead);

// Discounts
router.get('/discounts', ctrl.getDiscounts);
router.post('/discounts', ctrl.createDiscount);
router.get('/discounts/:id', ctrl.getDiscount);
router.put('/discounts/:id', ctrl.updateDiscount);
router.delete('/discounts/:id', ctrl.deleteDiscount);

// Promotions
router.get('/promotions', ctrl.getPromotions);
router.post('/promotions', ctrl.createPromotion);
router.get('/promotions/:id', ctrl.getPromotion);
router.put('/promotions/:id', ctrl.updatePromotion);
router.delete('/promotions/:id', ctrl.deletePromotion);

// Food Menu
router.get('/menu/:buildingId', ctrl.getWeeklyMenu);
router.get('/menu/:buildingId/today', ctrl.getTodayMenu);
router.post('/menu', ctrl.upsertMenu);
router.post('/menu/bulk', ctrl.bulkUpsertMenu);
router.delete('/menu/:id', ctrl.deleteMenu);

// Roles & Permissions
router.get('/roles', ctrl.getRoles);
router.post('/roles', ctrl.createRole);
router.put('/roles/:id', ctrl.updateRole);
router.delete('/roles/:id', ctrl.deleteRole);
router.get('/permissions', ctrl.getPermissions);
router.put('/roles/:id/permissions', ctrl.updateRolePermissions);

// Bed Visual Map
router.get('/bed-map/:buildingId', ctrl.getBedMap);

export default router;
