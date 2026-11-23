import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { NotFoundError, ConflictError, SubscriptionLimitError } from '../utils/errors.js';
import { SUBSCRIPTION_PLANS, PERMISSIONS, TENANT_ROLES, BUILDING_TYPES } from '../constants/index.js';
import { parsePagination, parseSort, parseSearch } from '../utils/response.js';

class TenantService {
  async create(data) {
    const existing = await prisma.tenant.findFirst({
      where: { email: data.email },
    });
    if (existing) throw new ConflictError('Tenant with this email already exists');

    const planConfig = SUBSCRIPTION_PLANS[data.plan || 'STARTER'];
    const passwordHash = await hashPassword(data.adminPassword);

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

      await tx.subscription.create({
        data: {
          tenantId: tenant.id,
          plan: data.plan || 'STARTER',
          status: 'ACTIVE',
          buildingLimit: planConfig.buildingLimit,
          deviceLimit: planConfig.deviceLimit,
          apiAccess: planConfig.apiAccess,
          whiteLabel: planConfig.whiteLabel,
          prioritySupport: planConfig.prioritySupport,
          price: planConfig.price,
          startDate: new Date(),
        },
      });

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

    return { tenants, pagination: { page, limit, total } };
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
    const [totalTenants, activeTenants, suspendedTenants, rawPlanBreakdown] = await Promise.all([
      prisma.tenant.count({ where: { deletedAt: null } }),
      prisma.tenant.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED', deletedAt: null } }),
      prisma.subscription.groupBy({ by: ['plan'], _count: { _all: true } }),
    ]);

    const planBreakdown = rawPlanBreakdown.map((p) => ({
      plan: p.plan,
      _count: typeof p._count === 'object' && p._count !== null ? (p._count._all ?? 0) : (p._count ?? 0),
    }));

    return { totalTenants, activeTenants, suspendedTenants, planBreakdown };
  }

  async checkBuildingLimit(tenantId) {
    const sub = await prisma.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw new NotFoundError('Subscription');
    if (sub.buildingLimit === -1) return true;

    const count = await prisma.building.count({ where: { tenantId, deletedAt: null } });
    if (count >= sub.buildingLimit) {
      throw new SubscriptionLimitError(`Building limit reached (${sub.buildingLimit}). Upgrade your plan.`);
    }
    return true;
  }
}

export default new TenantService();
