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
      // Zod strips keys that are not in the schema. List endpoints read filters such as
      // buildingId, floorId, roomId and status that the shared pagination schema does not list,
      // so keep the original query keys and let the parsed values win.
      if (query) req.query = { ...req.query, ...query };
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
