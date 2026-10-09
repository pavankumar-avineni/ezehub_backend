import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import config from './config/index.js';
import prisma from './config/database.js';
import redis from './config/redis.js';
import routes from './routes/index.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimit.js';
import swaggerSpec from './config/swagger.js';

const app = express();

/**
 * Trust reverse proxy (Required for Render, Railway, Heroku, etc.)
 * Fixes express-rate-limit X-Forwarded-For validation error.
 */
app.set('trust proxy', 1);

/**
 * Security
 */
app.use(helmet());

/**
 * CORS
 */
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
  })
);

/**
 * Compression
 */
app.use(compression());

/**
 * Body Parsers
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

/**
 * Request Logger
 */
app.use(requestLogger);

/**
 * Root Route
 */
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'EzeHub Backend API is running 🚀',
    environment: config.env,
    version: config.apiVersion,
    documentation: '/api/docs',
  });
});

/**
 * Liveness probe — is the process up? Cheap, never touches dependencies.
 */
app.get('/api/health/live', (_req, res) => {
  res.status(200).json({ success: true, status: 'alive', timestamp: new Date().toISOString() });
});

/**
 * Readiness / deep health check — verifies the database (and Redis if
 * configured) are reachable. Returns 503 when a dependency is down so
 * orchestrators and load balancers stop routing traffic to this instance.
 */
app.get('/api/health', async (_req, res) => {
  const checks = { database: 'down', redis: config.redisEnabled ? 'down' : 'disabled' };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'up';
  } catch {
    checks.database = 'down';
  }

  if (config.redisEnabled && redis) {
    try {
      await redis.ping();
      checks.redis = 'up';
    } catch {
      checks.redis = 'down';
    }
  }

  const healthy = checks.database === 'up' && checks.redis !== 'down';

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'OK' : 'DEGRADED',
    checks,
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Rate Limiter (global)
 */
app.use('/api', apiLimiter);

/**
 * Swagger
 */
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'EzeHub API Documentation',
  })
);

/**
 * API Routes
 */
app.use(`/api/${config.apiVersion}`, routes);

/**
 * 404 Handler
 */
app.use(notFoundHandler);

/**
 * Global Error Handler
 */
app.use(errorHandler);

export default app;