import featureService from '../services/feature.service.js';
import { FeatureNotEnabledError, ForbiddenError } from '../utils/errors.js';
import { FEATURE_BY_CODE } from '../constants/features.js';

/**
 * Block the route unless the caller's tenant has every listed feature enabled.
 * Works for tenant users and residents (both carry req.user.tenantId).
 * Must run after `authenticate`.
 */
export const requireFeature = (...codes) => async (req, _res, next) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return next(new ForbiddenError('Tenant access required'));

    const enabled = await featureService.getEnabledCodes(tenantId);
    for (const code of codes) {
      if (!enabled.includes(code)) return next(new FeatureNotEnabledError(code, FEATURE_BY_CODE[code]?.name));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};
