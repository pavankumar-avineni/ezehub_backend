import Redis from 'ioredis';
import config from './index.js';
import logger from '../utils/logger.js';

/**
 * Optional Redis client.
 *
 * Redis is used only as a best-effort cache layer. The whole app must keep
 * working if Redis is unreachable, so we:
 *   - only create a client when REDIS_HOST / REDIS_URL is configured
 *   - cap connection retries so we never hang startup
 *   - never throw from connection errors (just log and degrade to no-cache)
 */
let client = null;

if (config.redisEnabled) {
  const options = {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
      if (times > 5) return null; // stop retrying; run without cache
      return Math.min(times * 200, 2000);
    },
    lazyConnect: false,
  };

  client = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL, options)
    : new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        ...options,
      });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('error', (err) => logger.warn({ err: err.message }, 'Redis error (running without cache)'));
  client.on('end', () => logger.warn('Redis connection closed'));
} else {
  logger.info('Redis not configured — running without cache layer');
}

export default client;
