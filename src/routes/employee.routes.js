import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize, requirePlatform } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { PERMISSIONS } from '../constants/index.js';
import {
  createEmployeeSchema, updateEmployeeSchema, listEmployeesSchema, setEmployeeRoleSchema, setEmployeeStatusSchema,
  resetEmployeePasswordSchema, employeeTenantsQuerySchema, employeeActivityQuerySchema, employeeLoginHistoryQuerySchema,
  idParamSchema,
} from '../validators/index.js';
import employeeService from '../services/employee.service.js';
import activityService from '../services/activity.service.js';
import { successResponse, paginatedResponse } from '../utils/response.js';

const router = Router();

router.use(authenticate, requirePlatform);

const READ = authorize(PERMISSIONS.PLATFORM_EMPLOYEES_READ);
const MANAGE = authorize(PERMISSIONS.PLATFORM_EMPLOYEES_MANAGE);
const AUDIT = authorize(PERMISSIONS.PLATFORM_AUDIT_READ);

const who = (req) => `${req.user.firstName} ${req.user.lastName}`.trim();
const label = (e) => `${e.name || `${e.firstName} ${e.lastName}`} (${e.employeeCode})`;
const handle = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };

// ── Directory ──
router.get('/', READ, validate(listEmployeesSchema), handle(async (req, res) => {
  const { items, pagination } = await employeeService.list(req.query);
  paginatedResponse(res, items, pagination);
}));

router.get('/org-chart', READ, handle(async (_req, res) => {
  successResponse(res, await employeeService.orgChart());
}));

router.post('/', MANAGE, validate(createEmployeeSchema), handle(async (req, res) => {
  const { employee, temporaryPassword } = await employeeService.create(req.body, req.user);
  await activityService.log(req, {
    event: 'employee.created', entity: 'employee', entityId: employee.id,
    summary: `${who(req)} created employee ${label(employee)} with the role "${employee.role.name}"`,
    details: { role: employee.role.code, department: employee.department, designation: employee.designation },
  });
  successResponse(res, { employee, temporaryPassword, mustChangePassword: true }, 'Employee created. Share the temporary password securely: it is shown only once', 201);
}));

// ── One employee ──
router.get('/:id', READ, validate(idParamSchema), handle(async (req, res) => {
  successResponse(res, await employeeService.get(req.params.id, req.user));
}));

router.put('/:id', MANAGE, validate(updateEmployeeSchema), handle(async (req, res) => {
  const { changed } = await employeeService.update(req.params.id, req.body);
  const employee = await employeeService.get(req.params.id, req.user);
  await activityService.log(req, {
    event: 'employee.updated', entity: 'employee', entityId: employee.id,
    summary: `${who(req)} updated ${label(employee)}: ${changed.join(', ')}`,
    details: { fields: changed },
  });
  successResponse(res, employee, 'Employee updated');
}));

router.put('/:id/role', MANAGE, validate(setEmployeeRoleSchema), handle(async (req, res) => {
  const { from, to } = await employeeService.setRole(req.params.id, req.body.roleId, req.user);
  const employee = await employeeService.get(req.params.id, req.user);
  await activityService.log(req, {
    event: 'employee.role_changed', entity: 'employee', entityId: employee.id,
    summary: `${who(req)} changed the role of ${label(employee)} from "${from.name}" to "${to.name}"`,
    details: { from: from.code, to: to.code },
  });
  successResponse(res, employee, 'Role updated. The employee must sign in again');
}));

router.put('/:id/status', MANAGE, validate(setEmployeeStatusSchema), handle(async (req, res) => {
  const result = await employeeService.setStatus(req.params.id, req.body, req.user);
  const employee = await employeeService.get(req.params.id, req.user);
  await activityService.log(req, {
    event: 'employee.status_changed', entity: 'employee', entityId: employee.id,
    summary: `${who(req)} changed the status of ${label(employee)} from ${result.from} to ${result.to}${result.tenantsReassigned ? ` and handed over ${result.tenantsReassigned} tenant(s)` : ''}`,
    details: { ...result, reason: req.body.reason ?? null, reassignTenantsTo: req.body.reassignTenantsTo ?? null },
  });
  successResponse(res, { ...employee, tenantsReassigned: result.tenantsReassigned }, 'Employee status updated');
}));

router.post('/:id/reset-password', MANAGE, validate(resetEmployeePasswordSchema), handle(async (req, res) => {
  const { temporaryPassword } = await employeeService.resetPassword(req.params.id, req.user, req.body.password);
  const employee = await employeeService.get(req.params.id, req.user);
  await activityService.log(req, {
    event: 'employee.password_reset', entity: 'employee', entityId: employee.id,
    summary: `${who(req)} reset the password of ${label(employee)} (all their sessions were ended)`,
  });
  successResponse(res, { temporaryPassword, mustChangePassword: true }, 'Password reset. Share the temporary password securely: it is shown only once');
}));

router.post('/:id/revoke-sessions', MANAGE, validate(idParamSchema), handle(async (req, res) => {
  await employeeService.revokeSessions(req.params.id);
  const employee = await employeeService.get(req.params.id, req.user);
  await activityService.log(req, {
    event: 'employee.sessions_revoked', entity: 'employee', entityId: employee.id,
    summary: `${who(req)} signed ${label(employee)} out of every device`,
  });
  successResponse(res, null, 'All sessions ended');
}));

router.delete('/:id', MANAGE, validate(idParamSchema), handle(async (req, res) => {
  const employee = await employeeService.get(req.params.id, req.user);
  await employeeService.remove(req.params.id, req.user);
  await activityService.log(req, {
    event: 'employee.deleted', entity: 'employee', entityId: employee.id,
    summary: `${who(req)} deleted employee ${label(employee)}`,
  });
  successResponse(res, null, 'Employee deleted');
}));

// ── What they own and what they did ──
router.get('/:id/tenants', READ, validate(employeeTenantsQuerySchema), handle(async (req, res) => {
  const { items, pagination } = await employeeService.tenantsOf(req.params.id, req.query);
  paginatedResponse(res, items, pagination);
}));

router.get('/:id/activity', AUDIT, validate(employeeActivityQuerySchema), handle(async (req, res) => {
  const { items, pagination } = await activityService.list(req.query, req.user, { forceActorId: req.params.id });
  paginatedResponse(res, items, pagination);
}));

router.get('/:id/logins', AUDIT, validate(employeeLoginHistoryQuerySchema), handle(async (req, res) => {
  const { items, pagination } = await activityService.listLogins(req.query, { forceUserId: req.params.id });
  paginatedResponse(res, items, pagination);
}));

export default router;
