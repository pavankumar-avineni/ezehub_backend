import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination, parseSort, parseSearch } from '../utils/response.js';
import { generateOTP } from '../utils/response.js';

class ComplaintService {
  async create(tenantId, data) {
    return prisma.complaint.create({
      data: { ...data, tenantId },
      include: {
        resident: { select: { id: true, firstName: true, lastName: true } },
        building: { select: { id: true, name: true } },
      },
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'priority'], 'createdAt');
    const search = parseSearch(query, ['title', 'description']);

    const where = { tenantId, deletedAt: null, ...search };
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.assignedStaffId) where.assignedStaffId = query.assignedStaffId;

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where, skip, take: limit, orderBy,
        include: {
          resident: { select: { id: true, firstName: true, lastName: true } },
          building: { select: { id: true, name: true } },
          assignedStaff: { select: { id: true, firstName: true, lastName: true } },
          _count: { select: { comments: true } },
        },
      }),
      prisma.complaint.count({ where }),
    ]);

    return { complaints, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const complaint = await prisma.complaint.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        resident: true,
        building: true,
        room: true,
        assignedStaff: true,
        comments: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!complaint) throw new NotFoundError('Complaint');
    return complaint;
  }

  async assign(tenantId, id, assignedStaffId) {
    await this.findById(tenantId, id);
    return prisma.complaint.update({
      where: { id },
      data: { assignedStaffId, status: 'ASSIGNED' },
      include: { assignedStaff: true },
    });
  }

  async updateStatus(tenantId, id, status, resolution) {
    await this.findById(tenantId, id);
    return prisma.complaint.update({
      where: { id },
      data: {
        status,
        resolution,
        resolvedAt: ['RESOLVED', 'CLOSED'].includes(status) ? new Date() : null,
      },
    });
  }

  async addComment(tenantId, complaintId, userId, userType, comment, attachments = []) {
    await this.findById(tenantId, complaintId);
    return prisma.complaintComment.create({
      data: { complaintId, userId, userType, comment, attachments },
    });
  }
}

class VisitorService {
  async create(tenantId, data) {
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000);

    return prisma.visitor.create({
      data: {
        ...data,
        tenantId,
        otp,
        otpExpiresAt,
        status: 'OTP_SENT',
      },
      include: { building: { select: { id: true, name: true } } },
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const search = parseSearch(query, ['name', 'phone']);

    const where = { tenantId, ...search };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.status) where.status = query.status;

    const [visitors, total] = await Promise.all([
      prisma.visitor.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { building: { select: { id: true, name: true } } },
      }),
      prisma.visitor.count({ where }),
    ]);

    return { visitors, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const visitor = await prisma.visitor.findFirst({
      where: { id, tenantId },
      include: { building: true },
    });
    if (!visitor) throw new NotFoundError('Visitor');
    return visitor;
  }

  async verifyOtp(tenantId, id, otp) {
    const visitor = await this.findById(tenantId, id);
    if (visitor.otp !== otp) throw new Error('Invalid OTP');
    if (new Date() > visitor.otpExpiresAt) throw new Error('OTP expired');

    return prisma.visitor.update({
      where: { id },
      data: { status: 'VERIFIED' },
    });
  }

  async checkIn(tenantId, id) {
    await this.findById(tenantId, id);
    return prisma.visitor.update({
      where: { id },
      data: { status: 'CHECKED_IN', checkInAt: new Date() },
    });
  }

  async checkOut(tenantId, id) {
    await this.findById(tenantId, id);
    return prisma.visitor.update({
      where: { id },
      data: { status: 'CHECKED_OUT', checkOutAt: new Date() },
    });
  }
}

export const complaintService = new ComplaintService();
export const visitorService = new VisitorService();
