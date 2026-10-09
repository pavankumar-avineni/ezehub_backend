import redis from '../config/redis.js';
import logger from './logger.js';

/**
 * Safe cache helper around the optional Redis client.
 *
 * Every method degrades gracefully: if Redis is not configured or is
 * unreachable, reads return a miss and writes are no-ops. Callers can treat
 * the cache as a pure optimization and never need try/catch.
 */

const isReady = () => redis && redis.status === 'ready';

export const cacheGet = async (key) => {
  if (!isReady()) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cacheGet failed');
    return null;
  }
};

export const cacheSet = async (key, value, ttlSeconds = 60) => {
  if (!isReady()) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'cacheSet failed');
  }
};

export const cacheDel = async (...keys) => {
  if (!isReady() || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    logger.warn({ err: err.message, keys }, 'cacheDel failed');
  }
};

/**
 * Read-through cache. Runs `loader` on a miss and stores the result.
 * On any Redis failure it falls straight through to `loader`.
 */
export const cacheWrap = async (key, ttlSeconds, loader) => {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;
  const value = await loader();
  if (value !== null && value !== undefined) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
};

export default { cacheGet, cacheSet, cacheDel, cacheWrap };
