import swaggerJsdoc from 'swagger-jsdoc';
import config from './index.js';

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'EzeHub API',
      version: '1.0.0',
      description: 'Enterprise Multi-Tenant Accommodation Management SaaS API',
      contact: { name: 'EzeHub Support', email: 'support@ezehub.com' },
    },
    servers: [{ url: `http://localhost:${config.port}/api/${config.apiVersion}`, description: 'Development' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
            hasNext: { type: 'boolean' },
            hasPrev: { type: 'boolean' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
