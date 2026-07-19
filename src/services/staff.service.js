import prisma from '../config/database.js';
import { hashPassword } from '../utils/password.js';
import { NotFoundError, ConflictError } from '../utils/errors.js';
import { parsePagination, parseSort, parseSearch, generateCode } from '../utils/response.js';

class StaffService {
  async create(tenantId, data) {
    const count = await prisma.staff.count({ where: { tenantId } });
    const employeeCode = generateCode('EMP', count);

    return prisma.$transaction(async (tx) => {
      let tenantUserId = null;

      if (data.createUserAccount && data.password) {
        const existing = await tx.tenantUser.findFirst({
          where: { tenantId, email: data.email },
        });
        if (existing) throw new ConflictError('User with this email already exists');

        const user = await tx.tenantUser.create({
          data: {
            tenantId,
            email: data.email,
            passwordHash: await hashPassword(data.password),
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            roleId: data.roleId,
          },
        });
        tenantUserId = user.id;
      }

      return tx.staff.create({
        data: {
          tenantId,
          tenantUserId,
          buildingId: data.buildingId,
          roleId: data.roleId,
          employeeCode,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          department: data.department,
          designation: data.designation,
          joiningDate: new Date(data.joiningDate),
          salary: data.salary,
          address: data.address,
          emergencyContact: data.emergencyContact || {},
        },
        include: { role: true, building: true },
      });
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['createdAt', 'firstName'], 'createdAt');
    const search = parseSearch(query, ['firstName', 'lastName', 'email', 'employeeCode']);

    const where = { tenantId, deletedAt: null, ...search };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.status) where.status = query.status;
    if (query.department) where.department = query.department;

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where, skip, take: limit, orderBy,
        include: { role: true, building: true },
      }),
      prisma.staff.count({ where }),
    ]);

    return { staff, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const staff = await prisma.staff.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        role: true,
        building: true,
        attendance: { orderBy: { date: 'desc' }, take: 30 },
        leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!staff) throw new NotFoundError('Staff member');
    return staff;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.staff.update({
      where: { id },
      data,
      include: { role: true, building: true },
    });
  }

  async recordAttendance(tenantId, data) {
    const staff = await this.findById(tenantId, data.staffId);
    return prisma.attendance.upsert({
      where: { staffId_date: { staffId: data.staffId, date: new Date(data.date) } },
      create: {
        tenantId,
        staffId: data.staffId,
        date: new Date(data.date),
        checkIn: data.checkIn ? new Date(data.checkIn) : new Date(),
        checkOut: data.checkOut ? new Date(data.checkOut) : null,
        status: data.status,
        notes: data.notes,
      },
      update: {
        checkIn: data.checkIn ? new Date(data.checkIn) : undefined,
        checkOut: data.checkOut ? new Date(data.checkOut) : undefined,
        status: data.status,
        notes: data.notes,
      },
    });
  }

  async createLeaveRequest(tenantId, staffId, data) {
    await this.findById(tenantId, staffId);
    return prisma.leaveRequest.create({
      data: {
        tenantId,
        staffId,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        reason: data.reason,
      },
    });
  }

  async updateLeaveStatus(tenantId, leaveId, status, approvedBy) {
    const leave = await prisma.leaveRequest.findFirst({
      where: { id: leaveId, tenantId },
    });
    if (!leave) throw new NotFoundError('Leave request');

    return prisma.leaveRequest.update({
      where: { id: leaveId },
      data: {
        status,
        approvedBy,
        approvedAt: status === 'APPROVED' ? new Date() : null,
      },
    });
  }

  async softDelete(tenantId, id) {
    await this.findById(tenantId, id);
    return prisma.staff.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'TERMINATED' },
    });
  }
}

export default new StaffService();
