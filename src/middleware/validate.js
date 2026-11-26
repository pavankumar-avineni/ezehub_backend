import { ValidationError } from '../utils/errors.js';

export const validate = (schema) => {
  const middleware = (req, _res, next) => {
    try {
      const result = schema.safeParse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      if (!result.success) {
        const errors = result.error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        throw new ValidationError('Validation failed', errors);
      }

      const { body, query, params } = result.data;
      if (body) req.body = body;
      if (query) req.query = query;
      if (params) req.params = params;

      next();
    } catch (error) {
      next(error);
    }
  };
  // Exposed so the Swagger generator can derive request docs from the real validators.
  middleware.schema = schema;
  return middleware;
};
