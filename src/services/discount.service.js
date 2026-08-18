import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination } from '../utils/response.js';

class DiscountService {
  async create(tenantId, data) {
    return prisma.discount.create({
      data: {
        ...data,
        tenantId,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        buildingIds: data.buildingIds || [],
        residentIds: data.residentIds || [],
      },
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId, deletedAt: null };
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.category) where.category = query.category;

    const [discounts, total] = await Promise.all([
      prisma.discount.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.discount.count({ where }),
    ]);

    return { discounts, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const discount = await prisma.discount.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!discount) throw new NotFoundError('Discount');
    return discount;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.discount.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
  }

  async delete(tenantId, id) {
    await this.findById(tenantId, id);
    return prisma.discount.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  // Get active discounts for a resident (used in resident app)
  async getResidentDiscounts(tenantId, residentId) {
    const resident = await prisma.resident.findFirst({
      where: { id: residentId, tenantId },
      include: { bed: true },
    });

    const now = new Date();
    const discounts = await prisma.discount.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
    });

    // Filter by scope
    return discounts.filter((d) => {
      if (d.scope === 'ALL_RESIDENTS') return true;
      if (d.scope === 'SPECIFIC_RESIDENTS') return d.residentIds.includes(residentId);
      if (d.scope === 'SPECIFIC_BUILDINGS' && resident?.bed?.buildingId) return d.buildingIds.includes(resident.bed.buildingId);
      return false;
    });
  }
}

export default new DiscountService();
