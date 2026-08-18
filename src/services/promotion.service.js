import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination } from '../utils/response.js';

class PromotionService {
  async create(tenantId, data) {
    return prisma.promotion.create({
      data: {
        ...data,
        tenantId,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        photos: data.photos || [],
      },
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId, deletedAt: null };
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';
    if (query.category) where.category = query.category;

    const [promotions, total] = await Promise.all([
      prisma.promotion.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.promotion.count({ where }),
    ]);

    return { promotions, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const promo = await prisma.promotion.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!promo) throw new NotFoundError('Promotion');
    return promo;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.promotion.update({
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
    return prisma.promotion.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  // Active promotions for residents
  async getActivePromotions(tenantId) {
    const now = new Date();
    return prisma.promotion.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

export default new PromotionService();
