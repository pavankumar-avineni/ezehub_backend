/**
 * Product feature catalog.
 *
 * The CODE list below is owned by the code (routes are gated by these codes).
 * Prices, price type and availability are owned by the database (feature table)
 * and are edited by the platform super admin.
 *
 *  - isCore: always on for every tenant, covered by the per-bed rate, never priced.
 *  - requires: other features that must also be enabled.
 */
export const FEATURE_GROUPS = {
  PROPERTY: 'Property setup',
  RESIDENTS: 'Residents',
  MONEY: 'Money',
  OPERATIONS: 'Operations',
  COMMUNICATION: 'Communication & growth',
  INSIGHTS: 'Insights & admin',
  RESIDENT_APP: 'Resident app',
};

export const FEATURES = [
  // ── Core (included in the per-bed rate) ──
  { code: 'PROPERTY_SETUP', name: 'Property setup', group: FEATURE_GROUPS.PROPERTY, isCore: true, sortOrder: 10, description: 'Buildings, floors, rooms, beds, building types and the visual bed map.' },
  { code: 'RESIDENTS', name: 'Residents', group: FEATURE_GROUPS.RESIDENTS, isCore: true, sortOrder: 20, description: 'Resident records, check-in, transfer and checkout.' },
  { code: 'RENT_PAYMENTS', name: 'Rent & payments', group: FEATURE_GROUPS.MONEY, isCore: true, sortOrder: 30, description: 'Monthly rent generation, charges, payment recording, proof confirmation and payment settings.' },
  { code: 'DASHBOARD', name: 'Dashboard', group: FEATURE_GROUPS.INSIGHTS, isCore: true, sortOrder: 40, description: 'Tenant dashboard with occupancy, rent and complaint stats.' },
  { code: 'NOTIFICATIONS', name: 'Notifications', group: FEATURE_GROUPS.COMMUNICATION, isCore: true, sortOrder: 50, description: 'In-app notifications for staff and residents.' },
  { code: 'ROLES_ACCESS', name: 'Roles & permissions', group: FEATURE_GROUPS.INSIGHTS, isCore: true, sortOrder: 60, description: 'Custom roles and permission management for your team.' },

  // ── Add-ons (priced) ──
  { code: 'STAFF', name: 'Staff management', group: FEATURE_GROUPS.OPERATIONS, isCore: false, sortOrder: 100, description: 'Staff records, attendance and leave management.' },
  { code: 'INVENTORY', name: 'Inventory', group: FEATURE_GROUPS.OPERATIONS, isCore: false, sortOrder: 110, description: 'Asset register with QR codes, transfers, assignments, repairs, stock-take audits, valuation and export.' },
  { code: 'MAINTENANCE', name: 'Maintenance requests', group: FEATURE_GROUPS.OPERATIONS, isCore: false, sortOrder: 120, description: 'Maintenance request tracking and assignment.' },
  { code: 'COMPLAINTS', name: 'Complaints', group: FEATURE_GROUPS.OPERATIONS, isCore: false, sortOrder: 130, description: 'Complaint desk with assignment, status and comments (also used by the resident app).' },
  { code: 'VISITORS', name: 'Visitor management', group: FEATURE_GROUPS.OPERATIONS, isCore: false, sortOrder: 140, description: 'Visitor registration with OTP check-in and check-out (also used by the resident app).' },
  { code: 'FOOD_MENU', name: 'Food menu', group: FEATURE_GROUPS.OPERATIONS, isCore: false, sortOrder: 150, description: 'Weekly food menu per building (also shown in the resident app).' },
  { code: 'FINANCE', name: 'Finance', group: FEATURE_GROUPS.MONEY, isCore: false, sortOrder: 200, description: 'Income and expense records and the finance dashboard.' },
  { code: 'DISCOUNTS', name: 'Discounts', group: FEATURE_GROUPS.MONEY, isCore: false, sortOrder: 210, description: 'Discount rules for residents and buildings (also shown in the resident app).' },
  { code: 'ONLINE_PAYMENTS', name: 'Online rent payments', group: FEATURE_GROUPS.MONEY, isCore: false, sortOrder: 220, requires: ['RESIDENT_APP'], description: 'Residents pay rent online through Razorpay using your own Razorpay account.' },
  { code: 'PROMOTIONS', name: 'Promotions', group: FEATURE_GROUPS.COMMUNICATION, isCore: false, sortOrder: 300, description: 'Local business promotions shown to residents.' },
  { code: 'DOCUMENTS', name: 'Documents', group: FEATURE_GROUPS.COMMUNICATION, isCore: false, sortOrder: 310, description: 'Document upload and storage (also visible to residents).' },
  { code: 'REPORTS', name: 'Reports', group: FEATURE_GROUPS.INSIGHTS, isCore: false, sortOrder: 400, description: 'Occupancy and rent collection reports.' },
  { code: 'RESIDENT_APP', name: 'Resident app', group: FEATURE_GROUPS.RESIDENT_APP, isCore: false, sortOrder: 500, description: 'Resident login (OTP / password), profile, rent, payment proof and notifications for residents.' },
];

export const FEATURE_CODES = FEATURES.map((f) => f.code);
export const CORE_FEATURE_CODES = FEATURES.filter((f) => f.isCore).map((f) => f.code);
export const ADDON_FEATURE_CODES = FEATURES.filter((f) => !f.isCore).map((f) => f.code);
export const FEATURE_BY_CODE = Object.fromEntries(FEATURES.map((f) => [f.code, f]));

export const FEATURE_PRICE_LIMITS = { MIN: 0, MAX: 1000000 };
