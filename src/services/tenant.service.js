import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { tenantScopeWhere } from '../middleware/platformAccess.js';
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

    const managerId = data.accountManagerId ?? data.createdBy ?? null;
    if (data.accountManagerId) await this._assertAssignable(data.accountManagerId);

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
          // Who onboarded the tenant, and who maintains it (the creator until someone else is assigned).
          createdById: data.createdBy ?? null,
          accountManagerId: managerId,
          accountManagerAssignedAt: managerId ? new Date() : null,
        },
      });
      if (managerId) {
        await tx.tenantAssignmentHistory.create({
          data: { tenantId: tenant.id, fromUserId: null, toUserId: managerId, reason: 'Assigned when the tenant was created', assignedById: data.createdBy ?? null },
        });
      }

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

  /**
   * @param user the platform employee asking. Employees without "view all tenants" only get the
   *             tenants they created or maintain.
   */
  async findAll(query, user = null) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'name', 'status'], 'createdAt');
    const search = parseSearch(query, ['name', 'email']);

    const where = { deletedAt: null, ...search };
    if (query.status) where.status = query.status;
    if (query.accountManagerId) where.accountManagerId = query.accountManagerId;
    if (query.createdById) where.createdById = query.createdById;
    if (query.unassigned === true || query.unassigned === 'true') where.accountManagerId = null;
    if (user) {
      const scope = tenantScopeWhere(user);
      if (scope.OR) where.AND = [scope];
    }

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
    const people = await this._peopleMap(tenants.flatMap((t) => [t.createdById, t.accountManagerId]));
    const enriched = tenants.map((t) => this._withOwners(
      this._withBilling(t, bedCounts.get(t.id) || 0, featureMap.get(t.id) || []),
      people,
    ));

    return { tenants: enriched, pagination: { page, limit, total } };
  }

  // ─── who owns the tenant ──────────────────────────────────────

  async _peopleMap(ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await prisma.platformUser.findMany({
      where: { id: { in: unique } },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true, department: true, email: true, phone: true, isActive: true },
    });
    return new Map(rows.map((r) => [r.id, { ...r, name: `${r.firstName} ${r.lastName}`.trim() }]));
  }

  _withOwners(tenant, people) {
    return {
      ...tenant,
      createdBy: tenant.createdById ? (people.get(tenant.createdById) || { id: tenant.createdById }) : null,
      accountManager: tenant.accountManagerId ? (people.get(tenant.accountManagerId) || { id: tenant.accountManagerId }) : null,
    };
  }

  async _assertAssignable(employeeId) {
    const employee = await prisma.platformUser.findFirst({
      where: { id: employeeId, deletedAt: null, isActive: true, employeeStatus: { not: 'EXITED' } },
      select: { id: true },
    });
    if (!employee) throw new ValidationError('The account manager must be an active employee');
  }

  /** Make an employee responsible for a tenant (or send null to leave it unassigned). */
  async assignAccountManager(tenantId, accountManagerId, { reason } = {}, assignedById = null) {
    const tenant = await this.findById(tenantId);
    if ((tenant.accountManagerId ?? null) === (accountManagerId ?? null)) {
      throw new ConflictError('The tenant already has this account manager');
    }
    if (accountManagerId) await this._assertAssignable(accountManagerId);

    await prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: { accountManagerId: accountManagerId ?? null, accountManagerAssignedAt: accountManagerId ? new Date() : null },
      });
      await tx.tenantAssignmentHistory.create({
        data: { tenantId, fromUserId: tenant.accountManagerId ?? null, toUserId: accountManagerId ?? null, reason: reason ?? null, assignedById },
      });
    });

    const people = await this._peopleMap([tenant.accountManagerId, accountManagerId]);
    return {
      tenantId,
      tenantName: tenant.name,
      from: tenant.accountManagerId ? people.get(tenant.accountManagerId) || { id: tenant.accountManagerId } : null,
      to: accountManagerId ? people.get(accountManagerId) : null,
    };
  }

  /** Hand several tenants to one employee in one go. */
  async bulkAssign(tenantIds, accountManagerId, { reason } = {}, assignedById = null) {
    const ids = [...new Set(tenantIds)];
    const tenants = await prisma.tenant.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, name: true, accountManagerId: true } });
    if (tenants.length !== ids.length) {
      const found = new Set(tenants.map((t) => t.id));
      throw new NotFoundError(`Tenants (${ids.filter((i) => !found.has(i)).join(', ')})`);
    }
    if (accountManagerId) await this._assertAssignable(accountManagerId);

    const changing = tenants.filter((t) => (t.accountManagerId ?? null) !== (accountManagerId ?? null));
    await prisma.$transaction(async (tx) => {
      if (!changing.length) return;
      await tx.tenant.updateMany({
        where: { id: { in: changing.map((t) => t.id) } },
        data: { accountManagerId: accountManagerId ?? null, accountManagerAssignedAt: accountManagerId ? new Date() : null },
      });
      await tx.tenantAssignmentHistory.createMany({
        data: changing.map((t) => ({ tenantId: t.id, fromUserId: t.accountManagerId, toUserId: accountManagerId ?? null, reason: reason ?? null, assignedById })),
      });
    });
    return { requested: ids.length, changed: changing.length, unchanged: ids.length - changing.length, tenants: changing.map((t) => ({ id: t.id, name: t.name })) };
  }

  async getAssignmentHistory(tenantId) {
    await this.findById(tenantId);
    const rows = await prisma.tenantAssignmentHistory.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
    const people = await this._peopleMap(rows.flatMap((r) => [r.fromUserId, r.toUserId, r.assignedById]));
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      reason: r.reason,
      from: r.fromUserId ? (people.get(r.fromUserId) || { id: r.fromUserId }) : null,
      to: r.toUserId ? (people.get(r.toUserId) || { id: r.toUserId }) : null,
      assignedBy: r.assignedById ? (people.get(r.assignedById) || { id: r.assignedById }) : null,
    }));
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
    const [beds, features, people] = await Promise.all([
      billingService.countBillableBeds(id),
      featureService.getBillableFeatures(id),
      this._peopleMap([tenant.createdById, tenant.accountManagerId]),
    ]);
    return this._withOwners(this._withBilling(tenant, beds, features), people);
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
