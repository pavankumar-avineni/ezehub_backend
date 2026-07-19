import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination, parseSort } from '../utils/response.js';

class FinanceService {
  async createIncome(tenantId, data) {
    return prisma.incomeRecord.create({
      data: { ...data, tenantId, date: new Date(data.date) },
      include: { building: { select: { id: true, name: true } } },
    });
  }

  async createExpense(tenantId, data) {
    return prisma.expenseRecord.create({
      data: { ...data, tenantId, date: new Date(data.date) },
      include: { building: { select: { id: true, name: true } } },
    });
  }

  async findAllIncome(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.category) where.category = query.category;
    if (query.startDate) where.date = { ...where.date, gte: new Date(query.startDate) };
    if (query.endDate) where.date = { ...where.date, lte: new Date(query.endDate) };

    const [records, total] = await Promise.all([
      prisma.incomeRecord.findMany({
        where, skip, take: limit, orderBy: { date: 'desc' },
        include: { building: { select: { id: true, name: true } } },
      }),
      prisma.incomeRecord.count({ where }),
    ]);

    return { records, pagination: { page, limit, total } };
  }

  async findAllExpenses(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.category) where.category = query.category;
    if (query.startDate) where.date = { ...where.date, gte: new Date(query.startDate) };
    if (query.endDate) where.date = { ...where.date, lte: new Date(query.endDate) };

    const [records, total] = await Promise.all([
      prisma.expenseRecord.findMany({
        where, skip, take: limit, orderBy: { date: 'desc' },
        include: { building: { select: { id: true, name: true } } },
      }),
      prisma.expenseRecord.count({ where }),
    ]);

    return { records, pagination: { page, limit, total } };
  }

  async getDashboard(tenantId, startDate, endDate) {
    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const [totalIncome, totalExpenses, incomeByCategory, expensesByCategory, pendingRent] = await Promise.all([
      prisma.incomeRecord.aggregate({
        where: { tenantId, ...(Object.keys(dateFilter).length && { date: dateFilter }) },
        _sum: { amount: true },
      }),
      prisma.expenseRecord.aggregate({
        where: { tenantId, ...(Object.keys(dateFilter).length && { date: dateFilter }) },
        _sum: { amount: true },
      }),
      prisma.incomeRecord.groupBy({
        by: ['category'],
        where: { tenantId, ...(Object.keys(dateFilter).length && { date: dateFilter }) },
        _sum: { amount: true },
      }),
      prisma.expenseRecord.groupBy({
        by: ['category'],
        where: { tenantId, ...(Object.keys(dateFilter).length && { date: dateFilter }) },
        _sum: { amount: true },
      }),
      prisma.rentCharge.aggregate({
        where: { tenantId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        _sum: { totalAmount: true, paidAmount: true },
      }),
    ]);

    const income = Number(totalIncome._sum.amount || 0);
    const expenses = Number(totalExpenses._sum.amount || 0);

    return {
      totalIncome: income,
      totalExpenses: expenses,
      profit: income - expenses,
      incomeByCategory,
      expensesByCategory,
      pendingRent: Number(pendingRent._sum.totalAmount || 0) - Number(pendingRent._sum.paidAmount || 0),
    };
  }
}

class MaintenanceService {
  async create(tenantId, data) {
    return prisma.maintenanceRequest.create({
      data: {
        ...data,
        tenantId,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
      },
      include: {
        building: { select: { id: true, name: true } },
        room: { select: { id: true, name: true, number: true } },
        assignedStaff: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId };
    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;

    const [requests, total] = await Promise.all([
      prisma.maintenanceRequest.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          building: { select: { id: true, name: true } },
          assignedStaff: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.maintenanceRequest.count({ where }),
    ]);

    return { requests, pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const request = await prisma.maintenanceRequest.findFirst({
      where: { id, tenantId },
      include: { building: true, room: true, assignedStaff: true },
    });
    if (!request) throw new NotFoundError('Maintenance request');
    return request;
  }

  async update(tenantId, id, data) {
    await this.findById(tenantId, id);
    return prisma.maintenanceRequest.update({
      where: { id },
      data: {
        ...data,
        scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : undefined,
        completedAt: data.status === 'COMPLETED' ? new Date() : undefined,
      },
    });
  }
}

export const financeService = new FinanceService();
export const maintenanceService = new MaintenanceService();
