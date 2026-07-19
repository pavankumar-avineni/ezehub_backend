import prisma from '../config/database.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { parsePagination, parseSort, parseSearch } from '../utils/response.js';

class ResidentService {
  async create(tenantId, data) {
    if (data.bedId) {
      const bed = await prisma.bed.findFirst({
        where: { id: data.bedId, tenantId, status: 'AVAILABLE', deletedAt: null },
      });
      if (!bed) throw new ConflictError('Bed is not available');

      await prisma.bed.update({ where: { id: data.bedId }, data: { status: 'OCCUPIED' } });
      await this._updateRoomStatus(bed.roomId);
    }

    const resident = await prisma.resident.create({
      data: {
        ...data,
        tenantId,
        checkInDate: data.checkInDate ? new Date(data.checkInDate) : new Date(),
        status: 'ACTIVE',
      },
      include: { bed: { include: { room: { include: { floor: { include: { building: true } } } } } } },
    });

    return resident;
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'firstName', 'checkInDate'], 'createdAt');
    const search = parseSearch(query, ['firstName', 'lastName', 'phone', 'email']);

    const where = { tenantId, deletedAt: null, ...search };
    if (query.status) where.status = query.status;
    if (query.buildingId) {
      where.bed = { buildingId: query.buildingId };
    }

    const [residents, total] = await Promise.all([
      prisma.resident.findMany({
        where, skip, take: limit, orderBy,
        include: {
          bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
        },
      }),
      prisma.resident.count({ where }),
    ]);

    return { residents, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const resident = await prisma.resident.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
        agreements: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        payments: { orderBy: { paidAt: 'desc' }, take: 10 },
        complaints: { orderBy: { createdAt: 'desc' }, take: 5 },
        transferHistory: { orderBy: { transferredAt: 'desc' }, take: 5 },
        documents: { where: { deletedAt: null } },
      },
    });
    if (!resident) throw new NotFoundError('Resident');
    return resident;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.resident.update({
      where: { id },
      data,
      include: { bed: true },
    });
  }

  async transfer(tenantId, id, toBedId, reason) {
    const resident = await this.findById(tenantId, id);
    const toBed = await prisma.bed.findFirst({
      where: { id: toBedId, tenantId, status: 'AVAILABLE', deletedAt: null },
    });
    if (!toBed) throw new ConflictError('Target bed is not available');

    return prisma.$transaction(async (tx) => {
      if (resident.bedId) {
        await tx.bed.update({ where: { id: resident.bedId }, data: { status: 'AVAILABLE' } });
        await this._updateRoomStatus(resident.bed.roomId, tx);
      }

      await tx.bed.update({ where: { id: toBedId }, data: { status: 'OCCUPIED' } });
      await this._updateRoomStatus(toBed.roomId, tx);

      await tx.transferHistory.create({
        data: { tenantId, residentId: id, fromBedId: resident.bedId, toBedId, reason },
      });

      return tx.resident.update({
        where: { id },
        data: { bedId: toBedId },
        include: { bed: { include: { room: true } } },
      });
    });
  }

  async checkout(tenantId, id, checkOutDate, notes) {
    const resident = await this.findById(tenantId, id);

    return prisma.$transaction(async (tx) => {
      if (resident.bedId) {
        await tx.bed.update({ where: { id: resident.bedId }, data: { status: 'AVAILABLE' } });
        await this._updateRoomStatus(resident.bed.roomId, tx);
      }

      return tx.resident.update({
        where: { id },
        data: {
          status: 'CHECKED_OUT',
          checkOutDate: checkOutDate ? new Date(checkOutDate) : new Date(),
          bedId: null,
          notes: notes || resident.notes,
        },
      });
    });
  }

  async softDelete(tenantId, id) {
    const resident = await this.findById(tenantId, id);
    if (resident.status === 'ACTIVE') {
      await this.checkout(tenantId, id);
    }
    return prisma.resident.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async _updateRoomStatus(roomId, tx = prisma) {
    const beds = await tx.bed.count({ where: { roomId, deletedAt: null } });
    const occupied = await tx.bed.count({ where: { roomId, status: 'OCCUPIED', deletedAt: null } });

    let status = 'AVAILABLE';
    if (occupied === beds && beds > 0) status = 'OCCUPIED';
    else if (occupied > 0) status = 'PARTIAL';

    await tx.room.update({ where: { id: roomId }, data: { status } });
  }
}

export default new ResidentService();
