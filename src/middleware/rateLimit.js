import rateLimit from 'express-rate-limit';
import config from '../config/index.js';

/**
 * Global API limiter — coarse protection against abusive clients.
 */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

/**
 * Strict limiter for authentication endpoints (login, OTP) to blunt
 * credential stuffing and OTP brute-forcing. Successful requests do not
 * count against the budget so legitimate users are not penalized.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in a few minutes.',
  },
});
