import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { PERMISSIONS, TENANT_ROLES, BUILDING_TYPES } from '../constants/index.js';
import { parsePagination, parseSort, parseSearch } from '../utils/response.js';
import billingService from './billing.service.js';
import featureService from './feature.service.js';

class TenantService {
  async create(data) {
    const existing = await prisma.tenant.findFirst({
      where: { email: data.email },
    });
    if (existing) throw new ConflictError('Tenant with this email already exists');

    const passwordHash = await hashPassword(data.adminPassword);

    // Add-on features: the platform admin picks them, otherwise the platform default set applies.
    const settings = await billingService.getSettings();
    const featureCodes = data.features ?? settings.defaultFeatures;
    await featureService.ensureCatalog();

    return prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          status: 'ACTIVE',
          activatedAt: new Date(),
        },
      });

      // Per-bed pricing with a free trial. Platform defaults apply unless the platform
      // admin passed a custom ratePerBed / trialDays when creating the tenant.
      const subscriptionData = await billingService.buildNewSubscription(
        { trialDays: data.trialDays, ratePerBed: data.ratePerBed },
        tx,
      );
      const subscription = await tx.subscription.create({
        data: { tenantId: tenant.id, ...subscriptionData },
      });
      if (subscription.isCustomRate) {
        await tx.subscriptionRateHistory.create({
          data: {
            tenantId: tenant.id,
            subscriptionId: subscription.id,
            oldRate: null,
            newRate: subscription.ratePerBed,
            isCustomRate: true,
            reason: 'Custom rate set when the tenant was created',
            changedBy: data.createdBy ?? null,
          },
        });
      }

      await featureService.applySet(
        tx, tenant.id, featureCodes, data.createdBy ?? null,
        data.features ? 'Chosen when the tenant was created' : 'Platform default features',
      );

      const adminRole = await tx.role.create({
        data: {
          name: 'Tenant Admin',
          code: `${TENANT_ROLES.ADMIN}-${tenant.id}`,
          scope: 'TENANT',
          tenantId: tenant.id,
          isSystem: true,
        },
      });

      const allPerms = await tx.permission.findMany();
      const tenantPerms = allPerms.filter((p) => !p.code.startsWith('tenants:') && !p.code.startsWith('platform:'));
      await tx.rolePermission.createMany({
        data: tenantPerms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
      });

      await tx.tenantUser.create({
        data: {
          tenantId: tenant.id,
          email: data.adminEmail,
          passwordHash,
          firstName: data.adminFirstName,
          lastName: data.adminLastName,
          roleId: adminRole.id,
        },
      });

      await tx.buildingType.createMany({
        data: BUILDING_TYPES.map((bt) => ({
          tenantId: tenant.id,
          name: bt.name,
          isSystem: true,
        })),
      });

      return tenant;
    }, { maxWait: 15000, timeout: 30000 });
  }

  async findAll(query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'name', 'status'], 'createdAt');
    const search = parseSearch(query, ['name', 'email']);

    const where = { deletedAt: null, ...search };
    if (query.status) where.status = query.status;

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { subscription: true, _count: { select: { buildings: true, residents: true } } },
      }),
      prisma.tenant.count({ where }),
    ]);

    // Show each tenant's bed count and rate next to it (what they will be billed for).
    const ids = tenants.map((t) => t.id);
    const [bedCounts, featureMap] = await Promise.all([
      billingService.countBillableBedsByTenant(ids),
      featureService.getBillableFeaturesByTenant(ids),
    ]);
    const enriched = tenants.map((t) => this._withBilling(t, bedCounts.get(t.id) || 0, featureMap.get(t.id) || []));

    return { tenants: enriched, pagination: { page, limit, total } };
  }

  _withBilling(tenant, beds, features = []) {
    if (!tenant.subscription) return { ...tenant, billing: null };
    const sub = tenant.subscription;
    const info = billingService.trialInfo(sub);
    return {
      ...tenant,
      billing: {
        ratePerBed: Number(sub.ratePerBed),
        isCustomRate: sub.isCustomRate,
        billableBeds: beds,
        enabledAddOns: features.map((f) => f.code),
        estimatedMonthlyAmount: billingService.computeInvoice(beds, sub.ratePerBed, 0, features).amount,
        isTrial: info.isTrial,
        trialEndsAt: info.trialEndsAt,
        trialDaysLeft: info.trialDaysLeft,
      },
    };
  }

  async findById(id) {
    const tenant = await prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: {
        subscription: true,
        _count: { select: { buildings: true, residents: true, staff: true, users: true } },
      },
    });
    if (!tenant) throw new NotFoundError('Tenant');
    return tenant;
  }

  /** Tenant detail for the platform screen, including billing numbers. */
  async findByIdWithBilling(id) {
    const tenant = await this.findById(id);
    const [beds, features] = await Promise.all([
      billingService.countBillableBeds(id),
      featureService.getBillableFeatures(id),
    ]);
    return this._withBilling(tenant, beds, features);
  }

  async update(id, data) {
    await this.findById(id);
    return prisma.tenant.update({ where: { id }, data });
  }

  async suspend(id) {
    const tenant = await this.findById(id);
    return prisma.tenant.update({
      where: { id },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
  }

  async activate(id) {
    await this.findById(id);
    return prisma.tenant.update({
      where: { id },
      data: { status: 'ACTIVE', activatedAt: new Date(), suspendedAt: null },
    });
  }

  async softDelete(id) {
    await this.findById(id);
    return prisma.tenant.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELLED' } });
  }

  async getAnalytics() {
    const [totalTenants, activeTenants, suspendedTenants, rawStatusBreakdown, bedsByTenant, settings] = await Promise.all([
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      prisma.subscription.groupBy({ by: ['status'], where: { tenant: { deletedAt: null } }, _count: { _all: true } }),
      billingService.countBillableBedsByTenant(),
      billingService.getSettings(),
    ]);

    const subscriptionBreakdown = rawStatusBreakdown.map((s) => ({ status: s.status, count: s._count._all }));
    const totalBillableBeds = [...bedsByTenant.values()].reduce((sum, n) => sum + n, 0);

    return {
      totalTenants,
      activeTenants,
      suspendedTenants,
      subscriptionBreakdown,
      totalBillableBeds,
      defaultRatePerBed: settings.defaultRatePerBed,
      trialDays: settings.trialDays,
    };
  }
}

export default new TenantService();
