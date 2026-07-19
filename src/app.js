import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import config from './config/index.js';
import routes from './routes/index.js';
import { requestLogger } from './middleware/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
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
 * Health Check
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    environment: config.env,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Rate Limiter
 */
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

app.use('/api', limiter);

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