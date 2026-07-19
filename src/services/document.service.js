import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { uploadToCloudinary, deleteFromCloudinary } from '../config/cloudinary.js';
import { parsePagination } from '../utils/response.js';

class DocumentService {
  async upload(tenantId, file, metadata = {}) {
    const result = await uploadToCloudinary(file.buffer, {
      folder: `ezehub/${tenantId}`,
      resource_type: 'auto',
    });

    const docType = this._getDocumentType(file.mimetype);

    return prisma.document.create({
      data: {
        tenantId,
        residentId: metadata.residentId,
        entityType: metadata.entityType || 'general',
        entityId: metadata.entityId,
        name: metadata.name || file.originalname,
        type: docType,
        url: result.secure_url,
        publicId: result.public_id,
        size: file.size,
        mimeType: file.mimetype,
        metadata: metadata.extra || {},
        uploadedBy: metadata.uploadedBy,
      },
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId, deletedAt: null };
    if (query.residentId) where.residentId = query.residentId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;

    const [documents, total] = await Promise.all([
      prisma.document.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.document.count({ where }),
    ]);

    return { documents, pagination: { page, limit, total } };
  }

  async delete(tenantId, id) {
    const doc = await prisma.document.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!doc) throw new NotFoundError('Document');

    await deleteFromCloudinary(doc.publicId);
    return prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  _getDocumentType(mimeType) {
    if (mimeType.startsWith('image/')) return 'IMAGE';
    if (mimeType === 'application/pdf') return 'PDF';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'EXCEL';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'WORD';
    return 'OTHER';
  }
}

class NotificationService {
  async create(tenantId, data) {
    return prisma.notification.create({
      data: { ...data, tenantId, scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null },
    });
  }

  async findAll(userId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { userId };
    if (query.status) where.status = query.status;
    if (query.channel) where.channel = query.channel;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { notifications, unreadCount, pagination: { page, limit, total } };
  }

  async markAsRead(id, userId) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date(), status: 'READ' },
    });
  }

  async markAllAsRead(userId) {
    return prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
  }
}

class ReportService {
  async getOccupancyReport(tenantId, buildingId) {
    const where = { tenantId, deletedAt: null };
    if (buildingId) where.id = buildingId;

    const buildings = await prisma.building.findMany({
      where,
      include: {
        _count: {
          select: {
            floors: true,
          },
        },
      },
    });

    const report = [];
    for (const building of buildings) {
      const [totalBeds, occupiedBeds, totalResidents] = await Promise.all([
        prisma.bed.count({ where: { buildingId: building.id, deletedAt: null } }),
        prisma.bed.count({ where: { buildingId: building.id, status: 'OCCUPIED', deletedAt: null } }),
        prisma.resident.count({ where: { tenantId, status: 'ACTIVE', bed: { buildingId: building.id } } }),
      ]);

      report.push({
        building: { id: building.id, name: building.name, code: building.code },
        totalBeds,
        occupiedBeds,
        availableBeds: totalBeds - occupiedBeds,
        occupancyRate: totalBeds ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : 0,
        totalResidents,
      });
    }

    return report;
  }

  async getRentCollectionReport(tenantId, month, year) {
    const charges = await prisma.rentCharge.findMany({
      where: { tenantId, month, year },
      include: { resident: { select: { firstName: true, lastName: true, phone: true } } },
    });

    const totalExpected = charges.reduce((s, c) => s + Number(c.totalAmount), 0);
    const totalCollected = charges.reduce((s, c) => s + Number(c.paidAmount), 0);

    return {
      month,
      year,
      totalExpected,
      totalCollected,
      outstanding: totalExpected - totalCollected,
      collectionRate: totalExpected ? ((totalCollected / totalExpected) * 100).toFixed(1) : 0,
      charges,
    };
  }

  async getTenantDashboard(tenantId) {
    const [
      totalBuildings, totalResidents, activeResidents, totalStaff,
      openComplaints, pendingRent, todayVisitors, totalBeds, occupiedBeds,
    ] = await Promise.all([
      prisma.building.count({ where: { tenantId, deletedAt: null } }),
      prisma.resident.count({ where: { tenantId, deletedAt: null } }),
      prisma.resident.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.staff.count({ where: { tenantId, status: 'ACTIVE', deletedAt: null } }),
      prisma.complaint.count({ where: { tenantId, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } } }),
      prisma.rentCharge.aggregate({
        where: { tenantId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        _sum: { totalAmount: true, paidAmount: true },
      }),
      prisma.visitor.count({
        where: {
          tenantId,
          checkInAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
      prisma.bed.count({ where: { tenantId, deletedAt: null } }),
      prisma.bed.count({ where: { tenantId, status: 'OCCUPIED', deletedAt: null } }),
    ]);

    return {
      totalBuildings,
      totalResidents,
      activeResidents,
      totalStaff,
      openComplaints,
      pendingRent: Number(pendingRent._sum.totalAmount || 0) - Number(pendingRent._sum.paidAmount || 0),
      todayVisitors,
      occupancyRate: totalBeds ? ((occupiedBeds / totalBeds) * 100).toFixed(1) : 0,
    };
  }
}

export const documentService = new DocumentService();
export const notificationService = new NotificationService();
export const reportService = new ReportService();
