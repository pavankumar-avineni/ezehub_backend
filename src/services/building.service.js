import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination, parseSort, parseSearch } from '../utils/response.js';

class BuildingService {
  async create(tenantId, data) {
    const buildingType = await prisma.buildingType.findFirst({
      where: { 
        OR: [
          { id: data.buildingTypeId },
          { slug: data.buildingTypeId }
        ],
        AND: [
          { OR: [{ tenantId }, { tenantId: null }] }
        ]
      },
    });
    if (!buildingType) throw new NotFoundError('Building type');

    const building = await prisma.building.create({
      data: { ...data, buildingTypeId: buildingType.id, tenantId },
      include: { buildingType: true },
    });

    return building;
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'name'], 'createdAt');
    const search = parseSearch(query, ['name', 'code', 'address']);

    const where = { tenantId, deletedAt: null, ...search };
    if (query.buildingTypeId) where.buildingTypeId = query.buildingTypeId;
    if (query.isActive !== undefined) where.isActive = query.isActive === 'true';

    const [buildings, total] = await Promise.all([
      prisma.building.findMany({
        where, skip, take: limit, orderBy,
        include: {
          buildingType: true,
          _count: { select: { floors: true } },
        },
      }),
      prisma.building.count({ where }),
    ]);

    return { buildings, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const building = await prisma.building.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        buildingType: true,
        floors: {
          where: { deletedAt: null },
          include: { _count: { select: { rooms: true } } },
          orderBy: { number: 'asc' },
        },
        _count: { select: { floors: true, inventoryItems: true, staff: true } },
      },
    });
    if (!building) throw new NotFoundError('Building');
    return building;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.building.update({
      where: { id },
      data,
      include: { buildingType: true },
    });
  }

  async softDelete(tenantId, id) {
    await this.findById(tenantId, id);
    return prisma.building.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
  }

  async getStats(tenantId, id) {
    const building = await this.findById(tenantId, id);
    const [totalRooms, totalBeds, occupiedBeds, availableBeds] = await Promise.all([
      prisma.room.count({ where: { buildingId: id, deletedAt: null } }),
      prisma.bed.count({ where: { buildingId: id, deletedAt: null } }),
      prisma.bed.count({ where: { buildingId: id, status: 'OCCUPIED', deletedAt: null } }),
      prisma.bed.count({ where: { buildingId: id, status: 'AVAILABLE', deletedAt: null } }),
    ]);

    return { ...building, stats: { totalRooms, totalBeds, occupiedBeds, availableBeds, occupancyRate: totalBeds ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : 0 } };
  }

  async getBuildingTypes(tenantId) {
    const buildingTypes = await prisma.buildingType.findMany({
      where: {
        OR: [
          { tenantId },
          { tenantId: null, isSystem: true }
        ]
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }]
    });
    return buildingTypes;
  }
}

export default new BuildingService();
