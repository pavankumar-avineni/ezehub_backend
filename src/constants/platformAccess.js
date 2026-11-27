import { PERMISSIONS, PLATFORM_ROLES } from './index.js';

/**
 * Platform-level access model (your own employees).
 *
 * Every platform permission code starts with `platform:` or `tenants:`. The tenant side filters out
 * those prefixes, so a tenant role can never receive them.
 */
export const isPlatformPermissionCode = (code) => code.startsWith('platform:') || code.startsWith('tenants:');

/** Text shown to admins when they build a role. */
export const PLATFORM_PERMISSION_INFO = {
  [PERMISSIONS.TENANTS_READ]: { group: 'Tenants', name: 'View tenants', description: 'See tenants you own (or all tenants with "View all tenants")' },
  [PERMISSIONS.TENANTS_CREATE]: { group: 'Tenants', name: 'Create tenants', description: 'Onboard a new tenant' },
  [PERMISSIONS.TENANTS_UPDATE]: { group: 'Tenants', name: 'Edit tenants', description: 'Edit tenant business details' },
  [PERMISSIONS.TENANTS_SUSPEND]: { group: 'Tenants', name: 'Suspend tenants', description: 'Suspend a tenant account' },
  [PERMISSIONS.TENANTS_ACTIVATE]: { group: 'Tenants', name: 'Activate tenants', description: 'Re-activate a suspended tenant' },
  [PERMISSIONS.TENANTS_DELETE]: { group: 'Tenants', name: 'Delete / dismiss tenants', description: 'Delete a tenant or dismiss it permanently' },
  [PERMISSIONS.PLATFORM_TENANTS_VIEW_ALL]: { group: 'Tenants', name: 'View all tenants', description: 'See every tenant, not only the ones you created or manage' },
  [PERMISSIONS.PLATFORM_TENANTS_ASSIGN]: { group: 'Tenants', name: 'Assign account managers', description: 'Choose which employee maintains a tenant' },
  [PERMISSIONS.PLATFORM_BILLING_READ]: { group: 'Billing', name: 'View billing', description: 'See invoices, rates, trials, features and prices' },
  [PERMISSIONS.PLATFORM_BILLING_MANAGE]: { group: 'Billing', name: 'Manage billing', description: 'Generate invoices, confirm or reject payments, put tenants on hold' },
  [PERMISSIONS.PLATFORM_PRICING_MANAGE]: { group: 'Billing', name: 'Control pricing', description: 'Change default rate, tenant rates, trials, tax, feature prices and tenant features' },
  [PERMISSIONS.PLATFORM_ANALYTICS]: { group: 'Insights', name: 'View analytics', description: 'Platform-wide analytics (needs "View all tenants")' },
  [PERMISSIONS.PLATFORM_REPORTS_READ]: { group: 'Insights', name: 'Team reports', description: 'Performance reports per employee' },
  [PERMISSIONS.PLATFORM_AUDIT_READ]: { group: 'Insights', name: 'View activity & login history', description: 'See who did what, and who logged in' },
  [PERMISSIONS.PLATFORM_SUPPORT]: { group: 'Support', name: 'Support desk', description: 'Support tools' },
  [PERMISSIONS.PLATFORM_EMPLOYEES_READ]: { group: 'Team', name: 'View employees', description: 'Employee directory and org chart' },
  [PERMISSIONS.PLATFORM_EMPLOYEES_MANAGE]: { group: 'Team', name: 'Manage employees', description: 'Create, edit, disable employees, reset passwords, assign roles' },
  [PERMISSIONS.PLATFORM_ROLES_MANAGE]: { group: 'Team', name: 'Manage roles', description: 'Create roles and choose their permissions' },
};

const P = PERMISSIONS;

/**
 * Ready-made roles. They are created once; after that the owner can tune them.
 * Super Admin always holds every platform permission.
 */
export const PRESET_ROLES = [
  {
    code: PLATFORM_ROLES.SUPER_ADMIN, name: 'Super Admin',
    description: 'Full access. Owns pricing, team and access control.',
    permissions: 'ALL',
  },
  {
    code: PLATFORM_ROLES.MANAGER, name: 'Manager',
    description: 'Runs day-to-day operations: tenants, assignments, team view and reports. No pricing or billing changes.',
    permissions: [
      P.TENANTS_READ, P.TENANTS_CREATE, P.TENANTS_UPDATE, P.TENANTS_SUSPEND, P.TENANTS_ACTIVATE,
      P.PLATFORM_TENANTS_VIEW_ALL, P.PLATFORM_TENANTS_ASSIGN, P.PLATFORM_EMPLOYEES_READ, P.PLATFORM_AUDIT_READ,
      P.PLATFORM_REPORTS_READ, P.PLATFORM_ANALYTICS, P.PLATFORM_BILLING_READ, P.PLATFORM_SUPPORT,
    ],
  },
  {
    code: PLATFORM_ROLES.SALES, name: 'Sales / Onboarding',
    description: 'Creates and edits tenants. Sees only tenants they created or manage. No billing access.',
    permissions: [P.TENANTS_READ, P.TENANTS_CREATE, P.TENANTS_UPDATE],
  },
  {
    code: PLATFORM_ROLES.SUPPORT, name: 'Support',
    description: 'Helps tenants. Can view every tenant and its billing, but cannot change anything.',
    permissions: [P.PLATFORM_SUPPORT, P.TENANTS_READ, P.PLATFORM_TENANTS_VIEW_ALL, P.PLATFORM_BILLING_READ],
  },
  {
    code: PLATFORM_ROLES.FINANCE, name: 'Finance',
    description: 'Invoices, payments and pricing for every tenant.',
    permissions: [
      P.TENANTS_READ, P.PLATFORM_TENANTS_VIEW_ALL, P.PLATFORM_BILLING_READ, P.PLATFORM_BILLING_MANAGE,
      P.PLATFORM_PRICING_MANAGE, P.PLATFORM_ANALYTICS, P.PLATFORM_REPORTS_READ,
    ],
  },
];

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'];
export const EMPLOYEE_STATUSES = ['ACTIVE', 'ON_LEAVE', 'EXITED'];

/** Activity log event names (stable codes the UI can filter on). */
export const ACTIVITY_EVENTS = [
  'tenant.created', 'tenant.updated', 'tenant.suspended', 'tenant.activated', 'tenant.deleted',
  'tenant.on_hold', 'tenant.dismissed', 'tenant.account_manager_changed',
  'billing.settings_updated', 'billing.rate_changed', 'billing.trial_changed',
  'feature.catalog_updated', 'feature.enabled', 'feature.disabled', 'feature.tenant_features_set', 'feature.price_changed',
  'invoice.generated', 'invoice.confirmed', 'invoice.rejected',
  'employee.created', 'employee.updated', 'employee.role_changed', 'employee.status_changed',
  'employee.password_reset', 'employee.sessions_revoked', 'employee.deleted', 'employee.password_changed',
  'role.created', 'role.updated', 'role.permissions_changed', 'role.deleted',
];
