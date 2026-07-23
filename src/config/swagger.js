import swaggerJsdoc from 'swagger-jsdoc';
import config from './index.js';

const options = {
  definition: {
    openapi: '3.1.0',
    info: {
      title: 'EzeHub API',
      version: '1.0.0',
      description: 'Enterprise Multi-Tenant Accommodation Management SaaS API.\n\nThis API serves 3 user types:\n- **Platform Admin** — Manages tenants, subscriptions, billing\n- **Tenant (PG/Hostel Owner)** — Manages buildings, residents, rent, staff, inventory\n- **Resident** — Views rent, submits payment proof, raises complaints\n\nAuthentication uses JWT Bearer tokens. Residents can login via OTP or password.',
      contact: { name: 'EzeHub Support', email: 'support@ezehub.com' },
    },
    servers: [
      { url: `http://localhost:${config.port}/api/${config.apiVersion}`, description: 'Development' },
    ],
    tags: [
      { name: 'Auth', description: 'Authentication — Login, OTP, Token refresh' },
      { name: 'Platform - Tenants', description: 'Platform admin tenant management' },
      { name: 'Platform - Billing', description: 'Subscription invoicing & payment confirmation' },
      { name: 'Subscription', description: 'Public plans & tenant subscription management' },
      { name: 'Tenant - Dashboard', description: 'Tenant dashboard & reports' },
      { name: 'Tenant - Buildings', description: 'Building CRUD operations' },
      { name: 'Tenant - Floors', description: 'Floor management within buildings' },
      { name: 'Tenant - Rooms', description: 'Room management within floors' },
      { name: 'Tenant - Beds', description: 'Bed management within rooms' },
      { name: 'Tenant - Residents', description: 'Resident check-in, transfer, checkout' },
      { name: 'Tenant - Staff', description: 'Staff, attendance & leave management' },
      { name: 'Tenant - Inventory', description: 'Inventory item tracking' },
      { name: 'Tenant - Rent', description: 'Rent generation & charge management' },
      { name: 'Tenant - Payments', description: 'Payment recording, proof confirmation/rejection' },
      { name: 'Tenant - Payment Settings', description: 'Configure UPI/QR/Bank details for residents' },
      { name: 'Tenant - Complaints', description: 'Complaint management & assignment' },
      { name: 'Tenant - Visitors', description: 'Visitor management & OTP verification' },
      { name: 'Tenant - Finance', description: 'Income & expense tracking' },
      { name: 'Tenant - Maintenance', description: 'Maintenance request management' },
      { name: 'Tenant - Documents', description: 'Document upload & management' },
      { name: 'Tenant - Notifications', description: 'In-app notification management' },
      { name: 'Resident - Profile', description: 'Resident profile & personal data' },
      { name: 'Resident - Rent & Payments', description: 'View rent, submit payment proof, payment history' },
      { name: 'Resident - Complaints', description: 'Resident complaint submission' },
      { name: 'Resident - Visitors', description: 'Visitor pre-registration' },
      { name: 'Resident - Notifications', description: 'Resident notifications' },
      { name: 'Resident - Documents', description: 'Resident documents' },
    ],
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
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'admin@ezehub.com' },
            password: { type: 'string', example: 'password123' },
          },
        },
        ResidentOtpRequest: {
          type: 'object',
          required: ['phone'],
          properties: {
            phone: { type: 'string', example: '9876543210' },
          },
        },
        ResidentVerifyOtp: {
          type: 'object',
          required: ['phone', 'otp'],
          properties: {
            phone: { type: 'string', example: '9876543210' },
            otp: { type: 'string', example: '123456' },
          },
        },
        TokenResponse: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: { type: 'object' },
          },
        },
        PaymentProofSubmit: {
          type: 'object',
          required: ['transactionId'],
          properties: {
            transactionId: { type: 'string', example: 'UPI123456789' },
            paymentMethod: { type: 'string', enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE'], default: 'UPI' },
            amount: { type: 'number', description: 'Amount paid. Defaults to remaining balance if not provided' },
            notes: { type: 'string' },
            proof: { type: 'string', format: 'binary', description: 'Payment screenshot (optional)' },
          },
        },
        PaymentConfig: {
          type: 'object',
          properties: {
            tenantName: { type: 'string', example: 'Sunrise PG' },
            qrUrl: { type: 'string', example: 'https://res.cloudinary.com/.../qr.png' },
            upiId: { type: 'string', example: 'sunrise@upi' },
            bankName: { type: 'string', example: 'HDFC Bank' },
            accountNumber: { type: 'string', example: '1234567890' },
            ifscCode: { type: 'string', example: 'HDFC0001234' },
            accountHolder: { type: 'string', example: 'Sunrise PG Pvt Ltd' },
            instructions: { type: 'string' },
          },
        },
        PaymentSettings: {
          type: 'object',
          properties: {
            paymentQrUrl: { type: 'string' },
            paymentUpiId: { type: 'string' },
            paymentBankName: { type: 'string' },
            paymentAccountNumber: { type: 'string' },
            paymentIfscCode: { type: 'string' },
            paymentAccountHolder: { type: 'string' },
            paymentInstructions: { type: 'string' },
          },
        },
        RentCharge: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            month: { type: 'integer', example: 7 },
            year: { type: 'integer', example: 2026 },
            rentAmount: { type: 'number', example: 8000 },
            electricity: { type: 'number' },
            water: { type: 'number' },
            wifi: { type: 'number' },
            totalAmount: { type: 'number', example: 9500 },
            paidAmount: { type: 'number', example: 0 },
            status: { type: 'string', enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] },
            dueDate: { type: 'string', format: 'date-time' },
          },
        },
        Payment: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            amount: { type: 'number' },
            method: { type: 'string', enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE'] },
            status: { type: 'string', enum: ['PENDING', 'PAID', 'CANCELLED'] },
            transactionId: { type: 'string' },
            receiptNumber: { type: 'string' },
            paymentProofUrl: { type: 'string' },
            notes: { type: 'string' },
            confirmedBy: { type: 'string' },
            confirmedAt: { type: 'string', format: 'date-time' },
            rejectedReason: { type: 'string' },
            paidAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      // ═══════════════════════════════════════════════════════════
      // AUTH
      // ═══════════════════════════════════════════════════════════
      '/auth/platform/login': {
        post: {
          tags: ['Auth'],
          summary: 'Platform admin login',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
          responses: { 200: { description: 'Login successful', content: { 'application/json': { schema: { $ref: '#/components/schemas/TokenResponse' } } } } },
        },
      },
      '/auth/tenant/login': {
        post: {
          tags: ['Auth'],
          summary: 'Tenant user login',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } } },
          responses: { 200: { description: 'Login successful' } },
        },
      },
      '/auth/resident/send-otp': {
        post: {
          tags: ['Auth'],
          summary: 'Send OTP to resident phone',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ResidentOtpRequest' } } } },
          responses: { 200: { description: 'OTP sent' } },
        },
      },
      '/auth/resident/verify-otp': {
        post: {
          tags: ['Auth'],
          summary: 'Verify resident OTP and get token',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ResidentVerifyOtp' } } } },
          responses: { 200: { description: 'Login successful with tokens' } },
        },
      },
      '/auth/resident/login': {
        post: {
          tags: ['Auth'],
          summary: 'Resident login with phone + password',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['phone', 'password'], properties: { phone: { type: 'string' }, password: { type: 'string' } } } } } },
          responses: { 200: { description: 'Login successful' } },
        },
      },
      '/auth/resident/set-password': {
        post: {
          tags: ['Auth'],
          summary: 'Resident sets password (after first OTP login)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['password'], properties: { password: { type: 'string' } } } } } },
          responses: { 200: { description: 'Password set' } },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Refresh access token',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
          responses: { 200: { description: 'Token refreshed' } },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Logout and invalidate refresh token',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } },
          responses: { 200: { description: 'Logged out' } },
        },
      },
      '/auth/profile': {
        get: {
          tags: ['Auth'],
          summary: 'Get current user profile',
          responses: { 200: { description: 'Profile data' } },
        },
      },
      '/auth/change-password': {
        post: {
          tags: ['Auth'],
          summary: 'Change password (any user type)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['currentPassword', 'newPassword'], properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } } } } } },
          responses: { 200: { description: 'Password changed' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // PLATFORM - TENANTS
      // ═══════════════════════════════════════════════════════════
      '/platform/tenants': {
        get: {
          tags: ['Platform - Tenants'],
          summary: 'List all tenants',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'ACTIVE', 'ON_HOLD', 'SUSPENDED', 'DISMISSED'] } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'List of tenants with pagination' } },
        },
        post: {
          tags: ['Platform - Tenants'],
          summary: 'Create a new tenant',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'slug', 'email', 'adminEmail', 'adminPassword', 'adminFirstName', 'adminLastName'], properties: { name: { type: 'string' }, slug: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, plan: { type: 'string', enum: ['STARTER', 'GROWTH', 'BUSINESS', 'ENTERPRISE'] }, adminEmail: { type: 'string' }, adminPassword: { type: 'string' }, adminFirstName: { type: 'string' }, adminLastName: { type: 'string' } } } } } },
          responses: { 201: { description: 'Tenant created' } },
        },
      },
      '/platform/tenants/{id}': {
        get: {
          tags: ['Platform - Tenants'],
          summary: 'Get tenant details',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Tenant details' } },
        },
        put: {
          tags: ['Platform - Tenants'],
          summary: 'Update tenant',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Tenant updated' } },
        },
        delete: {
          tags: ['Platform - Tenants'],
          summary: 'Soft delete tenant',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Tenant deleted' } },
        },
      },
      '/platform/tenants/{id}/suspend': {
        post: {
          tags: ['Platform - Tenants'],
          summary: 'Suspend a tenant',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Tenant suspended' } },
        },
      },
      '/platform/tenants/{id}/activate': {
        post: {
          tags: ['Platform - Tenants'],
          summary: 'Activate a tenant',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Tenant activated' } },
        },
      },
      '/platform/tenants/analytics': {
        get: {
          tags: ['Platform - Tenants'],
          summary: 'Get platform analytics (total, active, suspended tenants)',
          responses: { 200: { description: 'Analytics data' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // SUBSCRIPTION & BILLING
      // ═══════════════════════════════════════════════════════════
      '/subscription/plans': {
        get: {
          tags: ['Subscription'],
          summary: 'Get all available plans (public)',
          security: [],
          responses: { 200: { description: 'List of plans with pricing' } },
        },
      },
      '/subscription/payment-config': {
        get: {
          tags: ['Subscription'],
          summary: 'Get platform payment config (UPI/QR - public)',
          security: [],
          responses: { 200: { description: 'Payment QR and UPI ID' } },
        },
      },
      '/subscription/admin/analytics': {
        get: {
          tags: ['Platform - Billing'],
          summary: 'Subscription analytics (active, on-hold, revenue)',
          responses: { 200: { description: 'Analytics object' } },
        },
      },
      '/subscription/admin/invoices/{tenantId}': {
        get: {
          tags: ['Platform - Billing'],
          summary: 'Get all invoices for a tenant',
          parameters: [{ name: 'tenantId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'List of invoices' } },
        },
        post: {
          tags: ['Platform - Billing'],
          summary: 'Generate a new invoice for a tenant',
          parameters: [{ name: 'tenantId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 201: { description: 'Invoice generated' } },
        },
      },
      '/subscription/admin/invoices/{invoiceId}/confirm': {
        post: {
          tags: ['Platform - Billing'],
          summary: 'Confirm tenant payment (extends subscription)',
          parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Payment confirmed, subscription extended' } },
        },
      },
      '/subscription/admin/invoices/{invoiceId}/reject': {
        post: {
          tags: ['Platform - Billing'],
          summary: 'Reject tenant payment proof',
          parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string' } } } } } },
          responses: { 200: { description: 'Payment rejected, tenant notified' } },
        },
      },
      '/subscription/admin/{tenantId}/hold': {
        post: {
          tags: ['Platform - Billing'],
          summary: 'Put tenant on hold',
          parameters: [{ name: 'tenantId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Tenant on hold' } },
        },
      },
      '/subscription/admin/{tenantId}/dismiss': {
        post: {
          tags: ['Platform - Billing'],
          summary: 'Permanently dismiss tenant',
          parameters: [{ name: 'tenantId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Tenant dismissed' } },
        },
      },
      '/subscription/my': {
        get: {
          tags: ['Subscription'],
          summary: 'Get my subscription info (Tenant)',
          description: 'Returns subscription status, days left, pending invoices, and payment config (QR/UPI)',
          responses: { 200: { description: 'Subscription data with invoices' } },
        },
      },
      '/subscription/my/pay/{invoiceId}': {
        post: {
          tags: ['Subscription'],
          summary: 'Submit payment proof for invoice (Tenant)',
          parameters: [{ name: 'invoiceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['transactionId'], properties: { transactionId: { type: 'string' }, paymentMethod: { type: 'string', default: 'UPI' }, proof: { type: 'string', format: 'binary' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Payment proof submitted' } },
        },
      },
      '/subscription/my/invoices': {
        get: {
          tags: ['Subscription'],
          summary: 'Get my invoices (Tenant)',
          responses: { 200: { description: 'List of invoices' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - DASHBOARD & REPORTS
      // ═══════════════════════════════════════════════════════════
      '/tenant/dashboard': {
        get: {
          tags: ['Tenant - Dashboard'],
          summary: 'Get tenant dashboard stats',
          responses: { 200: { description: 'Dashboard data (occupancy, collections, etc.)' } },
        },
      },
      '/tenant/reports/occupancy': {
        get: {
          tags: ['Tenant - Dashboard'],
          summary: 'Occupancy report',
          responses: { 200: { description: 'Occupancy statistics' } },
        },
      },
      '/tenant/reports/rent-collection': {
        get: {
          tags: ['Tenant - Dashboard'],
          summary: 'Rent collection report',
          responses: { 200: { description: 'Collection statistics' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - BUILDINGS
      // ═══════════════════════════════════════════════════════════
      '/tenant/buildings': {
        get: {
          tags: ['Tenant - Buildings'],
          summary: 'List buildings',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Buildings list with pagination' } },
        },
        post: {
          tags: ['Tenant - Buildings'],
          summary: 'Create building',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'typeId', 'address'], properties: { name: { type: 'string' }, typeId: { type: 'string' }, address: { type: 'string' }, city: { type: 'string' }, totalFloors: { type: 'integer' } } } } } },
          responses: { 201: { description: 'Building created' } },
        },
      },
      '/tenant/buildings/{id}': {
        get: { tags: ['Tenant - Buildings'], summary: 'Get building details', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Building details' } } },
        put: { tags: ['Tenant - Buildings'], summary: 'Update building', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Building updated' } } },
        delete: { tags: ['Tenant - Buildings'], summary: 'Soft delete building', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Building deleted' } } },
      },
      '/tenant/buildings/{id}/stats': {
        get: { tags: ['Tenant - Buildings'], summary: 'Get building statistics', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Building stats' } } },
      },
      '/tenant/building-types': {
        get: { tags: ['Tenant - Buildings'], summary: 'Get building types', responses: { 200: { description: 'List of building types' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - FLOORS
      // ═══════════════════════════════════════════════════════════
      '/tenant/floors': {
        get: { tags: ['Tenant - Floors'], summary: 'List floors', parameters: [{ name: 'buildingId', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'Floors list' } } },
        post: { tags: ['Tenant - Floors'], summary: 'Create floor', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['buildingId', 'name', 'number'], properties: { buildingId: { type: 'string' }, name: { type: 'string' }, number: { type: 'integer' } } } } } }, responses: { 201: { description: 'Floor created' } } },
      },
      '/tenant/floors/{id}': {
        get: { tags: ['Tenant - Floors'], summary: 'Get floor', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Floor details' } } },
        put: { tags: ['Tenant - Floors'], summary: 'Update floor', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Floor updated' } } },
        delete: { tags: ['Tenant - Floors'], summary: 'Delete floor', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Floor deleted' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - ROOMS
      // ═══════════════════════════════════════════════════════════
      '/tenant/rooms': {
        get: { tags: ['Tenant - Rooms'], summary: 'List rooms', parameters: [{ name: 'buildingId', in: 'query', schema: { type: 'string' } }, { name: 'floorId', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Rooms list' } } },
        post: { tags: ['Tenant - Rooms'], summary: 'Create room', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['floorId', 'name', 'number', 'type'], properties: { floorId: { type: 'string' }, name: { type: 'string' }, number: { type: 'string' }, type: { type: 'string' }, capacity: { type: 'integer' } } } } } }, responses: { 201: { description: 'Room created' } } },
      },
      '/tenant/rooms/{id}': {
        get: { tags: ['Tenant - Rooms'], summary: 'Get room', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Room details' } } },
        put: { tags: ['Tenant - Rooms'], summary: 'Update room', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Room updated' } } },
        delete: { tags: ['Tenant - Rooms'], summary: 'Delete room', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Room deleted' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - BEDS
      // ═══════════════════════════════════════════════════════════
      '/tenant/beds': {
        get: { tags: ['Tenant - Beds'], summary: 'List beds', parameters: [{ name: 'roomId', in: 'query', schema: { type: 'string' } }, { name: 'buildingId', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Beds list' } } },
        post: { tags: ['Tenant - Beds'], summary: 'Create bed', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['roomId', 'number', 'rentAmount'], properties: { roomId: { type: 'string' }, number: { type: 'string' }, rentAmount: { type: 'number' }, type: { type: 'string' } } } } } }, responses: { 201: { description: 'Bed created' } } },
      },
      '/tenant/beds/{id}': {
        get: { tags: ['Tenant - Beds'], summary: 'Get bed', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Bed details' } } },
        put: { tags: ['Tenant - Beds'], summary: 'Update bed', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Bed updated' } } },
        delete: { tags: ['Tenant - Beds'], summary: 'Delete bed', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Bed deleted' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - RESIDENTS
      // ═══════════════════════════════════════════════════════════
      '/tenant/residents': {
        get: {
          tags: ['Tenant - Residents'],
          summary: 'List residents',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'CHECKED_OUT', 'SUSPENDED'] } },
            { name: 'buildingId', in: 'query', schema: { type: 'string' } },
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: { 200: { description: 'Residents list' } },
        },
        post: {
          tags: ['Tenant - Residents'],
          summary: 'Create/check-in resident',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['firstName', 'lastName', 'phone', 'bedId'], properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string' }, bedId: { type: 'string' }, checkInDate: { type: 'string', format: 'date' }, rentAmount: { type: 'number' } } } } } },
          responses: { 201: { description: 'Resident created' } },
        },
      },
      '/tenant/residents/{id}': {
        get: { tags: ['Tenant - Residents'], summary: 'Get resident profile', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Resident details with payments, complaints history' } } },
        put: { tags: ['Tenant - Residents'], summary: 'Update resident', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Resident updated' } } },
        delete: { tags: ['Tenant - Residents'], summary: 'Soft delete resident', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Resident deleted' } } },
      },
      '/tenant/residents/{id}/transfer': {
        post: {
          tags: ['Tenant - Residents'],
          summary: 'Transfer resident to another bed',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['toBedId'], properties: { toBedId: { type: 'string' }, reason: { type: 'string' } } } } } },
          responses: { 200: { description: 'Resident transferred' } },
        },
      },
      '/tenant/residents/{id}/checkout': {
        post: {
          tags: ['Tenant - Residents'],
          summary: 'Check-out resident',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { checkOutDate: { type: 'string', format: 'date' }, notes: { type: 'string' } } } } } },
          responses: { 200: { description: 'Resident checked out' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - STAFF
      // ═══════════════════════════════════════════════════════════
      '/tenant/staff': {
        get: { tags: ['Tenant - Staff'], summary: 'List staff', parameters: [{ name: 'page', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'Staff list' } } },
        post: { tags: ['Tenant - Staff'], summary: 'Create staff member', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['firstName', 'lastName', 'email', 'phone', 'roleId', 'joiningDate'], properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, roleId: { type: 'string' }, buildingId: { type: 'string' }, department: { type: 'string' }, designation: { type: 'string' }, salary: { type: 'number' }, joiningDate: { type: 'string', format: 'date' } } } } } }, responses: { 201: { description: 'Staff created' } } },
      },
      '/tenant/staff/{id}': {
        get: { tags: ['Tenant - Staff'], summary: 'Get staff details', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Staff details' } } },
        put: { tags: ['Tenant - Staff'], summary: 'Update staff', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Staff updated' } } },
        delete: { tags: ['Tenant - Staff'], summary: 'Delete staff', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Staff deleted' } } },
      },
      '/tenant/attendance': {
        post: { tags: ['Tenant - Staff'], summary: 'Record attendance', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['staffId', 'date', 'status'], properties: { staffId: { type: 'string' }, date: { type: 'string', format: 'date' }, checkIn: { type: 'string' }, checkOut: { type: 'string' }, status: { type: 'string', enum: ['PRESENT', 'ABSENT', 'HALF_DAY', 'LATE'] } } } } } }, responses: { 201: { description: 'Attendance recorded' } } },
      },
      '/tenant/staff/{id}/leave': {
        post: { tags: ['Tenant - Staff'], summary: 'Create leave request', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['startDate', 'endDate', 'reason'], properties: { startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' }, reason: { type: 'string' } } } } } }, responses: { 201: { description: 'Leave request created' } } },
      },
      '/tenant/staff/{id}/leave/{leaveId}': {
        put: { tags: ['Tenant - Staff'], summary: 'Approve/reject leave', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'leaveId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['APPROVED', 'REJECTED'] } } } } } }, responses: { 200: { description: 'Leave status updated' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - INVENTORY
      // ═══════════════════════════════════════════════════════════
      '/tenant/inventory': {
        get: { tags: ['Tenant - Inventory'], summary: 'List inventory items', parameters: [{ name: 'buildingId', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Inventory list' } } },
        post: { tags: ['Tenant - Inventory'], summary: 'Create inventory item', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['buildingId', 'name', 'category', 'quantity'], properties: { buildingId: { type: 'string' }, roomId: { type: 'string' }, name: { type: 'string' }, category: { type: 'string' }, quantity: { type: 'integer' }, purchasePrice: { type: 'number' }, purchaseDate: { type: 'string', format: 'date' } } } } } }, responses: { 201: { description: 'Item created' } } },
      },
      '/tenant/inventory/{id}': {
        get: { tags: ['Tenant - Inventory'], summary: 'Get inventory item', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Item details' } } },
        put: { tags: ['Tenant - Inventory'], summary: 'Update inventory item', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Item updated' } } },
        delete: { tags: ['Tenant - Inventory'], summary: 'Delete inventory item', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Item deleted' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - RENT & PAYMENTS
      // ═══════════════════════════════════════════════════════════
      '/tenant/rent/generate': {
        post: {
          tags: ['Tenant - Rent'],
          summary: 'Generate monthly rent for all active residents',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['month', 'year'], properties: { month: { type: 'integer', minimum: 1, maximum: 12 }, year: { type: 'integer' }, buildingId: { type: 'string', description: 'Optional - generate for specific building only' } } } } } },
          responses: { 200: { description: 'Rent generated for X residents' } },
        },
      },
      '/tenant/rent/charges': {
        get: {
          tags: ['Tenant - Rent'],
          summary: 'List rent charges',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'residentId', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string', enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'] } },
            { name: 'month', in: 'query', schema: { type: 'integer' } },
            { name: 'year', in: 'query', schema: { type: 'integer' } },
          ],
          responses: { 200: { description: 'Rent charges with pagination' } },
        },
      },
      '/tenant/rent/charges/{id}': {
        put: {
          tags: ['Tenant - Rent'],
          summary: 'Update rent charge (add utilities, late fee, discount)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { electricity: { type: 'number' }, water: { type: 'number' }, wifi: { type: 'number' }, laundry: { type: 'number' }, food: { type: 'number' }, parking: { type: 'number' }, maintenance: { type: 'number' }, lateFee: { type: 'number' }, discount: { type: 'number' } } } } } },
          responses: { 200: { description: 'Charge updated with recalculated total' } },
        },
      },
      '/tenant/rent/outstanding': {
        get: {
          tags: ['Tenant - Rent'],
          summary: 'Get total outstanding balance across all residents',
          responses: { 200: { description: 'Outstanding balance with per-resident breakdown' } },
        },
      },
      '/tenant/payments': {
        get: {
          tags: ['Tenant - Payments'],
          summary: 'List all payments',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'limit', in: 'query', schema: { type: 'integer' } },
            { name: 'residentId', in: 'query', schema: { type: 'string' } },
            { name: 'method', in: 'query', schema: { type: 'string', enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE'] } },
          ],
          responses: { 200: { description: 'Payments list with pagination' } },
        },
        post: {
          tags: ['Tenant - Payments'],
          summary: 'Manually record a payment (cash, walk-in, etc.)',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['residentId', 'amount', 'method'], properties: { residentId: { type: 'string' }, rentChargeId: { type: 'string' }, amount: { type: 'number' }, method: { type: 'string', enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'ONLINE'] }, transactionId: { type: 'string' }, notes: { type: 'string' } } } } } },
          responses: { 201: { description: 'Payment recorded' } },
        },
      },
      '/tenant/payments/pending-proofs': {
        get: {
          tags: ['Tenant - Payments'],
          summary: 'Get all pending payment proofs from residents (awaiting confirmation)',
          description: 'Returns payments submitted by residents via the mobile app that have status=PENDING. Tenant admin reviews proof and confirms or rejects.',
          responses: { 200: { description: 'List of pending payments with resident info and proof URLs', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Payment' } } } } } } } },
        },
      },
      '/tenant/payments/{paymentId}/confirm': {
        post: {
          tags: ['Tenant - Payments'],
          summary: 'Confirm resident payment proof',
          description: 'Marks the payment as PAID, updates the associated rent charge paid amount, and notifies the resident.',
          parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: {
            200: { description: 'Payment confirmed, rent charge updated, resident notified' },
            404: { description: 'Pending payment not found' },
          },
        },
      },
      '/tenant/payments/{paymentId}/reject': {
        post: {
          tags: ['Tenant - Payments'],
          summary: 'Reject resident payment proof',
          description: 'Marks the payment as CANCELLED with a reason. Resident is notified to resubmit.',
          parameters: [{ name: 'paymentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { reason: { type: 'string', example: 'Invalid transaction ID, amount mismatch' } } } } } },
          responses: {
            200: { description: 'Payment rejected, resident notified' },
            404: { description: 'Pending payment not found' },
          },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - PAYMENT SETTINGS
      // ═══════════════════════════════════════════════════════════
      '/tenant/settings/payment': {
        get: {
          tags: ['Tenant - Payment Settings'],
          summary: 'Get payment settings (UPI, QR, bank details)',
          description: 'Returns the tenant\'s configured payment details that are shown to residents in the mobile app.',
          responses: { 200: { description: 'Payment settings', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentSettings' } } } } },
        },
        put: {
          tags: ['Tenant - Payment Settings'],
          summary: 'Update payment settings',
          description: 'Configure UPI ID, QR code URL, bank account details, and custom instructions for residents.',
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentSettings' } } } },
          responses: { 200: { description: 'Payment settings updated' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - COMPLAINTS
      // ═══════════════════════════════════════════════════════════
      '/tenant/complaints': {
        get: { tags: ['Tenant - Complaints'], summary: 'List complaints', parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] } }, { name: 'buildingId', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Complaints list' } } },
        post: { tags: ['Tenant - Complaints'], summary: 'Create complaint (by staff)', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['buildingId', 'title', 'description'], properties: { buildingId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string' }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] } } } } } }, responses: { 201: { description: 'Complaint created' } } },
      },
      '/tenant/complaints/{id}': {
        get: { tags: ['Tenant - Complaints'], summary: 'Get complaint details', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Complaint details' } } },
      },
      '/tenant/complaints/{id}/assign': {
        post: { tags: ['Tenant - Complaints'], summary: 'Assign complaint to staff', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['staffId'], properties: { staffId: { type: 'string' } } } } } }, responses: { 200: { description: 'Complaint assigned' } } },
      },
      '/tenant/complaints/{id}/status': {
        put: { tags: ['Tenant - Complaints'], summary: 'Update complaint status', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] }, resolution: { type: 'string' } } } } } }, responses: { 200: { description: 'Status updated' } } },
      },
      '/tenant/complaints/{id}/comments': {
        post: { tags: ['Tenant - Complaints'], summary: 'Add comment to complaint', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } } } } }, responses: { 201: { description: 'Comment added' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - VISITORS
      // ═══════════════════════════════════════════════════════════
      '/tenant/visitors': {
        get: { tags: ['Tenant - Visitors'], summary: 'List visitors', responses: { 200: { description: 'Visitors list' } } },
        post: { tags: ['Tenant - Visitors'], summary: 'Register visitor', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['buildingId', 'name', 'phone', 'hostName', 'hostPhone'], properties: { buildingId: { type: 'string' }, name: { type: 'string' }, phone: { type: 'string' }, purpose: { type: 'string' }, hostName: { type: 'string' }, hostPhone: { type: 'string' } } } } } }, responses: { 201: { description: 'Visitor registered' } } },
      },
      '/tenant/visitors/{id}': {
        get: { tags: ['Tenant - Visitors'], summary: 'Get visitor details', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Visitor details' } } },
      },
      '/tenant/visitors/{id}/verify-otp': {
        post: { tags: ['Tenant - Visitors'], summary: 'Verify visitor OTP', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['otp'], properties: { otp: { type: 'string' } } } } } }, responses: { 200: { description: 'OTP verified' } } },
      },
      '/tenant/visitors/{id}/check-in': {
        post: { tags: ['Tenant - Visitors'], summary: 'Check-in visitor', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Visitor checked in' } } },
      },
      '/tenant/visitors/{id}/check-out': {
        post: { tags: ['Tenant - Visitors'], summary: 'Check-out visitor', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Visitor checked out' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - FINANCE
      // ═══════════════════════════════════════════════════════════
      '/tenant/finance/dashboard': {
        get: { tags: ['Tenant - Finance'], summary: 'Finance dashboard (income, expenses, profit)', parameters: [{ name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }], responses: { 200: { description: 'Finance summary' } } },
      },
      '/tenant/finance/income': {
        get: { tags: ['Tenant - Finance'], summary: 'List income records', parameters: [{ name: 'buildingId', in: 'query', schema: { type: 'string' } }, { name: 'category', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Income list' } } },
        post: { tags: ['Tenant - Finance'], summary: 'Record income', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['buildingId', 'category', 'amount', 'date', 'description'], properties: { buildingId: { type: 'string' }, category: { type: 'string' }, amount: { type: 'number' }, date: { type: 'string', format: 'date' }, description: { type: 'string' } } } } } }, responses: { 201: { description: 'Income recorded' } } },
      },
      '/tenant/finance/expenses': {
        get: { tags: ['Tenant - Finance'], summary: 'List expense records', parameters: [{ name: 'buildingId', in: 'query', schema: { type: 'string' } }, { name: 'category', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Expenses list' } } },
        post: { tags: ['Tenant - Finance'], summary: 'Record expense', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['buildingId', 'category', 'amount', 'date', 'description'], properties: { buildingId: { type: 'string' }, category: { type: 'string' }, amount: { type: 'number' }, date: { type: 'string', format: 'date' }, description: { type: 'string' } } } } } }, responses: { 201: { description: 'Expense recorded' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - MAINTENANCE
      // ═══════════════════════════════════════════════════════════
      '/tenant/maintenance': {
        get: { tags: ['Tenant - Maintenance'], summary: 'List maintenance requests', parameters: [{ name: 'buildingId', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'priority', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'Maintenance requests' } } },
        post: { tags: ['Tenant - Maintenance'], summary: 'Create maintenance request', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['buildingId', 'title', 'description'], properties: { buildingId: { type: 'string' }, roomId: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] }, assignedStaffId: { type: 'string' }, scheduledDate: { type: 'string', format: 'date' } } } } } }, responses: { 201: { description: 'Request created' } } },
      },
      '/tenant/maintenance/{id}': {
        get: { tags: ['Tenant - Maintenance'], summary: 'Get maintenance request', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Request details' } } },
        put: { tags: ['Tenant - Maintenance'], summary: 'Update maintenance request', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Request updated' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - DOCUMENTS
      // ═══════════════════════════════════════════════════════════
      '/tenant/documents': {
        get: { tags: ['Tenant - Documents'], summary: 'List documents', responses: { 200: { description: 'Documents list' } } },
      },
      '/tenant/documents/upload': {
        post: { tags: ['Tenant - Documents'], summary: 'Upload document', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, residentId: { type: 'string' }, category: { type: 'string' }, title: { type: 'string' } } } } } }, responses: { 201: { description: 'Document uploaded' } } },
      },
      '/tenant/documents/{id}': {
        delete: { tags: ['Tenant - Documents'], summary: 'Delete document', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Document deleted' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // TENANT - NOTIFICATIONS
      // ═══════════════════════════════════════════════════════════
      '/tenant/notifications': {
        get: { tags: ['Tenant - Notifications'], summary: 'List notifications', responses: { 200: { description: 'Notifications list' } } },
        post: { tags: ['Tenant - Notifications'], summary: 'Create notification', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['userId', 'userType', 'title', 'message'], properties: { userId: { type: 'string' }, userType: { type: 'string', enum: ['TENANT', 'RESIDENT'] }, title: { type: 'string' }, message: { type: 'string' }, channel: { type: 'string', enum: ['IN_APP', 'EMAIL', 'SMS', 'PUSH'] } } } } } }, responses: { 201: { description: 'Notification created' } } },
      },
      '/tenant/notifications/{id}/read': {
        put: { tags: ['Tenant - Notifications'], summary: 'Mark notification as read', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { 200: { description: 'Marked as read' } } },
      },
      '/tenant/notifications/read-all': {
        put: { tags: ['Tenant - Notifications'], summary: 'Mark all notifications as read', responses: { 200: { description: 'All marked as read' } } },
      },

      // ═══════════════════════════════════════════════════════════
      // RESIDENT - PROFILE
      // ═══════════════════════════════════════════════════════════
      '/resident/me': {
        get: {
          tags: ['Resident - Profile'],
          summary: 'Get own profile with building/room/bed details',
          responses: { 200: { description: 'Resident profile with full location info' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // RESIDENT - RENT & PAYMENTS
      // ═══════════════════════════════════════════════════════════
      '/resident/rent': {
        get: {
          tags: ['Resident - Rent & Payments'],
          summary: 'Get own rent charges',
          description: 'Returns all rent charges for the logged-in resident with payment history per charge.',
          responses: { 200: { description: 'List of rent charges with associated payments', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/RentCharge' } } } } } } } },
        },
      },
      '/resident/rent/payment-config': {
        get: {
          tags: ['Resident - Rent & Payments'],
          summary: 'Get payment QR/UPI details for paying rent',
          description: 'Returns the tenant\'s configured UPI ID, QR code, and bank details so resident can make the payment externally.',
          responses: { 200: { description: 'Payment configuration', content: { 'application/json': { schema: { $ref: '#/components/schemas/PaymentConfig' } } } } },
        },
      },
      '/resident/rent/{chargeId}/pay': {
        post: {
          tags: ['Resident - Rent & Payments'],
          summary: 'Submit payment proof for a rent charge',
          description: 'After paying via UPI/Bank, resident submits transaction ID and optional screenshot as proof. Payment stays in PENDING status until tenant admin confirms.',
          parameters: [{ name: 'chargeId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'The rent charge ID to pay for' }],
          requestBody: {
            required: true,
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['transactionId'],
                  properties: {
                    transactionId: { type: 'string', description: 'UPI Transaction ID / UTR number', example: 'UPI123456789012' },
                    paymentMethod: { type: 'string', enum: ['UPI', 'BANK_TRANSFER', 'CARD', 'ONLINE'], default: 'UPI' },
                    amount: { type: 'number', description: 'Amount paid (defaults to remaining balance)' },
                    notes: { type: 'string', description: 'Any notes about the payment' },
                    proof: { type: 'string', format: 'binary', description: 'Payment screenshot (optional)' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Payment proof submitted, awaiting confirmation', content: { 'application/json': { schema: { $ref: '#/components/schemas/Payment' } } } },
            400: { description: 'Charge already paid or missing transaction ID' },
            404: { description: 'Rent charge not found' },
          },
        },
      },
      '/resident/rent/payments': {
        get: {
          tags: ['Resident - Rent & Payments'],
          summary: 'Get own payment history',
          description: 'Returns all payments made by this resident with their confirmation status.',
          responses: { 200: { description: 'List of payments', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'array', items: { $ref: '#/components/schemas/Payment' } } } } } } } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // RESIDENT - COMPLAINTS
      // ═══════════════════════════════════════════════════════════
      '/resident/complaints': {
        get: {
          tags: ['Resident - Complaints'],
          summary: 'Get own complaints',
          responses: { 200: { description: 'Complaints list' } },
        },
        post: {
          tags: ['Resident - Complaints'],
          summary: 'Submit a complaint',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'description'], properties: { title: { type: 'string' }, description: { type: 'string' }, category: { type: 'string', enum: ['MAINTENANCE', 'NOISE', 'CLEANLINESS', 'SECURITY', 'FOOD', 'WATER', 'ELECTRICITY', 'WIFI', 'OTHER'] }, priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] } } } } } },
          responses: { 201: { description: 'Complaint submitted' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // RESIDENT - VISITORS
      // ═══════════════════════════════════════════════════════════
      '/resident/visitors': {
        get: {
          tags: ['Resident - Visitors'],
          summary: 'Get visitors I registered',
          responses: { 200: { description: 'Visitors list' } },
        },
        post: {
          tags: ['Resident - Visitors'],
          summary: 'Pre-register a visitor',
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['name', 'phone'], properties: { name: { type: 'string' }, phone: { type: 'string' }, purpose: { type: 'string', default: 'Visit' } } } } } },
          responses: { 201: { description: 'Visitor pre-registered' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // RESIDENT - NOTIFICATIONS
      // ═══════════════════════════════════════════════════════════
      '/resident/notifications': {
        get: {
          tags: ['Resident - Notifications'],
          summary: 'Get own notifications',
          responses: { 200: { description: 'Notifications list' } },
        },
      },
      '/resident/notifications/{id}/read': {
        put: {
          tags: ['Resident - Notifications'],
          summary: 'Mark notification as read',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
          responses: { 200: { description: 'Marked as read' } },
        },
      },

      // ═══════════════════════════════════════════════════════════
      // RESIDENT - DOCUMENTS
      // ═══════════════════════════════════════════════════════════
      '/resident/documents': {
        get: {
          tags: ['Resident - Documents'],
          summary: 'Get own documents',
          responses: { 200: { description: 'Documents list' } },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);
export default swaggerSpec;
