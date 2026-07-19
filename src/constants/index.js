export const SUBSCRIPTION_PLANS = {
  STARTER: { buildingLimit: 3, deviceLimit: 3, apiAccess: false, whiteLabel: false, prioritySupport: false, price: 999 },
  GROWTH: { buildingLimit: 5, deviceLimit: 5, apiAccess: false, whiteLabel: false, prioritySupport: false, price: 2499 },
  BUSINESS: { buildingLimit: 20, deviceLimit: 10, apiAccess: true, whiteLabel: false, prioritySupport: true, price: 4999 },
  ENTERPRISE: { buildingLimit: -1, deviceLimit: -1, apiAccess: true, whiteLabel: true, prioritySupport: true, price: 9999 },
};

export const PLATFORM_ROLES = {
  SUPER_ADMIN: 'platform-super-admin',
  SUPPORT: 'platform-support',
};

export const TENANT_ROLES = {
  ADMIN: 'tenant-admin',
  BUILDING_MANAGER: 'building-manager',
  RECEPTIONIST: 'receptionist',
  ACCOUNTANT: 'accountant',
  SECURITY: 'security',
  HOUSEKEEPING: 'housekeeping',
  MAINTENANCE: 'maintenance-staff',
};

export const PERMISSIONS = {
  // Platform
  TENANTS_CREATE: 'tenants:create',
  TENANTS_READ: 'tenants:read',
  TENANTS_UPDATE: 'tenants:update',
  TENANTS_DELETE: 'tenants:delete',
  TENANTS_SUSPEND: 'tenants:suspend',
  TENANTS_ACTIVATE: 'tenants:activate',
  SUBSCRIPTIONS_MANAGE: 'subscriptions:manage',
  BILLING_MANAGE: 'billing:manage',
  DEVICES_MANAGE: 'devices:manage',
  PLATFORM_ANALYTICS: 'platform:analytics',
  PLATFORM_SUPPORT: 'platform:support',

  // Tenant - Buildings
  BUILDINGS_CREATE: 'buildings:create',
  BUILDINGS_READ: 'buildings:read',
  BUILDINGS_UPDATE: 'buildings:update',
  BUILDINGS_DELETE: 'buildings:delete',

  // Tenant - Floors/Rooms/Beds
  FLOORS_MANAGE: 'floors:manage',
  ROOMS_MANAGE: 'rooms:manage',
  BEDS_MANAGE: 'beds:manage',

  // Tenant - Residents
  RESIDENTS_CREATE: 'residents:create',
  RESIDENTS_READ: 'residents:read',
  RESIDENTS_UPDATE: 'residents:update',
  RESIDENTS_DELETE: 'residents:delete',
  RESIDENTS_CHECKIN: 'residents:checkin',
  RESIDENTS_CHECKOUT: 'residents:checkout',
  RESIDENTS_TRANSFER: 'residents:transfer',

  // Tenant - Staff
  STAFF_MANAGE: 'staff:manage',
  ATTENDANCE_MANAGE: 'attendance:manage',
  LEAVE_MANAGE: 'leave:manage',

  // Tenant - Inventory
  INVENTORY_MANAGE: 'inventory:manage',

  // Tenant - Rent & Payments
  RENT_MANAGE: 'rent:manage',
  PAYMENTS_MANAGE: 'payments:manage',
  INVOICES_MANAGE: 'invoices:manage',

  // Tenant - Complaints
  COMPLAINTS_CREATE: 'complaints:create',
  COMPLAINTS_READ: 'complaints:read',
  COMPLAINTS_MANAGE: 'complaints:manage',

  // Tenant - Visitors
  VISITORS_MANAGE: 'visitors:manage',

  // Tenant - Finance
  FINANCE_READ: 'finance:read',
  FINANCE_MANAGE: 'finance:manage',

  // Tenant - Maintenance
  MAINTENANCE_MANAGE: 'maintenance:manage',

  // Tenant - Reports
  REPORTS_READ: 'reports:read',
  REPORTS_EXPORT: 'reports:export',

  // Tenant - Settings
  SETTINGS_MANAGE: 'settings:manage',
  ROLES_MANAGE: 'roles:manage',
  USERS_MANAGE: 'users:manage',

  // Tenant - Documents
  DOCUMENTS_MANAGE: 'documents:manage',

  // Tenant - Notifications
  NOTIFICATIONS_MANAGE: 'notifications:manage',
};

export const BUILDING_TYPES = [
  { name: 'Paying Guest (PG)', slug: 'pg' },
  { name: 'Hostel', slug: 'hostel' },
  { name: 'Dormitory', slug: 'dormitory' },
  { name: 'Co-Living Space', slug: 'co-living' },
  { name: 'Service Apartment', slug: 'service-apartment' },
  { name: '1RK', slug: '1rk' },
  { name: '1BHK', slug: '1bhk' },
  { name: '2BHK', slug: '2bhk' },
  { name: '3BHK', slug: '3bhk' },
  { name: 'Villa', slug: 'villa' },
  { name: 'Guest House', slug: 'guest-house' },
  { name: 'Corporate Accommodation', slug: 'corporate' },
  { name: 'Rental Apartment', slug: 'rental-apartment' },
  { name: 'Other', slug: 'other' },
];

export const INVENTORY_CATEGORIES = [
  'Bed', 'Mattress', 'Furniture', 'Wardrobe', 'Chair', 'Table',
  'Fan', 'AC', 'TV', 'Gas Cylinder', 'Bucket', 'Mirror',
  'Curtains', 'Cleaning Equipment', 'Kitchen Equipment',
];

export const EXPENSE_CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Maintenance', 'Supplies',
  'Marketing', 'Insurance', 'Taxes', 'Equipment', 'Other',
];

export const INCOME_CATEGORIES = [
  'Rent', 'Deposit', 'Advance Rent', 'Electricity', 'Water',
  'WiFi', 'Laundry', 'Food', 'Parking', 'Late Fee', 'Other',
];

export const COMPLAINT_CATEGORIES = [
  'Plumbing', 'Electrical', 'Cleaning', 'Pest Control',
  'Food Quality', 'Noise', 'Security', 'WiFi', 'Other',
];

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};
