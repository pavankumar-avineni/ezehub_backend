import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requirePlatform } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../constants/index.js';
import {
  createPlatformRoleSchema, updatePlatformRoleSchema, setPlatformRolePermissionsSchema, activityQuerySchema,
  loginHistoryQuerySchema, teamReportQuerySchema, idParamSchema,
} from '../validators/index.js';
import platformRoleService from '../services/platformRole.service.js';
import activityService from '../services/activity.service.js';
import platformReportService from '../services/platformReport.service.js';
import { successResponse, paginatedResponse } from '../utils/response.js';
import { ACTIVITY_EVENTS } from '../constants/platformAccess.js';

const router = Router();

router.use(authenticate, requirePlatform);

const who = (req) => `${req.user.firstName} ${req.user.lastName}`.trim();
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };

const ROLES_MANAGE = authorize(PERMISSIONS.PLATFORM_ROLES_MANAGE);
// The role list is also needed to pick a role when creating an employee.
const ROLES_VIEW = authorize(PERMISSIONS.PLATFORM_ROLES_MANAGE, PERMISSIONS.PLATFORM_EMPLOYEES_READ);
const AUDIT = authorize(PERMISSIONS.PLATFORM_AUDIT_READ);

// ── Roles & permissions (for your own employees) ──
router.get('/permissions', ROLES_MANAGE, handle(async (_req, res) => {
  successResponse(res, await platformRoleService.listPermissions());
}));

router.get('/roles', ROLES_VIEW, handle(async (_req, res) => {
  successResponse(res, await platformRoleService.list());
}));

router.get('/roles/:id', ROLES_VIEW, validate(idParamSchema), handle(async (req, res) => {
  successResponse(res, await platformRoleService.get(req.params.id));
}));

router.post('/roles', ROLES_MANAGE, validate(createPlatformRoleSchema), handle(async (req, res) => {
  const role = await platformRoleService.create(req.body, req.user);
  await activityService.log(req, {
    event: 'role.created', entity: 'role', entityId: role.id,
    summary: `${who(req)} created the role "${role.name}" with ${role.permissions.length} permission(s)`,
    details: { permissions: role.permissions.map((p) => p.code) },
  });
  successResponse(res, role, 'Role created', 201);
}));

router.put('/roles/:id', ROLES_MANAGE, validate(updatePlatformRoleSchema), handle(async (req, res) => {
  const role = await platformRoleService.update(req.params.id, req.body);
  await activityService.log(req, {
    event: 'role.updated', entity: 'role', entityId: role.id,
    summary: `${who(req)} updated the role "${role.name}"`, details: req.body,
  });
  successResponse(res, role, 'Role updated');
}));

router.put('/roles/:id/permissions', ROLES_MANAGE, validate(setPlatformRolePermissionsSchema), handle(async (req, res) => {
  const { role, added, removed } = await platformRoleService.setPermissions(req.params.id, req.body.permissionIds, req.user);
  await activityService.log(req, {
    event: 'role.permissions_changed', entity: 'role', entityId: role.id,
    summary: `${who(req)} changed the permissions of "${role.name}" (+${added.length} / -${removed.length})`,
    details: { added, removed },
  });
  successResponse(res, { ...role, added, removed }, 'Permissions updated. Employees with this role get them immediately');
}));

router.delete('/roles/:id', ROLES_MANAGE, validate(idParamSchema), handle(async (req, res) => {
  const role = await platformRoleService.remove(req.params.id);
  await activityService.log(req, {
    event: 'role.deleted', entity: 'role', entityId: role.id,
    summary: `${who(req)} deleted the role "${role.name}"`,
  });
  successResponse(res, null, 'Role deleted');
}));

// ── Who did what ──
router.get('/audit-logs/events', AUDIT, handle(async (_req, res) => {
  successResponse(res, ACTIVITY_EVENTS);
}));

router.get('/audit-logs', AUDIT, validate(activityQuerySchema), handle(async (req, res) => {
  const { items, pagination } = await activityService.list(req.query, req.user);
  paginatedResponse(res, items, pagination);
}));

router.get('/login-history', AUDIT, validate(loginHistoryQuerySchema), handle(async (req, res) => {
  const { items, pagination } = await activityService.listLogins(req.query);
  paginatedResponse(res, items, pagination);
}));

// ── Team performance ──
router.get('/reports/team', authorize(PERMISSIONS.PLATFORM_REPORTS_READ), validate(teamReportQuerySchema), handle(async (req, res) => {
  successResponse(res, await platformReportService.teamReport(req.query, req.user));
}));

export default router;
