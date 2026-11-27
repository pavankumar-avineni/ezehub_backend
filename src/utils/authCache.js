import { cacheDel } from './cache.js';

// v2: entries from before tenant.settings was stripped may still be cached, so the key changed.
export const userCacheKey = (scope, id) => `auth:user:v2:${scope}:${id}`;

/** Drop cached login identities so role, status or password changes apply immediately. */
export const invalidatePlatformUsers = (...userIds) =>
  cacheDel(...userIds.filter(Boolean).map((id) => userCacheKey('PLATFORM', id)));
