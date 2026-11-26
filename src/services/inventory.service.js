import QRCode from 'qrcode';
import prisma from '../config/database.js';
import cloudinary, { uploadToCloudinary } from '../config/cloudinary.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { parsePagination, parseSort } from '../utils/response.js';
import { INVENTORY_CATEGORIES } from '../constants/index.js';

const QR_PREFIX = 'EZEHUB:INV:';
const DELETED_MARKER = '~DEL~';
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ATTACHMENTS_PER_ITEM = 20;
const EXPORT_ROW_LIMIT = 10000;
const TX_OPTIONS = { timeout: 60000, maxWait: 10000 };

// Statuses in which an item is part of the live asset register.
const LIVE_STATUSES = ['IN_USE', 'IN_STORAGE', 'UNDER_REPAIR'];

const ITEM_SORT_FIELDS = [
  'createdAt', 'name', 'category', 'uniqueCode', 'purchaseDate', 'purchasePrice',
  'warrantyUntil', 'nextServiceDate', 'condition', 'status',
];

const UPDATABLE_FIELDS = [
  'name', 'category', 'uniqueCode', 'serialNumber', 'brand', 'model', 'vendor', 'invoiceNumber',
  'purchaseDate', 'purchasePrice', 'salvageValue', 'usefulLifeYears', 'warrantyUntil',
  'nextServiceDate', 'condition', 'notes',
];

const DATE_FIELDS = ['purchaseDate', 'warrantyUntil', 'nextServiceDate'];

const ITEM_INCLUDE = {
  building: { select: { id: true, name: true, code: true } },
  room: { select: { id: true, name: true, number: true } },
  assignedResident: { select: { id: true, firstName: true, lastName: true, phone: true } },
};

const num = (v) => (v === null || v === undefined ? null : Number(v));
const toDate = (v) => (v === undefined ? undefined : v === null ? null : new Date(v));
const nowPlus = (days) => new Date(Date.now() + days * DAY_MS);

class InventoryService {
  // ─── helpers ──────────────────────────────────────────────────

  _qrPayload(code) {
    return `${QR_PREFIX}${code}`;
  }

  _normalizeCode(input) {
    const value = String(input).trim();
    const stripped = value.toUpperCase().startsWith(QR_PREFIX) ? value.slice(QR_PREFIX.length) : value;
    return stripped.trim().toUpperCase();
  }

  /** Straight-line depreciation and warranty info, computed at read time. */
  _valuation(item) {
    const price = num(item.purchasePrice);
    const salvage = num(item.salvageValue) ?? 0;
    const life = item.usefulLifeYears;
    let currentValue = price;
    let accumulatedDepreciation = 0;

    if (price !== null && life && item.purchaseDate) {
      const years = Math.max(0, (Date.now() - new Date(item.purchaseDate).getTime()) / (365.25 * DAY_MS));
      const depreciable = Math.max(0, price - salvage);
      accumulatedDepreciation = Math.min(depreciable, (depreciable * years) / life);
      currentValue = price - accumulatedDepreciation;
    }
    if (item.status === 'DISPOSED') currentValue = num(item.disposalValue) ?? 0;

    let warrantyStatus = 'NONE';
    let daysToWarrantyExpiry = null;
    if (item.warrantyUntil) {
      daysToWarrantyExpiry = Math.ceil((new Date(item.warrantyUntil).getTime() - Date.now()) / DAY_MS);
      warrantyStatus = daysToWarrantyExpiry < 0 ? 'EXPIRED' : daysToWarrantyExpiry <= 30 ? 'EXPIRING_SOON' : 'ACTIVE';
    }

    return {
      currentValue: currentValue === null ? null : Math.round(currentValue * 100) / 100,
      accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
      warrantyStatus,
      daysToWarrantyExpiry,
      serviceDue: item.nextServiceDate ? new Date(item.nextServiceDate).getTime() <= Date.now() : false,
    };
  }

  _decorate(item) {
    return { ...item, valuation: this._valuation(item) };
  }

  async _assertBuilding(tenantId, buildingId, db = prisma) {
    const building = await db.building.findFirst({
      where: { id: buildingId, tenantId, deletedAt: null },
      select: { id: true, name: true, code: true },
    });
    if (!building) throw new NotFoundError('Building');
    return building;
  }

  async _assertRoom(tenantId, roomId, buildingId, db = prisma) {
    const room = await db.room.findFirst({
      where: { id: roomId, tenantId, deletedAt: null },
      select: { id: true, buildingId: true, name: true, number: true },
    });
    if (!room) throw new NotFoundError('Room');
    if (buildingId && room.buildingId !== buildingId) {
      throw new ValidationError('Room does not belong to the selected building');
    }
    return room;
  }

  async _assertResident(tenantId, residentId, db = prisma) {
    const resident = await db.resident.findFirst({
      where: { id: residentId, tenantId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, status: true },
    });
    if (!resident) throw new NotFoundError('Resident');
    return resident;
  }

  async _generateCode(db, tenantId, building, category, reserved) {
    const letters = category.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3).padEnd(3, 'X');
    const buildingCode = String(building.code).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const prefix = `${letters}-${buildingCode}-`;
    let n = await db.inventoryItem.count({ where: { tenantId, uniqueCode: { startsWith: prefix } } });

    for (let i = 0; i < 1000; i += 1) {
      n += 1;
      const code = `${prefix}${String(n).padStart(4, '0')}`;
      if (reserved.has(code)) continue;
      const taken = await db.inventoryItem.findFirst({ where: { tenantId, uniqueCode: code }, select: { id: true } });
      if (!taken) {
        reserved.add(code);
        return code;
      }
    }
    throw new ConflictError('Could not generate a unique item code');
  }

  _log(db, inventoryItemId, data) {
    return db.inventoryHistory.create({ data: { inventoryItemId, ...data } });
  }

  async _getItem(tenantId, id, { includeDeleted = false, db = prisma } = {}) {
    const item = await db.inventoryItem.findFirst({
      where: { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) },
    });
    if (!item) throw new NotFoundError('Inventory item');
    return item;
  }

  _assertEditable(item) {
    if (item.status === 'DISPOSED') throw new ConflictError('Item is disposed. Restore it before making changes');
  }

  _defaultStatusFor(roomId) {
    return roomId ? 'IN_USE' : 'IN_STORAGE';
  }

  // ─── create ───────────────────────────────────────────────────

  async _createInTx(tx, tenantId, data, performedBy, ctx) {
    if (data.condition === 'DISPOSED') {
      throw new ValidationError('Use the dispose endpoint to retire an item');
    }

    const building = ctx.buildings.get(data.buildingId) || await this._assertBuilding(tenantId, data.buildingId, tx);
    ctx.buildings.set(building.id, building);

    if (data.roomId) {
      const key = `${data.roomId}:${building.id}`;
      if (!ctx.rooms.has(key)) {
        await this._assertRoom(tenantId, data.roomId, building.id, tx);
        ctx.rooms.add(key);
      }
    }

    const code = data.uniqueCode
      ? data.uniqueCode
      : await this._generateCode(tx, tenantId, building, data.category, ctx.reserved);

    if (data.uniqueCode) {
      if (ctx.reserved.has(code)) throw new ConflictError(`Duplicate code in request: ${code}`);
      const existing = await tx.inventoryItem.findFirst({ where: { tenantId, uniqueCode: code }, select: { id: true } });
      if (existing) throw new ConflictError(`Inventory item with code ${code} already exists`);
      ctx.reserved.add(code);
    }

    const status = data.status || this._defaultStatusFor(data.roomId);
    const item = await tx.inventoryItem.create({
      data: {
        tenantId,
        buildingId: building.id,
        roomId: data.roomId ?? null,
        name: data.name,
        category: data.category,
        uniqueCode: code,
        qrCode: this._qrPayload(code),
        serialNumber: data.serialNumber ?? null,
        brand: data.brand ?? null,
        model: data.model ?? null,
        vendor: data.vendor ?? null,
        invoiceNumber: data.invoiceNumber ?? null,
        purchaseDate: toDate(data.purchaseDate) ?? null,
        purchasePrice: data.purchasePrice ?? null,
        salvageValue: data.salvageValue ?? null,
        usefulLifeYears: data.usefulLifeYears ?? null,
        warrantyUntil: toDate(data.warrantyUntil) ?? null,
        nextServiceDate: toDate(data.nextServiceDate) ?? null,
        condition: data.condition || 'NEW',
        status,
        notes: data.notes ?? null,
      },
      include: ITEM_INCLUDE,
    });

    await this._log(tx, item.id, {
      action: 'CREATED',
      toBuildingId: item.buildingId,
      toRoomId: item.roomId,
      condition: item.condition,
      status: item.status,
      performedBy,
    });

    return item;
  }

  _newCtx() {
    return { buildings: new Map(), rooms: new Set(), reserved: new Set() };
  }

  async create(tenantId, data, performedBy) {
    const item = await prisma.$transaction(
      (tx) => this._createInTx(tx, tenantId, data, performedBy, this._newCtx()),
      TX_OPTIONS,
    );
    return this._decorate(item);
  }

  async bulkCreate(tenantId, body, performedBy) {
    let items = body.items;
    if (!items) {
      if (body.quantity > 1 && body.template.uniqueCode) {
        throw new ValidationError('A fixed uniqueCode cannot be used with quantity > 1');
      }
      items = Array.from({ length: body.quantity }, () => ({ ...body.template }));
    }

    const created = await prisma.$transaction(async (tx) => {
      const ctx = this._newCtx();
      const results = [];
      for (const data of items) {
        results.push(await this._createInTx(tx, tenantId, data, performedBy, ctx));
      }
      return results;
    }, TX_OPTIONS);

    return { count: created.length, items: created.map((i) => this._decorate(i)) };
  }

  // ─── read ─────────────────────────────────────────────────────

  _buildWhere(tenantId, query) {
    const where = { tenantId, deletedAt: query.onlyDeleted ? { not: null } : null };
    const and = [];

    if (query.buildingId) where.buildingId = query.buildingId;
    if (query.roomId) where.roomId = query.roomId;
    if (query.category) where.category = query.category;
    if (query.condition) where.condition = query.condition;
    if (query.assignedResidentId) where.assignedResidentId = query.assignedResidentId;
    if (query.unassigned) where.assignedResidentId = null;

    if (query.status) where.status = query.status;
    else if (query.inStorage) where.status = 'IN_STORAGE';
    else if (!query.includeDisposed && !query.onlyDeleted) where.status = { not: 'DISPOSED' };

    if (query.search) {
      const contains = { contains: query.search, mode: 'insensitive' };
      and.push({
        OR: ['name', 'uniqueCode', 'category', 'serialNumber', 'brand', 'model'].map((f) => ({ [f]: contains })),
      });
    }

    if (query.warrantyExpiringInDays) {
      where.warrantyUntil = { gte: new Date(), lte: nowPlus(query.warrantyExpiringInDays) };
    } else if (query.warrantyExpired) {
      where.warrantyUntil = { lt: new Date() };
    }
    if (query.serviceDue) where.nextServiceDate = { lte: new Date() };

    if (query.purchasedFrom || query.purchasedTo) {
      where.purchaseDate = {
        ...(query.purchasedFrom && { gte: new Date(query.purchasedFrom) }),
        ...(query.purchasedTo && { lte: new Date(query.purchasedTo) }),
      };
    }

    if (and.length) where.AND = and;
    return where;
  }

  async findAll(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const orderBy = parseSort(query, ITEM_SORT_FIELDS, 'createdAt');
    const where = this._buildWhere(tenantId, query);

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({ where, skip, take: limit, orderBy, include: ITEM_INCLUDE }),
      prisma.inventoryItem.count({ where }),
    ]);

    return { items: items.map((i) => this._decorate(i)), pagination: { page, limit, total } };
  }

  async findById(tenantId, id) {
    const item = await prisma.inventoryItem.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        ...ITEM_INCLUDE,
        attachments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        serviceLogs: { orderBy: { openedAt: 'desc' }, take: 10 },
        history: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!item) throw new NotFoundError('Inventory item');
    return this._decorate(item);
  }

  async findByCode(tenantId, code) {
    const item = await prisma.inventoryItem.findFirst({
      where: { tenantId, uniqueCode: this._normalizeCode(code), deletedAt: null },
      select: { id: true },
    });
    if (!item) throw new NotFoundError('Inventory item');
    return this.findById(tenantId, item.id);
  }

  async getHistory(tenantId, id, query) {
    await this._getItem(tenantId, id, { includeDeleted: true });
    const { page, limit, skip } = parsePagination(query);
    const where = { inventoryItemId: id };

    const [rows, total] = await Promise.all([
      prisma.inventoryHistory.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.inventoryHistory.count({ where }),
    ]);

    const uniq = (key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))];
    const [users, rooms, buildings, residents] = await Promise.all([
      prisma.tenantUser.findMany({
        where: { id: { in: uniq('performedBy') }, tenantId },
        select: { id: true, firstName: true, lastName: true },
      }),
      prisma.room.findMany({
        where: { id: { in: [...uniq('fromRoomId'), ...uniq('toRoomId')] }, tenantId },
        select: { id: true, name: true, number: true },
      }),
      prisma.building.findMany({
        where: { id: { in: [...uniq('fromBuildingId'), ...uniq('toBuildingId')] }, tenantId },
        select: { id: true, name: true },
      }),
      prisma.resident.findMany({
        where: { id: { in: uniq('residentId') }, tenantId },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    const byId = (list) => new Map(list.map((x) => [x.id, x]));
    const userMap = byId(users); const roomMap = byId(rooms);
    const buildingMap = byId(buildings); const residentMap = byId(residents);

    const history = rows.map((r) => ({
      ...r,
      performedByUser: userMap.get(r.performedBy) || null,
      fromRoom: roomMap.get(r.fromRoomId) || null,
      toRoom: roomMap.get(r.toRoomId) || null,
      fromBuilding: buildingMap.get(r.fromBuildingId) || null,
      toBuilding: buildingMap.get(r.toBuildingId) || null,
      resident: residentMap.get(r.residentId) || null,
    }));

    return { history, pagination: { page, limit, total } };
  }

  async getCategories(tenantId) {
    const used = await prisma.inventoryItem.groupBy({
      by: ['category'],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    });
    const counts = new Map(used.map((u) => [u.category, u._count._all]));
    const all = [...new Set([...INVENTORY_CATEGORIES, ...counts.keys()])].sort();
    return all.map((name) => ({ name, count: counts.get(name) || 0 }));
  }

  // ─── update / lifecycle ───────────────────────────────────────

  async update(tenantId, id, data, performedBy) {
    const item = await this._getItem(tenantId, id);
    this._assertEditable(item);

    if (data.condition === 'DISPOSED') throw new ValidationError('Use the dispose endpoint to retire an item');

    const patch = {};
    for (const field of UPDATABLE_FIELDS) {
      if (data[field] !== undefined) patch[field] = DATE_FIELDS.includes(field) ? toDate(data[field]) : data[field];
    }

    if (patch.uniqueCode && patch.uniqueCode !== item.uniqueCode) {
      const taken = await prisma.inventoryItem.findFirst({
        where: { tenantId, uniqueCode: patch.uniqueCode, id: { not: id } },
        select: { id: true },
      });
      if (taken) throw new ConflictError(`Inventory item with code ${patch.uniqueCode} already exists`);
      patch.qrCode = this._qrPayload(patch.uniqueCode);
    } else {
      delete patch.uniqueCode;
    }

    const changedFields = Object.keys(patch).filter((k) => k !== 'qrCode' && k !== 'condition');
    const conditionChanged = patch.condition && patch.condition !== item.condition;

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryItem.update({ where: { id }, data: patch, include: ITEM_INCLUDE });

      if (changedFields.length) {
        await this._log(tx, id, {
          action: 'UPDATED',
          condition: result.condition,
          status: result.status,
          notes: `Updated: ${changedFields.join(', ')}`,
          performedBy,
        });
      }
      if (conditionChanged) {
        await this._log(tx, id, {
          action: 'CONDITION_CHANGED',
          condition: patch.condition,
          status: result.status,
          notes: `Changed from ${item.condition} to ${patch.condition}`,
          performedBy,
        });
      }
      return result;
    });

    return this._decorate(updated);
  }

  async _applyTransfer(tx, tenantId, item, dest, reason, performedBy) {
    const toBuildingId = dest.toBuildingId ?? item.buildingId;
    const buildingChanged = toBuildingId !== item.buildingId;
    const toRoomId = dest.toRoomId !== undefined ? dest.toRoomId : (buildingChanged ? null : item.roomId);

    if (toBuildingId === item.buildingId && toRoomId === item.roomId) {
      throw new ValidationError(`Item ${item.uniqueCode} is already at the destination`);
    }

    let status = item.status;
    if (toRoomId && status === 'IN_STORAGE') status = 'IN_USE';
    if (!toRoomId && status === 'IN_USE') status = 'IN_STORAGE';

    const updated = await tx.inventoryItem.update({
      where: { id: item.id },
      data: { buildingId: toBuildingId, roomId: toRoomId, status },
      include: ITEM_INCLUDE,
    });

    await this._log(tx, item.id, {
      action: 'TRANSFERRED',
      fromBuildingId: item.buildingId,
      toBuildingId,
      fromRoomId: item.roomId,
      toRoomId,
      condition: item.condition,
      status,
      notes: reason || null,
      performedBy,
    });
    return updated;
  }

  async _validateDestination(tenantId, dest, db = prisma) {
    if (dest.toBuildingId) await this._assertBuilding(tenantId, dest.toBuildingId, db);
    if (dest.toRoomId) {
      const room = await this._assertRoom(tenantId, dest.toRoomId, null, db);
      if (dest.toBuildingId && room.buildingId !== dest.toBuildingId) {
        throw new ValidationError('Room does not belong to the destination building');
      }
      return room;
    }
    return null;
  }

  _assertMovable(item) {
    this._assertEditable(item);
    if (item.status === 'LOST') throw new ConflictError(`Item ${item.uniqueCode} is marked lost`);
  }

  async transfer(tenantId, id, dest, performedBy) {
    const item = await this._getItem(tenantId, id);
    this._assertMovable(item);

    const room = await this._validateDestination(tenantId, dest);
    // A room without an explicit building implies the room's building.
    const effective = { ...dest, toBuildingId: dest.toBuildingId ?? (room ? room.buildingId : undefined) };

    const updated = await prisma.$transaction(
      (tx) => this._applyTransfer(tx, tenantId, item, effective, dest.reason, performedBy),
    );
    return this._decorate(updated);
  }

  async bulkTransfer(tenantId, { itemIds, ...dest }, performedBy) {
    const ids = [...new Set(itemIds)];
    const items = await prisma.inventoryItem.findMany({ where: { id: { in: ids }, tenantId, deletedAt: null } });
    if (items.length !== ids.length) {
      const found = new Set(items.map((i) => i.id));
      throw new NotFoundError(`Inventory items (${ids.filter((i) => !found.has(i)).join(', ')})`);
    }

    const room = await this._validateDestination(tenantId, dest);
    const effective = { ...dest, toBuildingId: dest.toBuildingId ?? (room ? room.buildingId : undefined) };
    if (room && room.buildingId !== effective.toBuildingId) {
      throw new ValidationError('Room does not belong to the destination building');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const out = [];
      for (const item of items) {
        this._assertMovable(item);
        out.push(await this._applyTransfer(tx, tenantId, item, effective, dest.reason, performedBy));
      }
      return out;
    }, TX_OPTIONS);

    return { count: updated.length, items: updated.map((i) => this._decorate(i)) };
  }

  async setStatus(tenantId, id, { status, reason }, performedBy) {
    const item = await this._getItem(tenantId, id);
    this._assertEditable(item);
    if (item.status === status) throw new ConflictError(`Item is already ${status}`);
    if (item.status === 'UNDER_REPAIR') {
      throw new ConflictError('Item is under repair. Complete or cancel the open repair first');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryItem.update({
        where: { id },
        data: { status, ...(status === 'LOST' && { assignedResidentId: null }) },
        include: ITEM_INCLUDE,
      });
      await this._log(tx, id, {
        action: status === 'LOST' ? 'MARKED_LOST' : 'STATUS_CHANGED',
        condition: item.condition,
        status,
        residentId: status === 'LOST' ? item.assignedResidentId : null,
        notes: reason || `Status changed from ${item.status} to ${status}`,
        performedBy,
      });
      return result;
    });
    return this._decorate(updated);
  }

  async assign(tenantId, id, { residentId, notes }, performedBy) {
    const item = await this._getItem(tenantId, id);
    this._assertEditable(item);
    if (['LOST', 'UNDER_REPAIR'].includes(item.status)) {
      throw new ConflictError(`Item cannot be assigned while ${item.status}`);
    }
    if (item.assignedResidentId === residentId) throw new ConflictError('Item is already assigned to this resident');
    if (item.assignedResidentId) throw new ConflictError('Item is assigned to another resident. Unassign it first');

    const resident = await this._assertResident(tenantId, residentId);
    if (resident.status !== 'ACTIVE') throw new ConflictError('Items can only be assigned to active residents');

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryItem.update({
        where: { id },
        data: { assignedResidentId: residentId, status: 'IN_USE' },
        include: ITEM_INCLUDE,
      });
      await this._log(tx, id, {
        action: 'ASSIGNED',
        residentId,
        condition: item.condition,
        status: 'IN_USE',
        notes: notes || null,
        performedBy,
      });
      return result;
    });
    return this._decorate(updated);
  }

  async unassign(tenantId, id, { condition, notes } = {}, performedBy) {
    const item = await this._getItem(tenantId, id);
    this._assertEditable(item);
    if (!item.assignedResidentId) throw new ConflictError('Item is not assigned to a resident');
    if (condition === 'DISPOSED') throw new ValidationError('Use the dispose endpoint to retire an item');

    const returnedCondition = condition || item.condition;
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryItem.update({
        where: { id },
        data: { assignedResidentId: null, condition: returnedCondition },
        include: ITEM_INCLUDE,
      });
      await this._log(tx, id, {
        action: 'UNASSIGNED',
        residentId: item.assignedResidentId,
        condition: returnedCondition,
        status: result.status,
        notes: notes || (returnedCondition !== item.condition ? `Returned as ${returnedCondition} (was ${item.condition})` : null),
        performedBy,
      });
      return result;
    });
    return this._decorate(updated);
  }

  async dispose(tenantId, id, { reason, disposalValue }, performedBy) {
    const item = await this._getItem(tenantId, id);
    if (item.status === 'DISPOSED') throw new ConflictError('Item is already disposed');

    const updated = await prisma.$transaction(async (tx) => {
      await tx.inventoryServiceLog.updateMany({
        where: { inventoryItemId: id, status: 'OPEN' },
        data: { status: 'CANCELLED', resolution: 'Cancelled: item disposed' },
      });
      const result = await tx.inventoryItem.update({
        where: { id },
        data: {
          status: 'DISPOSED',
          condition: 'DISPOSED',
          disposedAt: new Date(),
          disposalReason: reason,
          disposalValue: disposalValue ?? null,
          assignedResidentId: null,
        },
        include: ITEM_INCLUDE,
      });
      await this._log(tx, id, {
        action: 'DISPOSED',
        fromBuildingId: item.buildingId,
        fromRoomId: item.roomId,
        residentId: item.assignedResidentId,
        condition: 'DISPOSED',
        status: 'DISPOSED',
        notes: reason,
        performedBy,
      });
      return result;
    });
    return this._decorate(updated);
  }

  /** Soft delete for entries made in error. The code is freed so it can be reused. */
  async softDelete(tenantId, id, performedBy) {
    const item = await this._getItem(tenantId, id);

    await prisma.$transaction(async (tx) => {
      await tx.inventoryServiceLog.updateMany({
        where: { inventoryItemId: id, status: 'OPEN' },
        data: { status: 'CANCELLED', resolution: 'Cancelled: item deleted' },
      });
      await tx.inventoryItem.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          assignedResidentId: null,
          uniqueCode: `${item.uniqueCode}${DELETED_MARKER}${Date.now().toString(36)}`,
        },
      });
      await this._log(tx, id, {
        action: 'DELETED',
        fromBuildingId: item.buildingId,
        fromRoomId: item.roomId,
        residentId: item.assignedResidentId,
        condition: item.condition,
        status: item.status,
        notes: `Deleted (code ${item.uniqueCode})`,
        performedBy,
      });
    });
    return null;
  }

  async restore(tenantId, id, performedBy) {
    const item = await this._getItem(tenantId, id, { includeDeleted: true });
    if (!item.deletedAt && item.status !== 'DISPOSED') {
      throw new ConflictError('Item is neither deleted nor disposed');
    }

    const data = {};
    if (item.deletedAt) {
      const originalCode = item.uniqueCode.split(DELETED_MARKER)[0];
      const taken = await prisma.inventoryItem.findFirst({
        where: { tenantId, uniqueCode: originalCode, id: { not: id } },
        select: { id: true },
      });
      if (taken) throw new ConflictError(`Code ${originalCode} is now used by another item`);
      data.deletedAt = null;
      data.uniqueCode = originalCode;
      data.qrCode = this._qrPayload(originalCode);
    }
    if (item.status === 'DISPOSED') {
      data.status = this._defaultStatusFor(item.roomId);
      data.condition = 'FAIR';
      data.disposedAt = null;
      data.disposalReason = null;
      data.disposalValue = null;
    }

    const restored = await prisma.$transaction(async (tx) => {
      const result = await tx.inventoryItem.update({ where: { id }, data, include: ITEM_INCLUDE });
      await this._log(tx, id, {
        action: 'RESTORED',
        condition: result.condition,
        status: result.status,
        performedBy,
      });
      return result;
    });
    return this._decorate(restored);
  }

  // ─── QR ───────────────────────────────────────────────────────

  async getQr(tenantId, id, { format = 'png', size = 300 } = {}) {
    const item = await this._getItem(tenantId, id);
    const payload = item.qrCode || this._qrPayload(item.uniqueCode);
    const options = { width: size, margin: 2, errorCorrectionLevel: 'M' };

    if (format === 'json') {
      return {
        type: 'json',
        data: {
          itemId: item.id, code: item.uniqueCode, name: item.name, payload,
          dataUrl: await QRCode.toDataURL(payload, options),
        },
      };
    }
    return { type: 'png', buffer: await QRCode.toBuffer(payload, options), filename: `${item.uniqueCode}.png` };
  }

  // ─── attachments ──────────────────────────────────────────────

  async addAttachment(tenantId, id, file, { kind = 'IMAGE' } = {}, uploadedBy) {
    if (!file) throw new ValidationError('File is required');
    const item = await this._getItem(tenantId, id);

    const count = await prisma.inventoryAttachment.count({ where: { inventoryItemId: id, deletedAt: null } });
    if (count >= MAX_ATTACHMENTS_PER_ITEM) {
      throw new ConflictError(`An item can have at most ${MAX_ATTACHMENTS_PER_ITEM} attachments`);
    }

    const result = await uploadToCloudinary(file.buffer, { folder: `ezehub/${tenantId}/inventory/${item.id}` });
    return prisma.inventoryAttachment.create({
      data: {
        tenantId,
        inventoryItemId: id,
        kind,
        name: file.originalname,
        url: result.secure_url,
        publicId: result.public_id,
        size: file.size,
        mimeType: file.mimetype,
        uploadedBy,
      },
    });
  }

  async deleteAttachment(tenantId, id, attachmentId) {
    const attachment = await prisma.inventoryAttachment.findFirst({
      where: { id: attachmentId, inventoryItemId: id, tenantId, deletedAt: null },
    });
    if (!attachment) throw new NotFoundError('Attachment');

    if (attachment.publicId) {
      const isImage = attachment.mimeType?.startsWith('image/') || attachment.mimeType === 'application/pdf';
      await cloudinary.uploader
        .destroy(attachment.publicId, { resource_type: isImage ? 'image' : 'raw' })
        .catch(() => {});
    }
    await prisma.inventoryAttachment.update({ where: { id: attachmentId }, data: { deletedAt: new Date() } });
    return null;
  }

  // ─── service / repair logs ────────────────────────────────────

  async openServiceLog(tenantId, id, data, createdBy) {
    const item = await this._getItem(tenantId, id);
    this._assertEditable(item);
    if (item.status === 'LOST') throw new ConflictError('Item is marked lost');

    if (data.type === 'REPAIR') {
      const openRepair = await prisma.inventoryServiceLog.findFirst({
        where: { inventoryItemId: id, type: 'REPAIR', status: 'OPEN' },
        select: { id: true },
      });
      if (openRepair) throw new ConflictError('This item already has an open repair');
    }

    return prisma.$transaction(async (tx) => {
      const log = await tx.inventoryServiceLog.create({
        data: {
          tenantId,
          inventoryItemId: id,
          type: data.type,
          description: data.description,
          vendor: data.vendor ?? null,
          cost: data.cost ?? null,
          nextServiceDate: toDate(data.nextServiceDate) ?? null,
          previousStatus: data.type === 'REPAIR' ? item.status : null,
          createdBy,
        },
      });

      if (data.type === 'REPAIR') {
        await tx.inventoryItem.update({ where: { id }, data: { status: 'UNDER_REPAIR' } });
      }
      await this._log(tx, id, {
        action: `${data.type}_OPENED`,
        condition: item.condition,
        status: data.type === 'REPAIR' ? 'UNDER_REPAIR' : item.status,
        notes: data.description,
        performedBy: createdBy,
      });
      return log;
    });
  }

  async _getServiceLog(tenantId, logId) {
    const log = await prisma.inventoryServiceLog.findFirst({
      where: { id: logId, tenantId },
      include: { inventoryItem: true },
    });
    if (!log) throw new NotFoundError('Service log');
    return log;
  }

  async _restoreStatusAfterRepair(tx, log, item) {
    const stillOpen = await tx.inventoryServiceLog.count({
      where: { inventoryItemId: item.id, type: 'REPAIR', status: 'OPEN', id: { not: log.id } },
    });
    if (stillOpen || item.status !== 'UNDER_REPAIR') return item.status;
    const prev = log.previousStatus;
    return prev && prev !== 'UNDER_REPAIR' ? prev : this._defaultStatusFor(item.roomId);
  }

  async completeServiceLog(tenantId, logId, data, performedBy) {
    const log = await this._getServiceLog(tenantId, logId);
    if (log.status !== 'OPEN') throw new ConflictError(`Service log is already ${log.status}`);
    const item = log.inventoryItem;
    if (data.condition === 'DISPOSED') throw new ValidationError('Use the dispose endpoint to retire an item');

    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const cost = data.cost ?? num(log.cost);
      const nextDate = toDate(data.nextServiceDate) ?? log.nextServiceDate ?? null;

      const updatedLog = await tx.inventoryServiceLog.update({
        where: { id: logId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
          resolution: data.resolution ?? null,
          cost,
          nextServiceDate: nextDate,
        },
      });

      const itemPatch = { lastServiceDate: now };
      if (nextDate) itemPatch.nextServiceDate = nextDate;
      else if (item.nextServiceDate && item.nextServiceDate <= now) itemPatch.nextServiceDate = null;
      if (data.condition) itemPatch.condition = data.condition;
      if (log.type === 'REPAIR') itemPatch.status = await this._restoreStatusAfterRepair(tx, log, item);
      if (item.status === 'DISPOSED') delete itemPatch.status;

      const updatedItem = await tx.inventoryItem.update({ where: { id: item.id }, data: itemPatch });

      await this._log(tx, item.id, {
        action: `${log.type}_COMPLETED`,
        condition: updatedItem.condition,
        status: updatedItem.status,
        notes: data.resolution || log.description,
        performedBy,
      });

      if (cost && cost > 0 && data.recordExpense !== false) {
        await tx.expenseRecord.create({
          data: {
            tenantId,
            buildingId: item.buildingId,
            category: 'Maintenance',
            amount: cost,
            description: `${log.type} - ${item.name} (${item.uniqueCode}): ${log.description}`.slice(0, 500),
            date: now,
            reference: `INV:${item.uniqueCode}`,
          },
        });
      }
      return updatedLog;
    });
  }

  async cancelServiceLog(tenantId, logId, performedBy) {
    const log = await this._getServiceLog(tenantId, logId);
    if (log.status !== 'OPEN') throw new ConflictError(`Service log is already ${log.status}`);
    const item = log.inventoryItem;

    return prisma.$transaction(async (tx) => {
      const updatedLog = await tx.inventoryServiceLog.update({
        where: { id: logId },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      let status = item.status;
      if (log.type === 'REPAIR' && item.status !== 'DISPOSED') {
        status = await this._restoreStatusAfterRepair(tx, log, item);
        await tx.inventoryItem.update({ where: { id: item.id }, data: { status } });
      }
      await this._log(tx, item.id, {
        action: `${log.type}_CANCELLED`,
        condition: item.condition,
        status,
        notes: log.description,
        performedBy,
      });
      return updatedLog;
    });
  }

  async listServiceLogs(tenantId, query, itemId) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId };
    const inventoryItemId = itemId || query.inventoryItemId;
    if (inventoryItemId) where.inventoryItemId = inventoryItemId;
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    if (query.buildingId) where.inventoryItem = { buildingId: query.buildingId };

    const [logs, total] = await Promise.all([
      prisma.inventoryServiceLog.findMany({
        where, skip, take: limit, orderBy: { openedAt: 'desc' },
        include: { inventoryItem: { select: { id: true, name: true, uniqueCode: true, buildingId: true } } },
      }),
      prisma.inventoryServiceLog.count({ where }),
    ]);
    return { logs, pagination: { page, limit, total } };
  }

  // ─── audits (stock-take) ──────────────────────────────────────

  async createAudit(tenantId, data, startedBy) {
    const building = await this._assertBuilding(tenantId, data.buildingId);
    if (data.roomId) await this._assertRoom(tenantId, data.roomId, building.id);

    const running = await prisma.inventoryAudit.findFirst({
      where: { tenantId, buildingId: building.id, roomId: data.roomId ?? null, status: 'IN_PROGRESS' },
      select: { id: true },
    });
    if (running) throw new ConflictError('An audit is already in progress for this location');

    const items = await prisma.inventoryItem.findMany({
      where: {
        tenantId, buildingId: building.id, deletedAt: null, status: { not: 'DISPOSED' },
        ...(data.roomId && { roomId: data.roomId }),
      },
      select: { id: true, roomId: true },
    });
    if (!items.length) throw new ValidationError('No inventory items to audit at this location');

    return prisma.$transaction(async (tx) => {
      const audit = await tx.inventoryAudit.create({
        data: {
          tenantId,
          buildingId: building.id,
          roomId: data.roomId ?? null,
          title: data.title || `Audit - ${building.name} - ${new Date().toISOString().slice(0, 10)}`,
          notes: data.notes ?? null,
          startedBy,
        },
      });
      await tx.inventoryAuditItem.createMany({
        data: items.map((i) => ({ auditId: audit.id, inventoryItemId: i.id, expectedRoomId: i.roomId })),
      });
      return { ...audit, totalExpected: items.length };
    }, TX_OPTIONS);
  }

  async _getAudit(tenantId, id) {
    const audit = await prisma.inventoryAudit.findFirst({ where: { id, tenantId } });
    if (!audit) throw new NotFoundError('Inventory audit');
    return audit;
  }

  async _auditProgress(auditId) {
    const groups = await prisma.inventoryAuditItem.groupBy({
      by: ['result'], where: { auditId }, _count: { _all: true },
    });
    const progress = { PENDING: 0, FOUND: 0, MISSING: 0, UNEXPECTED: 0 };
    groups.forEach((g) => { progress[g.result] = g._count._all; });
    return { ...progress, expected: progress.PENDING + progress.FOUND + progress.MISSING };
  }

  async listAudits(tenantId, query) {
    const { page, limit, skip } = parsePagination(query);
    const where = { tenantId };
    if (query.status) where.status = query.status;
    if (query.buildingId) where.buildingId = query.buildingId;

    const [audits, total] = await Promise.all([
      prisma.inventoryAudit.findMany({ where, skip, take: limit, orderBy: { startedAt: 'desc' } }),
      prisma.inventoryAudit.count({ where }),
    ]);
    return { audits, pagination: { page, limit, total } };
  }

  async getAudit(tenantId, id, query = {}) {
    const audit = await this._getAudit(tenantId, id);
    const [progress, items] = await Promise.all([
      this._auditProgress(id),
      prisma.inventoryAuditItem.findMany({
        where: { auditId: id, ...(query.result && { result: query.result }) },
        take: 2000,
        orderBy: [{ result: 'asc' }, { scannedAt: 'desc' }],
        include: {
          inventoryItem: { select: { id: true, name: true, uniqueCode: true, category: true, status: true, roomId: true } },
        },
      }),
    ]);
    return { ...audit, progress, items };
  }

  async scanAuditItem(tenantId, id, { code, foundRoomId, notes }, userId) {
    const audit = await this._getAudit(tenantId, id);
    if (audit.status !== 'IN_PROGRESS') throw new ConflictError('Audit is not in progress');

    const item = await prisma.inventoryItem.findFirst({
      where: { tenantId, uniqueCode: this._normalizeCode(code), deletedAt: null },
      select: { id: true, name: true, uniqueCode: true, roomId: true, buildingId: true, status: true },
    });
    if (!item) throw new NotFoundError('Inventory item');
    if (foundRoomId) await this._assertRoom(tenantId, foundRoomId, audit.buildingId);

    const where = { auditId_inventoryItemId: { auditId: id, inventoryItemId: item.id } };
    const existing = await prisma.inventoryAuditItem.findUnique({ where });
    const locatedAt = foundRoomId ?? audit.roomId ?? existing?.expectedRoomId ?? item.roomId;

    const scanned = existing
      ? await prisma.inventoryAuditItem.update({
        where,
        data: {
          result: existing.result === 'UNEXPECTED' ? 'UNEXPECTED' : 'FOUND',
          scannedAt: new Date(),
          foundRoomId: locatedAt,
          notes: notes ?? existing.notes,
        },
      })
      : await prisma.inventoryAuditItem.create({
        data: {
          auditId: id, inventoryItemId: item.id, result: 'UNEXPECTED', expectedRoomId: item.roomId,
          foundRoomId: locatedAt, scannedAt: new Date(), notes: notes ?? null,
        },
      });

    const expectedRoom = existing?.expectedRoomId ?? item.roomId;
    return {
      result: scanned.result,
      alreadyScanned: Boolean(existing?.scannedAt),
      misplaced: Boolean(locatedAt && expectedRoom && locatedAt !== expectedRoom),
      item,
      progress: await this._auditProgress(id),
      scannedBy: userId,
    };
  }

  async completeAudit(tenantId, id, { markMissingAsLost = false, notes } = {}, userId) {
    const audit = await this._getAudit(tenantId, id);
    if (audit.status !== 'IN_PROGRESS') throw new ConflictError('Audit is not in progress');

    await prisma.$transaction(async (tx) => {
      await tx.inventoryAuditItem.updateMany({
        where: { auditId: id, result: 'PENDING' }, data: { result: 'MISSING' },
      });

      // Items previously marked lost that were found again return to the register.
      const recovered = await tx.inventoryAuditItem.findMany({
        where: { auditId: id, result: 'FOUND', inventoryItem: { status: 'LOST' } },
        include: { inventoryItem: true },
      });
      for (const row of recovered) {
        const status = this._defaultStatusFor(row.inventoryItem.roomId);
        await tx.inventoryItem.update({ where: { id: row.inventoryItemId }, data: { status } });
        await this._log(tx, row.inventoryItemId, {
          action: 'FOUND_IN_AUDIT', condition: row.inventoryItem.condition, status,
          notes: audit.title, performedBy: userId,
        });
      }

      if (markMissingAsLost) {
        const missing = await tx.inventoryAuditItem.findMany({
          where: { auditId: id, result: 'MISSING', inventoryItem: { status: { in: LIVE_STATUSES } } },
          include: { inventoryItem: true },
        });
        for (const row of missing) {
          await tx.inventoryItem.update({
            where: { id: row.inventoryItemId },
            data: { status: 'LOST', assignedResidentId: null },
          });
          await this._log(tx, row.inventoryItemId, {
            action: 'MARKED_LOST', condition: row.inventoryItem.condition, status: 'LOST',
            residentId: row.inventoryItem.assignedResidentId,
            notes: `Missing in audit: ${audit.title}`, performedBy: userId,
          });
        }
      }

      await tx.inventoryAudit.update({
        where: { id },
        data: { status: 'COMPLETED', completedAt: new Date(), notes: notes ?? audit.notes },
      });
    }, TX_OPTIONS);

    return this.getAudit(tenantId, id);
  }

  async cancelAudit(tenantId, id) {
    const audit = await this._getAudit(tenantId, id);
    if (audit.status !== 'IN_PROGRESS') throw new ConflictError('Audit is not in progress');
    return prisma.inventoryAudit.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
  }

  // ─── analytics ────────────────────────────────────────────────

  async getSummary(tenantId, buildingId) {
    const base = { tenantId, deletedAt: null, ...(buildingId && { buildingId }) };
    const live = { ...base, status: { not: 'DISPOSED' } };
    const now = new Date();

    const [
      byStatus, byCondition, byCategory, byBuilding, valueRows,
      warrantyExpiring, warrantyExpired, serviceDue, unassigned, openServiceLogs, repairSpend,
    ] = await Promise.all([
      prisma.inventoryItem.groupBy({ by: ['status'], where: base, _count: { _all: true } }),
      prisma.inventoryItem.groupBy({ by: ['condition'], where: live, _count: { _all: true } }),
      prisma.inventoryItem.groupBy({
        by: ['category'], where: live, _count: { _all: true }, _sum: { purchasePrice: true },
      }),
      buildingId ? Promise.resolve([]) : prisma.inventoryItem.groupBy({
        by: ['buildingId'], where: live, _count: { _all: true }, _sum: { purchasePrice: true },
      }),
      prisma.inventoryItem.findMany({
        where: { ...live, purchasePrice: { not: null } },
        select: { purchasePrice: true, salvageValue: true, usefulLifeYears: true, purchaseDate: true, status: true, disposalValue: true },
      }),
      prisma.inventoryItem.count({ where: { ...live, warrantyUntil: { gte: now, lte: nowPlus(30) } } }),
      prisma.inventoryItem.count({ where: { ...live, warrantyUntil: { lt: now } } }),
      prisma.inventoryItem.count({ where: { ...live, nextServiceDate: { lte: now } } }),
      prisma.inventoryItem.count({ where: { ...live, assignedResidentId: null } }),
      prisma.inventoryServiceLog.count({
        where: { tenantId, status: 'OPEN', ...(buildingId && { inventoryItem: { buildingId } }) },
      }),
      prisma.inventoryServiceLog.aggregate({
        where: {
          tenantId, status: 'COMPLETED', completedAt: { gte: new Date(now.getFullYear(), 0, 1) },
          ...(buildingId && { inventoryItem: { buildingId } }),
        },
        _sum: { cost: true },
      }),
    ]);

    let totalPurchaseValue = 0;
    let totalCurrentValue = 0;
    for (const row of valueRows) {
      totalPurchaseValue += num(row.purchasePrice) || 0;
      totalCurrentValue += this._valuation(row).currentValue || 0;
    }

    let buildingNames = new Map();
    if (byBuilding.length) {
      const buildings = await prisma.building.findMany({
        where: { id: { in: byBuilding.map((b) => b.buildingId) }, tenantId },
        select: { id: true, name: true },
      });
      buildingNames = new Map(buildings.map((b) => [b.id, b.name]));
    }

    const statusCounts = Object.fromEntries(byStatus.map((s) => [s.status, s._count._all]));
    const totalItems = byStatus.reduce((sum, s) => (s.status === 'DISPOSED' ? sum : sum + s._count._all), 0);

    return {
      totalItems,
      byStatus: statusCounts,
      byCondition: byCondition.map((c) => ({ condition: c.condition, count: c._count._all })),
      byCategory: byCategory
        .map((c) => ({ category: c.category, count: c._count._all, purchaseValue: num(c._sum.purchasePrice) || 0 }))
        .sort((a, b) => b.count - a.count),
      byBuilding: byBuilding.map((b) => ({
        buildingId: b.buildingId,
        buildingName: buildingNames.get(b.buildingId) || null,
        count: b._count._all,
        purchaseValue: num(b._sum.purchasePrice) || 0,
      })),
      valuation: {
        totalPurchaseValue: Math.round(totalPurchaseValue * 100) / 100,
        totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
        totalDepreciation: Math.round((totalPurchaseValue - totalCurrentValue) * 100) / 100,
      },
      attention: {
        warrantyExpiringIn30Days: warrantyExpiring,
        warrantyExpired,
        serviceDue,
        unassigned,
        openServiceLogs,
        underRepair: statusCounts.UNDER_REPAIR || 0,
        lost: statusCounts.LOST || 0,
      },
      repairSpendThisYear: num(repairSpend._sum.cost) || 0,
    };
  }

  async getAlerts(tenantId, { buildingId, days = 30 } = {}) {
    const live = { tenantId, deletedAt: null, status: { in: LIVE_STATUSES }, ...(buildingId && { buildingId }) };
    const now = new Date();
    const select = {
      id: true, name: true, uniqueCode: true, category: true, condition: true, status: true,
      warrantyUntil: true, nextServiceDate: true,
      building: { select: { id: true, name: true } },
      room: { select: { id: true, name: true, number: true } },
    };
    const take = 50;

    const [warrantyExpiring, serviceDue, poorCondition, lost, openRepairs] = await Promise.all([
      prisma.inventoryItem.findMany({
        where: { ...live, warrantyUntil: { gte: now, lte: nowPlus(days) } },
        select, take, orderBy: { warrantyUntil: 'asc' },
      }),
      prisma.inventoryItem.findMany({
        where: { ...live, nextServiceDate: { lte: nowPlus(days) } },
        select, take, orderBy: { nextServiceDate: 'asc' },
      }),
      prisma.inventoryItem.findMany({
        where: { ...live, status: { not: 'UNDER_REPAIR' }, condition: { in: ['POOR', 'DAMAGED'] } },
        select, take, orderBy: { updatedAt: 'desc' },
      }),
      prisma.inventoryItem.findMany({
        where: { tenantId, deletedAt: null, status: 'LOST', ...(buildingId && { buildingId }) },
        select, take, orderBy: { updatedAt: 'desc' },
      }),
      prisma.inventoryServiceLog.findMany({
        where: { tenantId, status: 'OPEN', ...(buildingId && { inventoryItem: { buildingId } }) },
        take, orderBy: { openedAt: 'asc' },
        include: { inventoryItem: { select: { id: true, name: true, uniqueCode: true } } },
      }),
    ]);

    return {
      windowDays: days,
      warrantyExpiring: warrantyExpiring.map((i) => this._decorate(i)),
      serviceDue: serviceDue.map((i) => this._decorate(i)),
      poorCondition,
      lost,
      openRepairs,
      counts: {
        warrantyExpiring: warrantyExpiring.length,
        serviceDue: serviceDue.length,
        poorCondition: poorCondition.length,
        lost: lost.length,
        openRepairs: openRepairs.length,
      },
    };
  }

  // ─── export ───────────────────────────────────────────────────

  _csvCell(value) {
    if (value === null || value === undefined) return '';
    let s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  async exportCsv(tenantId, query) {
    const where = this._buildWhere(tenantId, query);
    const items = await prisma.inventoryItem.findMany({
      where, take: EXPORT_ROW_LIMIT, orderBy: { createdAt: 'desc' },
      include: ITEM_INCLUDE,
    });

    const columns = [
      ['Code', (i) => i.uniqueCode], ['Name', (i) => i.name], ['Category', (i) => i.category],
      ['Building', (i) => i.building?.name], ['Room', (i) => i.room?.number],
      ['Status', (i) => i.status], ['Condition', (i) => i.condition],
      ['Assigned To', (i) => (i.assignedResident ? `${i.assignedResident.firstName} ${i.assignedResident.lastName}` : '')],
      ['Brand', (i) => i.brand], ['Model', (i) => i.model], ['Serial Number', (i) => i.serialNumber],
      ['Vendor', (i) => i.vendor], ['Invoice Number', (i) => i.invoiceNumber],
      ['Purchase Date', (i) => i.purchaseDate], ['Purchase Price', (i) => num(i.purchasePrice)],
      ['Current Value', (i) => this._valuation(i).currentValue],
      ['Warranty Until', (i) => i.warrantyUntil], ['Next Service', (i) => i.nextServiceDate],
      ['Notes', (i) => i.notes],
    ];

    const lines = [columns.map(([h]) => h).join(',')];
    for (const item of items) lines.push(columns.map(([, fn]) => this._csvCell(fn(item))).join(','));
    return { csv: `\uFEFF${lines.join('\r\n')}\r\n`, rows: items.length };
  }
}

export default new InventoryService();
