import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { loginSchema, refreshTokenSchema, changePasswordSchema } from '../validators/index.js';
import * as authController from '../controllers/auth.controller.js';

const router = Router();

router.post('/platform/login', validate(loginSchema), authController.platformLogin);
router.post('/tenant/login', validate(loginSchema), authController.tenantLogin);
router.post('/resident/send-otp', authController.residentSendOtp);
router.post('/resident/verify-otp', authController.residentVerifyOtp);
router.post('/resident/login', authController.residentLoginPassword);
router.post('/resident/set-password', authenticate, authController.residentSetPassword);
router.post('/refresh', validate(refreshTokenSchema), authController.refreshToken);
router.post('/logout', authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.post('/change-password', authenticate, validate(changePasswordSchema), authController.changePassword);

export default router;
