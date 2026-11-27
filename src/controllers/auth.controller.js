import authService from '../services/auth.service.js';
import tenantService from '../services/tenant.service.js';
import featureService from '../services/feature.service.js';
import activityService from '../services/activity.service.js';
import { successResponse } from '../utils/response.js';

const requestContext = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

export const signup = async (req, res, next) => {
  try {
    const { businessName, firstName, lastName, email, phone, password } = req.body;
    // Public sign-up: platform defaults apply (default rate per bed + default free trial).
    await tenantService.create({
      name: businessName,
      email,
      phone,
      adminFirstName: firstName,
      adminLastName: lastName,
      adminEmail: email,
      adminPassword: password,
    });

    // Auto-login newly registered tenant
    const authResult = await authService.tenantLogin(email, password);
    successResponse(res, authResult, 'Account registered successfully', 201);
  } catch (error) { next(error); }
};

export const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body.email, req.body.password, requestContext(req));
    successResponse(res, result, 'Login successful');
  } catch (error) { next(error); }
};

export const platformLogin = async (req, res, next) => {
  try {
    const result = await authService.platformLogin(req.body.email, req.body.password, requestContext(req));
    successResponse(res, result, 'Login successful');
  } catch (error) { next(error); }
};

export const tenantLogin = async (req, res, next) => {
  try {
    const result = await authService.tenantLogin(req.body.email, req.body.password);
    successResponse(res, result, 'Login successful');
  } catch (error) { next(error); }
};

export const refreshToken = async (req, res, next) => {
  try {
    const result = await authService.refreshToken(req.body.refreshToken);
    successResponse(res, result, 'Token refreshed');
  } catch (error) { next(error); }
};

export const logout = async (req, res, next) => {
  try {
    await authService.logout(req.body.refreshToken);
    successResponse(res, null, 'Logged out successfully');
  } catch (error) { next(error); }
};

export const changePassword = async (req, res, next) => {
  try {
    await authService.changePassword(req.user.id, req.user.scope, req.body.currentPassword, req.body.newPassword);
    if (req.user.scope === 'PLATFORM') {
      await activityService.log(req, {
        event: 'employee.password_changed', entity: 'employee', entityId: req.user.id,
        summary: `${req.user.firstName} ${req.user.lastName} changed their own password`,
      });
    }
    successResponse(res, null, 'Password changed successfully');
  } catch (error) { next(error); }
};

export const getProfile = async (req, res, next) => {
  try {
    // Tenant users and residents also get the feature codes their tenant can use.
    const enabledFeatures = req.user.tenantId ? await featureService.getEnabledCodes(req.user.tenantId) : undefined;
    successResponse(res, { ...req.user, ...(enabledFeatures && { enabledFeatures }) }, 'Profile retrieved');
  } catch (error) { next(error); }
};

// ─── RESIDENT AUTH ───────────────────────────────────────────

export const residentSendOtp = async (req, res, next) => {
  try {
    const result = await authService.residentSendOtp(req.body.phone);
    successResponse(res, result, 'OTP sent');
  } catch (error) { next(error); }
};

export const residentVerifyOtp = async (req, res, next) => {
  try {
    const result = await authService.residentVerifyOtp(req.body.phone, req.body.otp);
    successResponse(res, result, 'Login successful');
  } catch (error) { next(error); }
};

export const residentLoginPassword = async (req, res, next) => {
  try {
    const result = await authService.residentLoginWithPassword(req.body.phone, req.body.password);
    successResponse(res, result, 'Login successful');
  } catch (error) { next(error); }
};

export const residentSetPassword = async (req, res, next) => {
  try {
    await authService.residentSetPassword(req.user.userId, req.body.password);
    successResponse(res, null, 'Password set successfully');
  } catch (error) { next(error); }
};
