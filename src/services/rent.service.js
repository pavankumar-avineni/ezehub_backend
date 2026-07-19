import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';
import { parsePagination, parseSort } from '../utils/response.js';
import { generateReceiptNumber } from '../utils/response.js';

class RentService {
  async generateMonthlyRent(tenantId, month, year, buildingId) {
    const where = { tenantId, status: 'ACTIVE', deletedAt: null };
    if (buildingId) where.bed = { buildingId };

    const residents = await prisma.resident.findMany({
      where,
      include: { bed: true },
    });

    const dueDate = new Date(year, month, 5);
    const results = [];

    for (const resident of residents) {
      const existing = await prisma.rentCharge.findUnique({
        where: { residentId_month_year: { residentId: resident.id, month, year } },
      });

      if (existing) continue;

      const rentAmount = resident.bed?.rentAmount || 0;
      const charge = await prisma.rentCharge.create({
        data: {
          tenantId,
          residentId: resident.id,
          month,
          year,
          rentAmount,
          totalAmount: rentAmount,
          dueDate,
        },
      });
      results.push(charge);
    }

    return { generated: results.length, charges: results };
  }

  async findAllCharges(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['dueDate', 'createdAt'], 'dueDate');

    const where = { tenantId };
    if (query.residentId) where.residentId = query.residentId;
    if (query.status) where.status = query.status;
    if (query.month) where.month = parseInt(query.month);
    if (query.year) where.year = parseInt(query.year);

    const [charges, total] = await Promise.all([
      prisma.rentCharge.findMany({
        where, skip, take: limit, orderBy,
        include: { resident: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      }),
      prisma.rentCharge.count({ where }),
    ]);

    return { charges, pagination: { page, limit, total } };
  }

  async updateCharge(tenantId, id, data) {
    const charge = await prisma.rentCharge.findFirst({ where: { id, tenantId } });
    if (!charge) throw new NotFoundError('Rent charge');

    const totalAmount =
      (data.rentAmount ?? charge.rentAmount) +
      (data.electricity ?? charge.electricity) +
      (data.water ?? charge.water) +
      (data.wifi ?? charge.wifi) +
      (data.laundry ?? charge.laundry) +
      (data.food ?? charge.food) +
      (data.parking ?? charge.parking) +
      (data.maintenance ?? charge.maintenance) +
      (data.lateFee ?? charge.lateFee) -
      (data.discount ?? charge.discount);

    return prisma.rentCharge.update({
      where: { id },
      data: { ...data, totalAmount },
    });
  }

  async recordPayment(tenantId, data) {
    const resident = await prisma.resident.findFirst({
      where: { id: data.residentId, tenantId, deletedAt: null },
    });
    if (!resident) throw new NotFoundError('Resident');

    return prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          tenantId,
          residentId: data.residentId,
          rentChargeId: data.rentChargeId,
          amount: data.amount,
          method: data.method,
          transactionId: data.transactionId,
          receiptNumber: generateReceiptNumber(),
          notes: data.notes,
        },
      });

      if (data.rentChargeId) {
        const charge = await tx.rentCharge.findUnique({ where: { id: data.rentChargeId } });
        const newPaidAmount = Number(charge.paidAmount) + Number(data.amount);
        const status = newPaidAmount >= Number(charge.totalAmount) ? 'PAID' : 'PARTIAL';

        await tx.rentCharge.update({
          where: { id: data.rentChargeId },
          data: { paidAmount: newPaidAmount, status },
        });
      }

      return payment;
    });
  }

  async findAllPayments(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ['paidAt', 'createdAt'], 'paidAt');

    const where = { tenantId };
    if (query.residentId) where.residentId = query.residentId;
    if (query.method) where.method = query.method;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where, skip, take: limit, orderBy,
        include: {
          resident: { select: { id: true, firstName: true, lastName: true } },
          rentCharge: true,
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, pagination: { page, limit, total } };
  }

  async getOutstandingBalance(tenantId) {
    const charges = await prisma.rentCharge.findMany({
      where: { tenantId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
      include: { resident: { select: { firstName: true, lastName: true, phone: true } } },
    });

    const totalOutstanding = charges.reduce(
      (sum, c) => sum + (Number(c.totalAmount) - Number(c.paidAmount)), 0
    );

    return { totalOutstanding, charges };
  }
}

export default new RentService();
