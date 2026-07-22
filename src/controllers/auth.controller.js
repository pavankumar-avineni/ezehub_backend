import authService from '../services/auth.service.js';
import { successResponse } from '../utils/response.js';

export const platformLogin = async (req, res, next) => {
  try {
    const result = await authService.platformLogin(req.body.email, req.body.password);
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
    successResponse(res, null, 'Password changed successfully');
  } catch (error) { next(error); }
};

export const getProfile = async (req, res) => {
  successResponse(res, req.user, 'Profile retrieved');
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
