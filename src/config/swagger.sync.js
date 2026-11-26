import { zodToJsonSchema } from 'zod-to-json-schema';
import { ROUTE_MOUNTS } from '../routes/index.js';

/**
 * Keeps the OpenAPI spec aligned with the real routes and validators.
 *
 * For every registered route that uses `validate(schema)`:
 *  - the JSON request body is generated from `schema.body` when the hand-written
 *    docs are missing or list different fields / required fields;
 *  - query parameters from `schema.query` that are not documented get added.
 * Routes that exist in code but not in the spec are returned so they can be reported.
 */

const toJson = (zodSchema) => {
  const json = zodToJsonSchema(zodSchema, { target: 'openApi3', $refStrategy: 'none', effectStrategy: 'input' });
  delete json.$schema;
  return json;
};

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

const resolveDocSchema = (spec, schema) => {
  if (schema?.$ref) return spec.components?.schemas?.[schema.$ref.split('/').pop()] || {};
  return schema || {};
};

const toOpenApiPath = (path) => path.replace(/:(\w+)/g, '{$1}');

export const listRegisteredRoutes = () => {
  const routes = [];
  for (const [prefix, router] of ROUTE_MOUNTS) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const validator = layer.route.stack.map((s) => s.handle).find((h) => h?.schema);
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({
          method,
          path: toOpenApiPath(prefix + (layer.route.path === '/' ? '' : layer.route.path)),
          schema: validator?.schema,
        });
      }
    }
  }
  return routes;
};

export const syncSpecWithRoutes = (spec) => {
  const undocumented = [];

  for (const { method, path, schema } of listRegisteredRoutes()) {
    const operation = spec.paths[path]?.[method];
    if (!operation) {
      undocumented.push(`${method.toUpperCase()} ${path}`);
      continue;
    }
    if (!schema?.shape) continue;

    // ── request body ──
    const bodyDef = schema.shape.body;
    const existingContent = operation.requestBody?.content || {};
    const isJsonBody = !operation.requestBody || existingContent['application/json'];
    if (bodyDef && isJsonBody) {
      const generated = toJson(bodyDef);
      const genProps = Object.keys(generated.properties || {});
      if (genProps.length) {
        const doc = resolveDocSchema(spec, existingContent['application/json']?.schema);
        const docProps = Object.keys(doc.properties || {});
        const docRequired = doc.required || [];
        const genRequired = generated.required || [];
        if (!sameSet(genProps, docProps) || !sameSet(genRequired, docRequired)) {
          operation.requestBody = {
            required: genRequired.length > 0 || operation.requestBody?.required === true,
            content: { 'application/json': { schema: generated } },
          };
        }
      }
    }

    // ── query parameters ──
    const queryDef = schema.shape.query;
    if (queryDef) {
      const generated = toJson(queryDef);
      const documented = new Set((operation.parameters || []).filter((p) => p.in === 'query').map((p) => p.name));
      for (const [name, propSchema] of Object.entries(generated.properties || {})) {
        if (documented.has(name)) continue;
        operation.parameters = operation.parameters || [];
        operation.parameters.push({
          name,
          in: 'query',
          required: (generated.required || []).includes(name),
          schema: propSchema,
        });
      }
    }
  }

  deriveUpdateBodies(spec);

  return { undocumented };
};

// PUT handlers below pass the body straight to the service without a validator.
// Their accepted fields are the same as the matching POST, with everything optional.
const UPDATE_FROM_CREATE = [
  ['/tenant/buildings/{id}', '/tenant/buildings'],
  ['/tenant/floors/{id}', '/tenant/floors'],
  ['/tenant/rooms/{id}', '/tenant/rooms'],
  ['/tenant/beds/{id}', '/tenant/beds'],
  ['/tenant/residents/{id}', '/tenant/residents'],
  ['/tenant/staff/{id}', '/tenant/staff'],
  ['/tenant/maintenance/{id}', '/tenant/maintenance'],
  ['/tenant/discounts/{id}', '/tenant/discounts'],
  ['/tenant/promotions/{id}', '/tenant/promotions'],
];

const deriveUpdateBodies = (spec) => {
  for (const [updatePath, createPath] of UPDATE_FROM_CREATE) {
    const put = spec.paths[updatePath]?.put;
    const source = spec.paths[createPath]?.post?.requestBody?.content?.['application/json']?.schema;
    if (!put || put.requestBody || !source) continue;
    const resolved = resolveDocSchema(spec, source);
    const { required, ...rest } = JSON.parse(JSON.stringify(resolved));
    put.requestBody = {
      required: true,
      content: { 'application/json': { schema: { ...rest, description: 'Any subset of the create fields' } } },
    };
  }

  // Role update only reads name and description (permissions have their own endpoint).
  const rolePut = spec.paths['/tenant/roles/{id}']?.put;
  if (rolePut && !rolePut.requestBody) {
    rolePut.requestBody = {
      required: true,
      content: { 'application/json': { schema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } } } } },
    };
  }
};
