import prisma from '../config/database.js';
import billingService from './billing.service.js';
import featureService from './feature.service.js';
import { canViewAllTenants } from '../middleware/platformAccess.js';

const round2 = (n) => Math.round(n * 100) / 100;
const fullName = (u) => `${u.firstName} ${u.lastName}`.trim();

/** Performance numbers per employee. */
class PlatformReportService {
  /**
   * One row per employee: how many tenants they onboarded, how many they maintain, what those
   * tenants are expected to pay each month, and what was actually collected in the period.
   * Employees without "view all tenants" only get their own row.
   */
  async teamReport({ from, to } = {}, user) {
    const start = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = to ? new Date(to) : new Date();
    const inPeriod = { gte: start, lte: end };
    const viewAll = canViewAllTenants(user);

    const employees = await prisma.platformUser.findMany({
      where: { deletedAt: null, ...(viewAll ? {} : { id: user.id }) },
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true, designation: true, department: true,
        employeeStatus: true, role: { select: { name: true } },
      },
      orderBy: { firstName: 'asc' },
    });
    const employeeIds = employees.map((e) => e.id);

    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null, OR: [{ accountManagerId: { in: employeeIds } }, { createdById: { in: employeeIds } }] },
      select: {
        id: true, status: true, createdAt: true, createdById: true, accountManagerId: true,
        subscription: { select: { status: true, ratePerBed: true } },
      },
    });
    const tenantIds = tenants.map((t) => t.id);

    const [bedMap, featureMap, paidInvoices, generated, confirmed] = await Promise.all([
      billingService.countBillableBedsByTenant(tenantIds),
      featureService.getBillableFeaturesByTenant(tenantIds),
      prisma.billingInvoice.findMany({
        where: { status: 'PAID', paidAt: inPeriod, tenantId: { in: tenantIds } },
        select: { tenantId: true, total: true },
      }),
      prisma.billingInvoice.groupBy({ by: ['createdBy'], where: { createdBy: { in: employeeIds }, createdAt: inPeriod }, _count: { _all: true } }),
      prisma.billingInvoice.groupBy({ by: ['confirmedBy'], where: { confirmedBy: { in: employeeIds }, status: 'PAID', paidAt: inPeriod }, _count: { _all: true }, _sum: { total: true } }),
    ]);

    const collectedByTenant = new Map();
    for (const inv of paidInvoices) collectedByTenant.set(inv.tenantId, (collectedByTenant.get(inv.tenantId) || 0) + Number(inv.total));
    const generatedMap = new Map(generated.map((g) => [g.createdBy, g._count._all]));
    const confirmedMap = new Map(confirmed.map((c) => [c.confirmedBy, { count: c._count._all, amount: Number(c._sum.total || 0) }]));

    const rows = employees.map((e) => {
      const managed = tenants.filter((t) => t.accountManagerId === e.id);
      const created = tenants.filter((t) => t.createdById === e.id);

      let beds = 0;
      let recurring = 0;
      let trialPipeline = 0;
      let collected = 0;
      for (const t of managed) {
        const tenantBeds = bedMap.get(t.id) || 0;
        beds += tenantBeds;
        collected += collectedByTenant.get(t.id) || 0;
        if (!t.subscription) continue;
        const amount = billingService.computeInvoice(tenantBeds, t.subscription.ratePerBed, 0, featureMap.get(t.id) || []).amount;
        if (t.subscription.status === 'TRIAL') trialPipeline += amount;
        else if (t.subscription.status === 'ACTIVE' && ['ACTIVE', 'ON_HOLD'].includes(t.status)) recurring += amount;
      }

      return {
        employee: {
          id: e.id, name: fullName(e), employeeCode: e.employeeCode, designation: e.designation,
          department: e.department, role: e.role?.name ?? null, employeeStatus: e.employeeStatus,
        },
        tenantsCreatedInPeriod: created.filter((t) => t.createdAt >= start && t.createdAt <= end).length,
        tenantsCreatedTotal: created.length,
        tenantsManaged: managed.length,
        activeTenantsManaged: managed.filter((t) => t.status === 'ACTIVE').length,
        trialTenantsManaged: managed.filter((t) => t.subscription?.status === 'TRIAL').length,
        billableBedsManaged: beds,
        estimatedMonthlyRecurring: round2(recurring),
        trialPipeline: round2(trialPipeline),
        revenueCollectedFromManagedTenants: round2(collected),
        invoicesGenerated: generatedMap.get(e.id) || 0,
        paymentsConfirmed: confirmedMap.get(e.id)?.count || 0,
        paymentsConfirmedAmount: round2(confirmedMap.get(e.id)?.amount || 0),
      };
    });

    const sum = (key) => round2(rows.reduce((s, r) => s + r[key], 0));
    const unassigned = viewAll ? await prisma.tenant.count({ where: { deletedAt: null, accountManagerId: null } }) : null;

    return {
      period: { from: start, to: end },
      rows,
      totals: {
        tenantsCreatedInPeriod: sum('tenantsCreatedInPeriod'),
        tenantsManaged: sum('tenantsManaged'),
        billableBedsManaged: sum('billableBedsManaged'),
        estimatedMonthlyRecurring: sum('estimatedMonthlyRecurring'),
        trialPipeline: sum('trialPipeline'),
        revenueCollectedFromManagedTenants: sum('revenueCollectedFromManagedTenants'),
        unassignedTenants: unassigned,
      },
    };
  }
}

export default new PlatformReportService();
