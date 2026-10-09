import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authLimiter } from '../middleware/rateLimit.js';
import {
  loginSchema,
  refreshTokenSchema,
  changePasswordSchema,
  residentSendOtpSchema,
  residentVerifyOtpSchema,
  residentLoginSchema,
} from '../validators/index.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/platform/login', authLimiter, validate(loginSchema), authController.platformLogin);
router.post('/tenant/login', authLimiter, validate(loginSchema), authController.tenantLogin);
router.post('/resident/send-otp', authLimiter, validate(residentSendOtpSchema), authController.residentSendOtp);
router.post('/resident/verify-otp', authLimiter, validate(residentVerifyOtpSchema), authController.residentVerifyOtp);
router.post('/resident/login', authLimiter, validate(residentLoginSchema), authController.residentLoginPassword);
router.post('/resident/set-password', authenticate, authController.residentSetPassword);
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

export default router;
