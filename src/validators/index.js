import { z } from 'zod';

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

export const refreshTokenSchema = z.object({
  body: z.object({ refreshToken: z.string() }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(8),
  }),
});

export const createTenantSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(100),
    slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens').transform(val => val.toLowerCase()),
    email: z.string().email(),
    phone: z.string().regex(/^\d{10}$/, 'Phone must be 10 digits').optional().or(z.literal('')),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    pincode: z.string().optional(),
    plan: z.enum(['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE']).default('STARTER'),
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
  body: z.object({
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
    password: z.string().min(8).optional(),
  }),
});

export const createInventorySchema = z.object({
  body: z.object({
    buildingId: z.string().uuid(),
    roomId: z.string().uuid().optional(),
    name: z.string().min(1),
    category: z.string().min(1),
    uniqueCode: z.string().min(1).transform(val => val.toUpperCase()),
    purchaseDate: z.string().datetime().optional(),
    purchasePrice: z.number().min(0).optional(),
    warrantyUntil: z.string().datetime().optional(),
    condition: z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED', 'DISPOSED']).default('NEW'),
    notes: z.string().optional(),
  }),
});

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

export const updateSubscriptionSchema = z.object({
  params: z.object({ tenantId: z.string().uuid() }),
  body: z.object({
    plan: z.enum(['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE']).optional(),
    buildingLimit: z.number().int().optional(),
    deviceLimit: z.number().int().optional(),
    apiAccess: z.boolean().optional(),
    whiteLabel: z.boolean().optional(),
    prioritySupport: z.boolean().optional(),
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
