import inventoryService from '../services/inventory.service.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res, next); } catch (error) { next(error); }
};

const ctx = (req) => ({ tenantId: req.tenantId, userId: req.user.id });

// ─── Items ──────────────────────────────────────────────────────
export const listItems = wrap(async (req, res) => {
  const { items, pagination } = await inventoryService.findAll(req.tenantId, req.query);
  paginatedResponse(res, items, pagination);
});

export const createItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.create(tenantId, req.body, userId), 'Inventory item created', 201);
});

export const bulkCreateItems = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  const result = await inventoryService.bulkCreate(tenantId, req.body, userId);
  successResponse(res, result, `${result.count} inventory items created`, 201);
});

export const getItem = wrap(async (req, res) => {
  successResponse(res, await inventoryService.findById(req.tenantId, req.params.id));
});

export const getItemByCode = wrap(async (req, res) => {
  successResponse(res, await inventoryService.findByCode(req.tenantId, req.params.code));
});

export const updateItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.update(tenantId, req.params.id, req.body, userId), 'Inventory updated');
});

export const deleteItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  await inventoryService.softDelete(tenantId, req.params.id, userId);
  successResponse(res, null, 'Inventory deleted');
});

export const restoreItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.restore(tenantId, req.params.id, userId), 'Inventory item restored');
});

export const getItemHistory = wrap(async (req, res) => {
  const { history, pagination } = await inventoryService.getHistory(req.tenantId, req.params.id, req.query);
  paginatedResponse(res, history, pagination);
});

// ─── Lifecycle ──────────────────────────────────────────────────
export const transferItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.transfer(tenantId, req.params.id, req.body, userId), 'Inventory item transferred');
});

export const bulkTransferItems = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  const result = await inventoryService.bulkTransfer(tenantId, req.body, userId);
  successResponse(res, result, `${result.count} inventory items transferred`);
});

export const setItemStatus = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.setStatus(tenantId, req.params.id, req.body, userId), 'Inventory status updated');
});

export const assignItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.assign(tenantId, req.params.id, req.body, userId), 'Inventory item assigned');
});

export const unassignItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.unassign(tenantId, req.params.id, req.body, userId), 'Inventory item unassigned');
});

export const disposeItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.dispose(tenantId, req.params.id, req.body, userId), 'Inventory item disposed');
});

// ─── QR ─────────────────────────────────────────────────────────
export const getItemQr = wrap(async (req, res) => {
  const qr = await inventoryService.getQr(req.tenantId, req.params.id, req.query);
  if (qr.type === 'json') return successResponse(res, qr.data);
  res.set({
    'Content-Type': 'image/png',
    'Content-Disposition': `inline; filename="${qr.filename}"`,
    'Cache-Control': 'private, max-age=3600',
  });
  return res.send(qr.buffer);
});

// ─── Attachments ────────────────────────────────────────────────
export const uploadAttachment = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  const attachment = await inventoryService.addAttachment(tenantId, req.params.id, req.file, req.body, userId);
  successResponse(res, attachment, 'Attachment uploaded', 201);
});

export const deleteAttachment = wrap(async (req, res) => {
  await inventoryService.deleteAttachment(req.tenantId, req.params.id, req.params.attachmentId);
  successResponse(res, null, 'Attachment deleted');
});

// ─── Service / repair logs ──────────────────────────────────────
export const listServiceLogs = wrap(async (req, res) => {
  const { logs, pagination } = await inventoryService.listServiceLogs(req.tenantId, req.query);
  paginatedResponse(res, logs, pagination);
});

export const listItemServiceLogs = wrap(async (req, res) => {
  const { logs, pagination } = await inventoryService.listServiceLogs(req.tenantId, req.query, req.params.id);
  paginatedResponse(res, logs, pagination);
});

export const openServiceLog = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.openServiceLog(tenantId, req.params.id, req.body, userId), 'Service log opened', 201);
});

export const completeServiceLog = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.completeServiceLog(tenantId, req.params.logId, req.body, userId), 'Service log completed');
});

export const cancelServiceLog = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.cancelServiceLog(tenantId, req.params.logId, userId), 'Service log cancelled');
});

// ─── Audits ─────────────────────────────────────────────────────
export const listAudits = wrap(async (req, res) => {
  const { audits, pagination } = await inventoryService.listAudits(req.tenantId, req.query);
  paginatedResponse(res, audits, pagination);
});

export const createAudit = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.createAudit(tenantId, req.body, userId), 'Audit started', 201);
});

export const getAudit = wrap(async (req, res) => {
  successResponse(res, await inventoryService.getAudit(req.tenantId, req.params.id, req.query));
});

export const scanAuditItem = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.scanAuditItem(tenantId, req.params.id, req.body, userId), 'Item scanned');
});

export const completeAudit = wrap(async (req, res) => {
  const { tenantId, userId } = ctx(req);
  successResponse(res, await inventoryService.completeAudit(tenantId, req.params.id, req.body, userId), 'Audit completed');
});

export const cancelAudit = wrap(async (req, res) => {
  successResponse(res, await inventoryService.cancelAudit(req.tenantId, req.params.id), 'Audit cancelled');
});

// ─── Analytics & export ─────────────────────────────────────────
export const getSummary = wrap(async (req, res) => {
  successResponse(res, await inventoryService.getSummary(req.tenantId, req.query.buildingId));
});

export const getAlerts = wrap(async (req, res) => {
  successResponse(res, await inventoryService.getAlerts(req.tenantId, req.query));
});

export const getCategories = wrap(async (req, res) => {
  successResponse(res, await inventoryService.getCategories(req.tenantId));
});

export const exportItems = wrap(async (req, res) => {
  const { csv, rows } = await inventoryService.exportCsv(req.tenantId, req.query);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="inventory-${new Date().toISOString().slice(0, 10)}.csv"`,
    'X-Row-Count': String(rows),
  });
  res.send(csv);
});
