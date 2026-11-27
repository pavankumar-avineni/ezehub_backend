export class AppError extends Error {
  constructor(message, statusCode = 500, errors = null) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', errors = null) {
    super(message, 403, errors);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = null) {
    super(message, 422, errors);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

/** 403 returned when a tenant calls an API for a feature the platform has not enabled for them. */
export class FeatureNotEnabledError extends AppError {
  constructor(featureCode, featureName) {
    super(`The "${featureName || featureCode}" feature is not enabled for your account. Contact support to add it.`, 403, [
      { code: 'FEATURE_NOT_ENABLED', feature: featureCode },
    ]);
  }
}

export class SubscriptionLimitError extends AppError {
  constructor(message = 'Subscription limit reached') {
    super(message, 403);
  }
}
