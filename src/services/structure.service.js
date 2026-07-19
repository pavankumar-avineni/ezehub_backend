import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination, parseSort } from '../utils/response.js';

class FloorService {
  async create(tenantId, data) {
    const building = await prisma.building.findFirst({
      where: { id: data.buildingId, tenantId, deletedAt: null },
    });
    if (!building) throw new NotFoundError('Building');

    const floor = await prisma.$transaction(async (tx) => {
      const created = await tx.floor.create({ data: { ...data, tenantId } });
      await tx.building.update({
        where: { id: data.buildingId },
        data: { totalFloors: { increment: 1 } },
      });
      return created;
    });

    return floor;
  }

  async findAll(tenantId, buildingId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['number', 'name'], 'number');

    const where = { tenantId, deletedAt: null };
    if (buildingId) where.buildingId = buildingId;

    const [floors, total] = await Promise.all([
      prisma.floor.findMany({
        where, skip, take: limit, orderBy,
        include: { building: true, _count: { select: { rooms: true } } },
      }),
      prisma.floor.count({ where }),
    ]);

    return { floors, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const floor = await prisma.floor.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        building: true,
        rooms: {
          where: { deletedAt: null },
          include: { beds: { where: { deletedAt: null } } },
          orderBy: { number: 'asc' },
        },
      },
    });
    if (!floor) throw new NotFoundError('Floor');
    return floor;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.floor.update({ where: { id }, data });
  }

  async softDelete(tenantId, id) {
    const floor = await this.findById(tenantId, id);
    return prisma.$transaction(async (tx) => {
      await tx.floor.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.building.update({
        where: { id: floor.buildingId },
        data: { totalFloors: { decrement: 1 } },
      });
    });
  }
}

class RoomService {
  async create(tenantId, data) {
    const floor = await prisma.floor.findFirst({
      where: { id: data.floorId, tenantId, deletedAt: null },
    });
    if (!floor) throw new NotFoundError('Floor');

    return prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: { ...data, tenantId, buildingId: floor.buildingId },
      });
      await tx.floor.update({ where: { id: floor.id }, data: { totalRooms: { increment: 1 } } });
      await tx.building.update({ where: { id: floor.buildingId }, data: { totalRooms: { increment: 1 } } });
      return room;
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['number', 'name'], 'number');

    const where = { tenantId, deletedAt: null };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.floorId) where.floorId = query.floorId;
    if (query.status) where.status = query.status;

    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where, skip, take: limit, orderBy,
        include: { floor: { include: { building: true } }, _count: { select: { beds: true } } },
      }),
      prisma.room.count({ where }),
    ]);

    return { rooms, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const room = await prisma.room.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        floor: { include: { building: true } },
        beds: { where: { deletedAt: null }, include: { residents: { where: { status: 'ACTIVE' } } } },
      },
    });
    if (!room) throw new NotFoundError('Room');
    return room;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.room.update({ where: { id }, data });
  }

  async softDelete(tenantId, id) {
    const room = await this.findById(tenantId, id);
    return prisma.$transaction(async (tx) => {
      await tx.room.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.floor.update({ where: { id: room.floorId }, data: { totalRooms: { decrement: 1 } } });
      await tx.building.update({ where: { id: room.buildingId }, data: { totalRooms: { decrement: 1 } } });
    });
  }
}

class BedService {
  async create(tenantId, data) {
    const room = await prisma.room.findFirst({
      where: { id: data.roomId, tenantId, deletedAt: null },
    });
    if (!room) throw new NotFoundError('Room');

    return prisma.$transaction(async (tx) => {
      const bed = await tx.bed.create({
        data: { ...data, tenantId, buildingId: room.buildingId },
      });
      await tx.building.update({ where: { id: room.buildingId }, data: { totalBeds: { increment: 1 } } });
      return bed;
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId, deletedAt: null };
    if (query.roomId) where.roomId = query.roomId;
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.status) where.status = query.status;

    const [beds, total] = await Promise.all([
      prisma.bed.findMany({
        where, skip, take: limit,
        include: {
          room: { include: { floor: { include: { building: true } } } },
          residents: { where: { status: 'ACTIVE' }, take: 1 },
        },
      }),
      prisma.bed.count({ where }),
    ]);

    return { beds, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const bed = await prisma.bed.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        room: { include: { floor: { include: { building: true } } } },
        residents: { where: { status: 'ACTIVE' } },
      },
    });
    if (!bed) throw new NotFoundError('Bed');
    return bed;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.bed.update({ where: { id }, data });
  }

  async softDelete(tenantId, id) {
    const bed = await this.findById(tenantId, id);
    if (bed.status === 'OCCUPIED') throw new Error('Cannot delete occupied bed');
    return prisma.$transaction(async (tx) => {
      await tx.bed.update({ where: { id }, data: { deletedAt: new Date() } });
      await tx.building.update({ where: { id: bed.buildingId }, data: { totalBeds: { decrement: 1 } } });
    });
  }
}

export const floorService = new FloorService();
export const roomService = new RoomService();
export const bedService = new BedService();
