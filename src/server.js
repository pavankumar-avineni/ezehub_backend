import app from './app.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import prisma from './config/database.js';

const start = async () => {
  try {
    await prisma.$connect();
    logger.info('Database connected');

    app.listen(config.port, () => {
      logger.info(`EzeHub API running on port ${config.port}`);
      logger.info(`Environment: ${config.env}`);
      const baseUrl =
  config.env === 'production'
    ? 'https://ezehub-backend.onrender.com'
    : `http://localhost:${config.port}`;

logger.info(`API Docs: ${baseUrl}/api/docs`);    });
  } catch (error) {
    logger.error(error, 'Failed to start server');
    process.exit(1);
  }
};

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

start();
