import app from './app.js';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';
import prisma from './config/database.js';
import redis from './config/redis.js';

let server;

const start = async () => {
  try {
    // Abort early on insecure / incomplete configuration (prod only throws).
    validateConfig();

    await prisma.$connect();
    logger.info('Database connected');

    server = app.listen(config.port, () => {
      const baseUrl =
        config.env === 'production'
          ? 'https://ezehub-backend.onrender.com'
          : `http://localhost:${config.port}`;

      logger.info(`EzeHub API running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
      logger.info(`API Docs: ${baseUrl}/api/docs`);
    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
};

/**
 * Graceful shutdown: stop accepting new connections, let in-flight requests
 * finish, then release DB and Redis handles. A hard timeout guarantees the
 * process exits even if a connection hangs.
 */
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);

  const forceExit = setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      logger.info('HTTP server closed');
    }
    await prisma.$disconnect();
    if (redis) {
      try {
        await redis.quit();
      } catch {
        redis.disconnect();
      }
    }
    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error(error, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.error(error, 'Uncaught exception — shutting down');
  shutdown('uncaughtException');
});

start();
