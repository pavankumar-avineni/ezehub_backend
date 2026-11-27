import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';
import { PLATFORM_ROLES, BUILDING_TYPES, BILLING_DEFAULTS } from '../src/constants/index.js';
import platformAccess from '../src/services/platformAccess.service.js';
import { FEATURES, ADDON_FEATURE_CODES } from '../src/constants/features.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Permissions + the ready-made platform roles (Super Admin, Manager, Sales, Support, Finance).
  // topUp also gives existing ready-made roles any default permission they are missing.
  await platformAccess.ensureDefaults({ topUp: true });
  console.log('Platform permissions and roles are ready');

  const superAdminRole = await prisma.role.findFirst({
    where: { code: PLATFORM_ROLES.SUPER_ADMIN, tenantId: null },
  });

  await prisma.platformUser.upsert({
    where: { email: 'admin@ezehub.com' },
    update: {},
    create: {
      email: 'admin@ezehub.com',
      passwordHash: await hashPassword('Admin@123456'),
      firstName: 'Super',
      lastName: 'Admin',
      employeeCode: 'EMP-0001',
      roleId: superAdminRole.id,
    },
  });

  console.log('Platform admin created: admin@ezehub.com / Admin@123456');

  // Feature catalog (prices start at 0; the super admin sets them).
  for (const f of FEATURES) {
    await prisma.feature.upsert({
      where: { code: f.code },
      update: { group: f.group, isCore: f.isCore, sortOrder: f.sortOrder },
      create: { code: f.code, name: f.name, description: f.description, group: f.group, isCore: f.isCore, sortOrder: f.sortOrder },
    });
  }
  console.log(`Feature catalog ready (${FEATURES.length} features)`);

  // Billing defaults: Rs 20 per bed per month, 15-day free trial, no tax (editable by the super admin).
  await prisma.billingSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default', defaultRatePerBed: BILLING_DEFAULTS.RATE_PER_BED, trialDays: BILLING_DEFAULTS.TRIAL_DAYS,
      taxPercent: BILLING_DEFAULTS.TAX_PERCENT, defaultFeatures: ADDON_FEATURE_CODES,
    },
  });

  for (const bt of BUILDING_TYPES) {
    const existing = await prisma.buildingType.findFirst({
      where: { name: bt.name, tenantId: null },
    });
    if (!existing) {
      await prisma.buildingType.create({
        data: { name: bt.name, isSystem: true },
      });
    }
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
