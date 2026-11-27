import { z } from 'zod';
import { ADDON_FEATURE_CODES, FEATURE_CODES } from '../constants/features.js';
import { EMPLOYMENT_TYPES, EMPLOYEE_STATUSES } from '../constants/platformAccess.js';

export const paginationSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const idParamSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    scope: z.enum(['PLATFORM', 'TENANT']).optional(),
  }),
});

export const signupSchema = z.object({
  body: z.object({
    businessName: z.string().min(2, 'Business name must be at least 2 characters').max(100),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    phone: z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
  }),
});

export const refreshTokenSchema = z.object({
  body: z.object({ refreshToken: z.string() }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(8),
  }),
});

// ── Resident authentication ──────────────────────────────────────────
const phoneSchema = z.string().regex(/^\d{10}$/, 'Phone must be 10 digits');

export const residentSendOtpSchema = z.object({
  body: z.object({ phone: phoneSchema }),
});

export const residentVerifyOtpSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    otp: z.string().regex(/^\d{4,6}$/, 'OTP must be 4-6 digits'),
  }),
});

export const residentLoginSchema = z.object({
  body: z.object({
    phone: phoneSchema,
    password: z.string().min(6),
  }),
});

// ── Resident self-service ────────────────────────────────────────────
export const residentPayRentSchema = z.object({
  params: z.object({ chargeId: z.string().uuid() }),
  body: z.object({
    transactionId: z.string().min(3, 'Transaction ID is required'),
    paymentMethod: z.string().optional(),
    amount: z.coerce.number().positive().optional(),
    notes: z.string().max(500).optional(),
  }),
});

export const residentCreateComplaintSchema = z.object({
  body: z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(3).max(2000),
    category: z.string().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    buildingId: z.string().uuid().optional(),
  }),
});

export const residentCreateVisitorSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    phone: phoneSchema,
    purpose: z.string().min(2).max(200),
  }),
});

export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits').optional().or(z.literal('')),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    // Optional per-tenant billing overrides. Leave out to use the platform defaults.
    ratePerBed: z.number().min(0).max(100000).multipleOf(0.01).optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    // Add-on feature codes to switch on for this tenant. Leave out to use the platform default set.
    features: z.array(z.enum(ADDON_FEATURE_CODES)).optional(),
    // Employee who will maintain the tenant. Defaults to the employee creating it.
    accountManagerId: z.string().uuid().optional(),
    adminFirstName: z.string().min(1),
    adminLastName: z.string().min(1),
    adminEmail: z.string().email(),
    adminPassword: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  }),
});

export const updateTenantSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().min(2).max(100).optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    gstNumber: z.string().optional(),
    panNumber: z.string().optional(),
    timezone: z.string().optional(),
    currency: z.string().optional(),
    settings: z.record(z.unknown()).optional(),
  }),
});

export const createBuildingSchema = z.object({
  body: z.object({
    buildingTypeId: z.string().min(1, 'Please select a building type'),
    name: z.string().min(2).max(100),
    code: z.string().min(2).max(20).transform(val => val.toUpperCase()),
    address: z.string().min(5),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').optional().or(z.literal('')),
    amenities: z.array(z.string()).optional(),
    settings: z.record(z.unknown()).optional(),
  }),
});

export const createFloorSchema = z.object({
  body: z.object({
    buildingId: z.string().uuid(),
    name: z.string().min(1),
    number: z.number().int().min(0),
  }),
});

export const createRoomSchema = z.object({
  body: z.object({
    floorId: z.string().uuid(),
    name: z.string().min(1),
    number: z.string().min(1).transform(val => val.toUpperCase()),
    type: z.string().optional(),
    capacity: z.number().int().min(1).default(1),
    rentAmount: z.number().min(0).default(0),
    amenities: z.array(z.string()).optional(),
  }),
});

export const createBedSchema = z.object({
  body: z.object({
    roomId: z.string().uuid(),
    label: z.string().min(1).transform(val => val.toUpperCase()),
    rentAmount: z.number().min(0).default(0),
  }),
});

export const createResidentSchema = z.object({
  body: z.object({
    bedId: z.string().uuid().optional(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(10),
    alternatePhone: z.string().optional(),
    dateOfBirth: z.string().datetime().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
    bloodGroup: z.enum(['A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE']).optional(),
    foodPreference: z.enum(['VEGETARIAN', 'NON_VEGETARIAN', 'VEGAN', 'JAIN']).optional(),
    occupation: z.string().optional(),
    company: z.string().optional(),
    college: z.string().optional(),
    idProofType: z.string().optional(),
    idProofNumber: z.string().optional(),
    emergencyContact: z.record(z.unknown()).optional(),
    parentDetails: z.record(z.unknown()).optional(),
    vehicleDetails: z.array(z.unknown()).optional(),
    parkingSlot: z.string().optional(),
    depositAmount: z.number().min(0).default(0),
    advanceRent: z.number().min(0).default(0),
    checkInDate: z.string().datetime().optional(),
    notes: z.string().optional(),
  }),
});

export const createStaffSchema = z.object({
  body: z
    .object({
      buildingId: z.string().uuid().optional(),
      roleId: z.string().uuid(),
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().min(10),
      department: z.string().optional(),
      designation: z.string().optional(),
      joiningDate: z.string().datetime(),
      salary: z.number().min(0).default(0),
      address: z.string().optional(),
      emergencyContact: z.record(z.unknown()).optional(),
      createUserAccount: z.boolean().default(false),
      // Optional separate email for the login account. The staff service
      // uses this when provided, falling back to `email`.
      loginEmail: z.string().email().optional().or(z.literal('')),
      password: z.string().min(8).optional(),
    })
    // When a login account is requested, a valid 8+ char password is required.
    .refine((d) => !d.createUserAccount || (d.password && d.password.length >= 8), {
      message: 'Password (min 8 characters) is required to create a login account',
      path: ['password'],
    }),
});

// ─── Inventory ──────────────────────────────────────────────────
const inventoryCondition = z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'DISPOSED']);
const inventoryStatus = z.enum(['IN_USE', 'IN_STORAGE', 'UNDER_REPAIR', 'LOST', 'DISPOSED']);
const dateString = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');
const trimmed = (max = 255) => z.string().trim().min(1).max(max);
const uniqueCodeField = z.string().trim().min(1).max(60).transform((v) => v.toUpperCase());
const csvBool = z.enum(['true', 'false']).transform((v) => v === 'true');

const inventoryItemFields = {
  buildingId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
  name: trimmed(),
  category: trimmed(100),
  uniqueCode: uniqueCodeField.optional(),
  serialNumber: z.string().trim().max(100).nullable().optional(),
  brand: z.string().trim().max(100).nullable().optional(),
  model: z.string().trim().max(100).nullable().optional(),
  vendor: z.string().trim().max(150).nullable().optional(),
  invoiceNumber: z.string().trim().max(100).nullable().optional(),
  purchaseDate: dateString.nullable().optional(),
  purchasePrice: z.number().min(0).nullable().optional(),
  salvageValue: z.number().min(0).nullable().optional(),
  usefulLifeYears: z.number().int().min(1).max(100).nullable().optional(),
  warrantyUntil: dateString.nullable().optional(),
  nextServiceDate: dateString.nullable().optional(),
  condition: inventoryCondition.default('NEW'),
  status: z.enum(['IN_USE', 'IN_STORAGE']).optional(),
  notes: z.string().max(2000).nullable().optional(),
};

export const createInventorySchema = z.object({
  body: z.object(inventoryItemFields),
});

export const bulkCreateInventorySchema = z.object({
  body: z.object({
    // Either an explicit list or a template repeated `quantity` times.
    items: z.array(z.object(inventoryItemFields)).min(1).max(200).optional(),
    template: z.object(inventoryItemFields).optional(),
    quantity: z.number().int().min(1).max(200).optional(),
  }).refine((b) => (b.items && !b.template) || (!b.items && b.template && b.quantity), {
    message: 'Provide either `items`, or `template` together with `quantity`',
  }),
});

export const updateInventorySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    ...inventoryItemFields,
    condition: inventoryCondition.optional(),
  }).omit({ buildingId: true, roomId: true, status: true }).partial()
    .refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});

export const transferInventorySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    toBuildingId: z.string().uuid().optional(),
    toRoomId: z.string().uuid().nullable().optional(),
    reason: z.string().max(500).optional(),
  }).refine((b) => b.toBuildingId !== undefined || b.toRoomId !== undefined, {
    message: 'Provide toBuildingId and/or toRoomId',
  }),
});

export const bulkTransferInventorySchema = z.object({
  body: z.object({
    itemIds: z.array(z.string().uuid()).min(1).max(200),
    toBuildingId: z.string().uuid().optional(),
    toRoomId: z.string().uuid().nullable().optional(),
    reason: z.string().max(500).optional(),
  }).refine((b) => b.toBuildingId !== undefined || b.toRoomId !== undefined, {
    message: 'Provide toBuildingId and/or toRoomId',
  }),
});

export const setInventoryStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['IN_USE', 'IN_STORAGE', 'LOST']),
    reason: z.string().max(500).optional(),
  }),
});

export const assignInventorySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    residentId: z.string().uuid(),
    notes: z.string().max(500).optional(),
  }),
});

export const unassignInventorySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    condition: inventoryCondition.optional(),
    notes: z.string().max(500).optional(),
  }).default({}),
});

export const disposeInventorySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    reason: z.string().trim().min(3).max(500),
    disposalValue: z.number().min(0).optional(),
  }),
});

export const listInventorySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    buildingId: z.string().uuid().optional(),
    roomId: z.string().uuid().optional(),
    category: z.string().optional(),
    condition: inventoryCondition.optional(),
    status: inventoryStatus.optional(),
    assignedResidentId: z.string().uuid().optional(),
    unassigned: csvBool.optional(),
    inStorage: csvBool.optional(),
    warrantyExpiringInDays: z.coerce.number().int().min(1).max(3650).optional(),
    warrantyExpired: csvBool.optional(),
    serviceDue: csvBool.optional(),
    purchasedFrom: dateString.optional(),
    purchasedTo: dateString.optional(),
    includeDisposed: csvBool.optional(),
    onlyDeleted: csvBool.optional(),
  }),
});

export const inventoryHistoryQuerySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
  }),
});

export const inventorySummarySchema = z.object({
  query: z.object({ buildingId: z.string().uuid().optional() }),
});

export const inventoryAlertsSchema = z.object({
  query: z.object({
    buildingId: z.string().uuid().optional(),
    days: z.coerce.number().int().min(1).max(365).default(30),
  }),
});

export const inventoryCodeParamSchema = z.object({
  params: z.object({ code: z.string().trim().min(1).max(60) }),
});

export const inventoryQrQuerySchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    format: z.enum(['png', 'json']).default('png'),
    size: z.coerce.number().int().min(100).max(1000).default(300),
  }),
});

export const inventoryAttachmentParamsSchema = z.object({
  params: z.object({ id: z.string().uuid(), attachmentId: z.string().uuid() }),
});

export const inventoryAttachmentUploadSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    kind: z.enum(['IMAGE', 'INVOICE', 'WARRANTY', 'OTHER']).default('IMAGE'),
  }).default({}),
});

export const createInventoryServiceLogSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    type: z.enum(['REPAIR', 'SERVICE', 'INSPECTION']).default('REPAIR'),
    description: z.string().trim().min(3).max(1000),
    vendor: z.string().trim().max(150).optional(),
    cost: z.number().min(0).optional(),
    nextServiceDate: dateString.optional(),
  }),
});

export const completeInventoryServiceLogSchema = z.object({
  params: z.object({ logId: z.string().uuid() }),
  body: z.object({
    resolution: z.string().max(1000).optional(),
    cost: z.number().min(0).optional(),
    nextServiceDate: dateString.optional(),
    condition: inventoryCondition.optional(),
    // When a cost is present, book it as a Maintenance expense in finance.
    recordExpense: z.boolean().default(true),
  }).default({}),
});

export const inventoryServiceLogIdSchema = z.object({
  params: z.object({ logId: z.string().uuid() }),
});

export const listInventoryServiceLogsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
    type: z.enum(['REPAIR', 'SERVICE', 'INSPECTION']).optional(),
    buildingId: z.string().uuid().optional(),
    inventoryItemId: z.string().uuid().optional(),
  }),
});

export const listItemInventoryServiceLogsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
    type: z.enum(['REPAIR', 'SERVICE', 'INSPECTION']).optional(),
  }),
});

export const createInventoryAuditSchema = z.object({
  body: z.object({
    buildingId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(150).optional(),
    notes: z.string().max(1000).optional(),
  }),
});

export const listInventoryAuditsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    status: z.enum(['IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
    buildingId: z.string().uuid().optional(),
  }),
});

export const inventoryAuditDetailSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  query: z.object({
    result: z.enum(['PENDING', 'FOUND', 'MISSING', 'UNEXPECTED']).optional(),
  }),
});

export const scanInventoryAuditSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    // Accepts a raw unique code or the QR payload (EZEHUB:INV:<code>)
    code: z.string().trim().min(1).max(100),
    foundRoomId: z.string().uuid().optional(),
    notes: z.string().max(500).optional(),
  }),
});

export const completeInventoryAuditSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    markMissingAsLost: z.boolean().default(false),
    notes: z.string().max(1000).optional(),
  }).default({}),
});

export const inventoryExportSchema = listInventorySchema;

export const createPaymentSchema = z.object({
  body: z.object({
    residentId: z.string().uuid(),
    rentChargeId: z.string().uuid().optional(),
    amount: z.number().positive(),
    method: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE']),
    transactionId: z.string().optional(),
    notes: z.string().optional(),
  }),
});

export const createComplaintSchema = z.object({
  body: z.object({
    buildingId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    residentId: z.string().uuid(),
    title: z.string().min(3),
    description: z.string().min(10),
    category: z.string().min(1),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  }),
});

export const createVisitorSchema = z.object({
  body: z.object({
    buildingId: z.string().uuid(),
    name: z.string().min(2),
    phone: z.string().min(10),
    email: z.string().email().optional(),
    purpose: z.string().min(3),
    hostName: z.string().optional(),
    hostPhone: z.string().optional(),
    residentId: z.string().uuid().optional(),
    idProofType: z.string().optional(),
    idProofNumber: z.string().optional(),
    vehicleNumber: z.string().optional(),
  }),
});

export const createFinanceRecordSchema = z.object({
  body: z.object({
    buildingId: z.string().uuid().optional(),
    category: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().optional(),
    date: z.string(),
    reference: z.string().optional(),
  }),
});

export const createMaintenanceSchema = z.object({
  body: z.object({
    buildingId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    title: z.string().min(3),
    description: z.string().min(10),
    category: z.string().min(1),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    scheduledDate: z.string().datetime().optional(),
    assignedStaffId: z.string().uuid().optional(),
  }),
});

export const createNotificationSchema = z.object({
  body: z.object({
    userId: z.string().uuid(),
    userType: z.string(),
    title: z.string().min(1),
    message: z.string().min(1),
    channel: z.enum(['PUSH', 'EMAIL', 'SMS', 'WHATSAPP', 'IN_APP']).default('IN_APP'),
    scheduledAt: z.string().datetime().optional(),
    data: z.record(z.unknown()).optional(),
  }),
});

// ─── Roles & permissions (tenant) ───────────────────────────────
export const createRoleSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(300).optional(),
    permissionIds: z.array(z.string().uuid()).max(200).optional(),
  }),
});

export const updateRoleSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(300).optional(),
  }).refine((b) => b.name !== undefined || b.description !== undefined, { message: 'Provide name or description' }),
});

export const updateRolePermissionsSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    // The complete permission list for the role. Send [] to remove every permission.
    permissionIds: z.array(z.string().uuid()).max(200),
  }),
});

// ─── Platform team: employees, roles, assignments, activity ─────
const phone10 = z.string().regex(/^\d{10}$/, 'Phone must be 10 digits');
const uuid = z.string().uuid();
const strongPassword = z.string().min(8).max(100).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain an uppercase letter, a lowercase letter and a number');

const employeeFields = {
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  phone: phone10.nullable().optional(),
  personalEmail: z.string().email().nullable().optional(),
  personalPhone: phone10.nullable().optional(),
  department: z.string().trim().max(100).nullable().optional(),
  designation: z.string().trim().max(100).nullable().optional(),
  reportsToId: uuid.nullable().optional(),
  joiningDate: dateString.nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  address: z.string().trim().max(300).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  pincode: z.string().regex(/^\d{6}$/, 'Pincode must be 6 digits').nullable().optional(),
  emergencyContact: z.object({
    name: z.string().trim().max(100).optional(),
    relation: z.string().trim().max(50).optional(),
    phone: phone10.optional(),
  }).optional(),
  idProofType: z.string().trim().max(50).nullable().optional(),
  idProofNumber: z.string().trim().max(50).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  avatar: z.string().trim().max(500).nullable().optional(),
};

export const createEmployeeSchema = z.object({
  body: z.object({
    ...employeeFields,
    email: z.string().trim().email().max(150),
    roleId: uuid,
    // Optional. When left out a strong temporary password is generated and returned once.
    password: strongPassword.optional(),
  }),
});

export const updateEmployeeSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object(employeeFields).partial().refine((b) => Object.keys(b).length > 0, { message: 'No fields to update' }),
});

export const listEmployeesSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    status: z.enum(EMPLOYEE_STATUSES).optional(),
    isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    roleId: uuid.optional(),
    department: z.string().optional(),
    reportsToId: uuid.optional(),
  }),
});

export const setEmployeeRoleSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ roleId: uuid }),
});

export const setEmployeeStatusSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    status: z.enum(EMPLOYEE_STATUSES),
    reason: z.string().trim().max(300).optional(),
    exitDate: dateString.optional(),
    // When an employee leaves, the tenants they maintain must go to someone.
    reassignTenantsTo: uuid.optional(),
  }),
});

export const resetEmployeePasswordSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ password: strongPassword.optional() }).default({}),
});

export const employeeTenantsQuerySchema = z.object({
  params: z.object({ id: uuid }),
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    relation: z.enum(['managed', 'created', 'all']).default('managed'),
  }),
});

export const activityQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    actorId: uuid.optional(),
    tenantId: uuid.optional(),
    entity: z.string().max(50).optional(),
    entityId: z.string().max(100).optional(),
    event: z.string().max(80).optional(),
    from: dateString.optional(),
    to: dateString.optional(),
    search: z.string().max(100).optional(),
  }),
});

export const employeeActivityQuerySchema = z.object({
  params: z.object({ id: uuid }),
  query: activityQuerySchema.shape.query,
});

export const loginHistoryQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    userId: uuid.optional(),
    success: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    from: dateString.optional(),
    to: dateString.optional(),
  }),
});

export const employeeLoginHistoryQuerySchema = z.object({
  params: z.object({ id: uuid }),
  query: loginHistoryQuerySchema.shape.query.omit({ userId: true }),
});

export const listPlatformTenantsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    search: z.string().optional(),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    status: z.string().optional(),
    accountManagerId: uuid.optional(),
    createdById: uuid.optional(),
    unassigned: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  }),
});

export const assignAccountManagerSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    // null = leave the tenant without an account manager
    accountManagerId: uuid.nullable(),
    reason: z.string().trim().max(300).optional(),
  }),
});

export const bulkAssignTenantsSchema = z.object({
  body: z.object({
    tenantIds: z.array(uuid).min(1).max(200),
    accountManagerId: uuid.nullable(),
    reason: z.string().trim().max(300).optional(),
  }),
});

export const createPlatformRoleSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(300).optional(),
    permissionIds: z.array(uuid).max(100).optional(),
  }),
});

export const updatePlatformRoleSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(300).optional(),
  }).refine((b) => b.name !== undefined || b.description !== undefined, { message: 'Provide name or description' }),
});

export const setPlatformRolePermissionsSchema = z.object({
  params: z.object({ id: uuid }),
  body: z.object({ permissionIds: z.array(uuid).max(100) }),
});

export const teamReportQuerySchema = z.object({
  query: z.object({
    from: dateString.optional(),
    to: dateString.optional(),
  }),
});

// ─── Per-bed billing (platform controls) ────────────────────────
const rateField = z.number().min(0).max(100000).multipleOf(0.01);

export const updateBillingSettingsSchema = z.object({
  body: z.object({
    defaultRatePerBed: rateField.optional(),
    trialDays: z.number().int().min(0).max(365).optional(),
    taxPercent: z.number().min(0).max(100).multipleOf(0.01).optional(),
    // Add-on features given to new tenants when none are chosen (self sign-up and "create tenant" without `features`).
    defaultFeatures: z.array(z.enum(ADDON_FEATURE_CODES)).optional(),
    // Re-price tenants that are on the default rate (custom-rate tenants are never touched).
    applyToExistingTenants: z.boolean().default(false),
  }).refine(
    (b) => b.defaultRatePerBed !== undefined || b.trialDays !== undefined || b.taxPercent !== undefined || b.defaultFeatures !== undefined,
    { message: 'Provide at least one of defaultRatePerBed, trialDays, taxPercent, defaultFeatures' },
  ).refine(
    (b) => !b.applyToExistingTenants || b.defaultRatePerBed !== undefined,
    { message: 'applyToExistingTenants only makes sense together with defaultRatePerBed', path: ['applyToExistingTenants'] },
  ),
});

export const tenantIdParamSchema = z.object({
  params: z.object({ tenantId: z.string().uuid() }),
});

export const setTenantRateSchema = z.object({
  params: z.object({ tenantId: z.string().uuid() }),
  body: z.object({
    ratePerBed: rateField.optional(),
    // true = stop using a custom rate and follow the platform default again
    useDefault: z.boolean().optional(),
    reason: z.string().trim().max(300).optional(),
  }).refine((b) => (b.ratePerBed !== undefined) !== (b.useDefault === true), {
    message: 'Provide either ratePerBed, or useDefault: true',
  }),
});

// ─── Feature catalog + per-tenant features (platform controls) ──
const featurePrice = z.number().min(0).max(1000000).multipleOf(0.01);
const featureCodeParam = z.enum(FEATURE_CODES);

export const featureCodeParamSchema = z.object({
  params: z.object({ code: featureCodeParam }),
});

export const updateCatalogFeatureSchema = z.object({
  params: z.object({ code: featureCodeParam }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    price: featurePrice.optional(),
    // PER_BED = price x beds per month, FLAT = price per tenant per month
    priceType: z.enum(['PER_BED', 'FLAT']).optional(),
    // false = cannot be newly assigned (tenants that already have it keep it)
    isActive: z.boolean().optional(),
    reason: z.string().trim().max(300).optional(),
  }).refine(
    (b) => ['name', 'description', 'price', 'priceType', 'isActive'].some((k) => b[k] !== undefined),
    { message: 'Provide at least one field to change' },
  ),
});

export const setTenantFeaturesSchema = z.object({
  params: z.object({ tenantId: z.string().uuid() }),
  body: z.object({
    // The complete list of add-ons the tenant should have. Core features are always on.
    features: z.array(z.enum(ADDON_FEATURE_CODES)),
    reason: z.string().trim().max(300).optional(),
  }),
});

export const tenantFeatureActionSchema = z.object({
  params: z.object({ tenantId: z.string().uuid(), code: z.enum(ADDON_FEATURE_CODES) }),
  body: z.object({ reason: z.string().trim().max(300).optional() }).default({}),
});

export const setTenantFeaturePriceSchema = z.object({
  params: z.object({ tenantId: z.string().uuid(), code: z.enum(ADDON_FEATURE_CODES) }),
  body: z.object({
    price: featurePrice.optional(),
    // true = go back to the catalog price
    useCatalogPrice: z.boolean().optional(),
    reason: z.string().trim().max(300).optional(),
  }).refine((b) => (b.price !== undefined) !== (b.useCatalogPrice === true), {
    message: 'Provide either price, or useCatalogPrice: true',
  }),
});

export const featureHistoryQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    tenantId: z.string().uuid().optional(),
    featureCode: featureCodeParam.optional(),
    scope: z.enum(['catalog']).optional(),
  }),
});

export const setTenantTrialSchema = z.object({
  params: z.object({ tenantId: z.string().uuid() }),
  body: z.object({
    trialEndsAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date').optional(),
    extendDays: z.number().int().min(1).max(365).optional(),
  }).refine((b) => (b.trialEndsAt !== undefined) !== (b.extendDays !== undefined), {
    message: 'Provide either trialEndsAt or extendDays',
  }),
});

export const createTenantUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().optional(),
    roleId: z.string().uuid(),
  }),
});

export const transferResidentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    toBedId: z.string().uuid(),
    reason: z.string().optional(),
  }),
});

export const checkoutResidentSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    checkOutDate: z.string().datetime().optional(),
    notes: z.string().optional(),
  }),
});

export const assignComplaintSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ assignedStaffId: z.string().uuid() }),
});

export const updateComplaintStatusSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({
    status: z.enum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REJECTED']),
    resolution: z.string().optional(),
  }),
});

export const verifyVisitorOtpSchema = z.object({
  params: z.object({ id: z.string().uuid() }),
  body: z.object({ otp: z.string().length(6) }),
});

export const attendanceSchema = z.object({
  body: z.object({
    staffId: z.string().uuid(),
    date: z.string(),
    checkIn: z.string().datetime().optional(),
    checkOut: z.string().datetime().optional(),
    status: z.enum(['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE', 'ON_LEAVE']).default('PRESENT'),
    notes: z.string().optional(),
  }),
});

export const leaveRequestSchema = z.object({
  body: z.object({
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().min(5),
  }),
});

export const generateRentSchema = z.object({
  body: z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2020),
    buildingId: z.string().uuid().optional(),
  }),
});
