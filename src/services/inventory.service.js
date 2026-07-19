import prisma from '../config/database.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { parsePagination, parseSort, parseSearch } from '../utils/response.js';

class InventoryService {
  async create(tenantId, data, performedBy) {
    const existing = await prisma.inventoryItem.findFirst({
      where: { tenantId, uniqueCode: data.uniqueCode, deletedAt: null },
    });
    if (existing) throw new ConflictError('Inventory item with this code already exists');

    return prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          ...data,
          tenantId,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : null,
          warrantyUntil: data.warrantyUntil ? new Date(data.warrantyUntil) : null,
        },
        include: { building: true, room: true },
      });

      await tx.inventoryHistory.create({
        data: {
          inventoryItemId: item.id,
          action: 'CREATED',
          toRoomId: data.roomId,
          condition: data.condition || 'NEW',
          performedBy,
        },
      });

      return item;
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'name'], 'createdAt');
    const search = parseSearch(query, ['name', 'uniqueCode', 'category']);

    const where = { tenantId, deletedAt: null, ...search };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.roomId) where.roomId = query.roomId;
    if (query.category) where.category = query.category;
    if (query.condition) where.condition = query.condition;

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where, skip, take: limit, orderBy,
        include: { building: true, room: true },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return { items, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        building: true,
        room: true,
        history: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundError('Inventory item');
    return item;
  }

  async update(tenantId, id, data, performedBy) {
    const item = await this.findById(tenantId, id);

    return prisma.$transaction(async (tx) => {
      const updated = await tx.inventoryItem.update({
        where: { id },
        data: {
          ...data,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
          warrantyUntil: data.warrantyUntil ? new Date(data.warrantyUntil) : undefined,
        },
        include: { building: true, room: true },
      });

      if (data.roomId && data.roomId !== item.roomId) {
        await tx.inventoryHistory.create({
          data: {
            inventoryItemId: id,
            action: 'TRANSFERRED',
            fromRoomId: item.roomId,
            toRoomId: data.roomId,
            condition: data.condition || item.condition,
            performedBy,
          },
        });
      }

      if (data.condition && data.condition !== item.condition) {
        await tx.inventoryHistory.create({
          data: {
            inventoryItemId: id,
            action: 'CONDITION_CHANGED',
            condition: data.condition,
            notes: `Changed from ${item.condition} to ${data.condition}`,
            performedBy,
          },
        });
      }

      return updated;
    });
  }

  async softDelete(tenantId, id) {
    await this.findById(tenantId, id);
    return prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date(), condition: 'DISPOSED' },
    });
  }
}

export default new InventoryService();
