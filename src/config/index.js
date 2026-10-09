import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  apiVersion: process.env.API_VERSION || 'v1',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174').split(','),
  },

  platform: {
    name: process.env.PLATFORM_NAME || 'EzeHub',
    currency: process.env.DEFAULT_CURRENCY || 'INR',
    timezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  },

  plans: {
    STARTER: { price: parseInt(process.env.PLAN_STARTER_PRICE || '999', 10), buildings: parseInt(process.env.PLAN_STARTER_BUILDINGS || '1', 10) },
    GROWTH: { price: parseInt(process.env.PLAN_GROWTH_PRICE || '1999', 10), buildings: parseInt(process.env.PLAN_GROWTH_BUILDINGS || '3', 10) },
    BUSINESS: { price: parseInt(process.env.PLAN_BUSINESS_PRICE || '2999', 10), buildings: parseInt(process.env.PLAN_BUSINESS_BUILDINGS || '5', 10) },
    ENTERPRISE: { price: parseInt(process.env.PLAN_ENTERPRISE_PRICE || '9999', 10), buildings: parseInt(process.env.PLAN_ENTERPRISE_BUILDINGS || '999', 10) },
  },

  payment: {
    qrUrl: process.env.PAYMENT_QR_URL || '',
    upiId: process.env.PAYMENT_UPI_ID || '',
    gracePeriodDays: parseInt(process.env.GRACE_PERIOD_DAYS || '3', 10),
  },

  redisEnabled: !!process.env.REDIS_HOST || !!process.env.REDIS_URL,
};

/**
 * Fail-fast validation of critical configuration.
 *
 * In production we refuse to boot with insecure defaults (forgeable JWTs,
 * a missing database connection). In development we only warn so local
 * onboarding stays frictionless.
 */
const INSECURE_JWT_DEFAULTS = new Set(['access-secret', 'refresh-secret']);

export const validateConfig = () => {
  const problems = [];

  if (!process.env.DATABASE_URL) {
    problems.push('DATABASE_URL is not set');
  }

  if (!process.env.JWT_ACCESS_SECRET || INSECURE_JWT_DEFAULTS.has(config.jwt.accessSecret)) {
    problems.push('JWT_ACCESS_SECRET is missing or using the insecure default');
  }

  if (!process.env.JWT_REFRESH_SECRET || INSECURE_JWT_DEFAULTS.has(config.jwt.refreshSecret)) {
    problems.push('JWT_REFRESH_SECRET is missing or using the insecure default');
  }

  if (config.jwt.accessSecret === config.jwt.refreshSecret) {
    problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different values');
  }

  if (problems.length === 0) return;

  const message = `Invalid configuration:\n  - ${problems.join('\n  - ')}`;

  if (config.env === 'production') {
    // Refuse to start with an insecure or incomplete config in production.
    throw new Error(message);
  }

  // eslint-disable-next-line no-console
  console.warn(`[config] WARNING — ${message}\n[config] This will abort startup in production.`);
};

export default config;
