# EzeHub API Endpoints Reference

> Base URL: `http://localhost:5000/api/v1`
> All authenticated endpoints require: `Authorization: Bearer <access_token>`

---

## Health Check

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | No | API health check |

---

## Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/platform/login` | No | Platform admin/support login |
| POST | `/auth/tenant/login` | No | Tenant user login |
| POST | `/auth/refresh` | No | Refresh access token |
| POST | `/auth/logout` | No | Revoke refresh token |
| GET | `/auth/profile` | Yes | Get current user profile |
| POST | `/auth/change-password` | Yes | Change password |

### POST /auth/platform/login
```json
{ "email": "admin@ezehub.com", "password": "Admin@123456" }
```

### POST /auth/tenant/login
```json
{ "email": "admin@tenant.com", "password": "password123" }
```

### POST /auth/refresh
```json
{ "refreshToken": "<refresh_token>" }
```

---

## Platform — Tenants

> Requires: Platform scope + respective permissions

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/platform/tenants/analytics` | platform:analytics | Platform analytics dashboard |
| GET | `/platform/tenants` | tenants:read | List all tenants (paginated) |
| POST | `/platform/tenants` | tenants:create | Create new tenant |
| GET | `/platform/tenants/:id` | tenants:read | Get tenant details |
| PUT | `/platform/tenants/:id` | tenants:update | Update tenant |
| POST | `/platform/tenants/:id/suspend` | tenants:suspend | Suspend tenant |
| POST | `/platform/tenants/:id/activate` | tenants:activate | Activate tenant |
| DELETE | `/platform/tenants/:id` | tenants:delete | Soft delete tenant |

### POST /platform/tenants
```json
{
  "name": "Sunrise PG",
  "slug": "sunrise-pg",
  "email": "contact@sunrisepg.com",
  "phone": "9876543210",
  "plan": "STARTER",
  "adminFirstName": "Raj",
  "adminLastName": "Kumar",
  "adminEmail": "admin@sunrisepg.com",
  "adminPassword": "SecurePass@123"
}
```

---

## Tenant — Dashboard & Reports

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/dashboard` | Any tenant user | Tenant dashboard stats |
| GET | `/tenant/reports/occupancy` | reports:read | Occupancy report |
| GET | `/tenant/reports/rent-collection` | reports:read | Rent collection report |

### Query Parameters (Reports)
- `?buildingId=<uuid>` — Filter by building
- `?month=7&year=2026` — Rent collection period

---

## Tenant — Buildings

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/buildings` | buildings:read | List buildings |
| POST | `/tenant/buildings` | buildings:create | Create building |
| GET | `/tenant/buildings/:id` | buildings:read | Get building with floors |
| GET | `/tenant/buildings/:id/stats` | buildings:read | Building occupancy stats |
| PUT | `/tenant/buildings/:id` | buildings:update | Update building |
| DELETE | `/tenant/buildings/:id` | buildings:delete | Soft delete building |

### POST /tenant/buildings
```json
{
  "buildingTypeId": "<uuid>",
  "name": "Block A",
  "code": "BLK-A",
  "address": "123 Main Street, Bangalore",
  "city": "Bangalore",
  "state": "Karnataka",
  "pincode": "560001"
}
```

---

## Tenant — Floors

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/floors?buildingId=<uuid>` | floors:manage | List floors |
| POST | `/tenant/floors` | floors:manage | Create floor |
| GET | `/tenant/floors/:id` | floors:manage | Get floor with rooms |
| PUT | `/tenant/floors/:id` | floors:manage | Update floor |
| DELETE | `/tenant/floors/:id` | floors:manage | Soft delete floor |

---

## Tenant — Rooms

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/rooms` | rooms:manage | List rooms |
| POST | `/tenant/rooms` | rooms:manage | Create room |
| GET | `/tenant/rooms/:id` | rooms:manage | Get room with beds |
| PUT | `/tenant/rooms/:id` | rooms:manage | Update room |
| DELETE | `/tenant/rooms/:id` | rooms:manage | Soft delete room |

---

## Tenant — Beds

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/beds` | beds:manage | List beds |
| POST | `/tenant/beds` | beds:manage | Create bed |
| GET | `/tenant/beds/:id` | beds:manage | Get bed details |
| PUT | `/tenant/beds/:id` | beds:manage | Update bed |
| DELETE | `/tenant/beds/:id` | beds:manage | Soft delete bed |

---

## Tenant — Residents

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/residents` | residents:read | List residents |
| POST | `/tenant/residents` | residents:create | Create/check-in resident |
| GET | `/tenant/residents/:id` | residents:read | Get resident profile |
| PUT | `/tenant/residents/:id` | residents:update | Update resident |
| POST | `/tenant/residents/:id/transfer` | residents:transfer | Transfer to another bed |
| POST | `/tenant/residents/:id/checkout` | residents:checkout | Check-out resident |
| DELETE | `/tenant/residents/:id` | residents:delete | Soft delete resident |

### POST /tenant/residents/:id/transfer
```json
{ "toBedId": "<uuid>", "reason": "Room upgrade requested" }
```

---

## Tenant — Staff

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/staff` | staff:manage | List staff |
| POST | `/tenant/staff` | staff:manage | Create staff member |
| GET | `/tenant/staff/:id` | staff:manage | Get staff details |
| PUT | `/tenant/staff/:id` | staff:manage | Update staff |
| DELETE | `/tenant/staff/:id` | staff:manage | Soft delete staff |
| POST | `/tenant/attendance` | attendance:manage | Record attendance |
| POST | `/tenant/staff/:id/leave` | leave:manage | Create leave request |
| PUT | `/tenant/staff/:id/leave/:leaveId` | leave:manage | Approve/reject leave |

---

## Tenant — Inventory

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/inventory` | inventory:manage | List inventory items |
| POST | `/tenant/inventory` | inventory:manage | Create inventory item |
| GET | `/tenant/inventory/:id` | inventory:manage | Get item with history |
| PUT | `/tenant/inventory/:id` | inventory:manage | Update/transfer item |
| DELETE | `/tenant/inventory/:id` | inventory:manage | Soft delete item |

---

## Tenant — Rent & Payments

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/tenant/rent/generate` | rent:manage | Generate monthly rent |
| GET | `/tenant/rent/charges` | rent:manage | List rent charges |
| PUT | `/tenant/rent/charges/:id` | rent:manage | Update rent charge |
| GET | `/tenant/rent/outstanding` | rent:manage | Outstanding balance |
| GET | `/tenant/payments` | payments:manage | List payments |
| POST | `/tenant/payments` | payments:manage | Record payment |

### POST /tenant/rent/generate
```json
{ "month": 7, "year": 2026, "buildingId": "<uuid>" }
```

### POST /tenant/payments
```json
{
  "residentId": "<uuid>",
  "rentChargeId": "<uuid>",
  "amount": 8000,
  "method": "UPI",
  "transactionId": "TXN123456"
}
```

---

## Tenant — Complaints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/complaints` | complaints:read | List complaints |
| POST | `/tenant/complaints` | complaints:create | Create complaint |
| GET | `/tenant/complaints/:id` | complaints:read | Get complaint with comments |
| POST | `/tenant/complaints/:id/assign` | complaints:manage | Assign to staff |
| PUT | `/tenant/complaints/:id/status` | complaints:manage | Update status |
| POST | `/tenant/complaints/:id/comments` | complaints:read | Add comment |

---

## Tenant — Visitors

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/visitors` | visitors:manage | List visitors |
| POST | `/tenant/visitors` | visitors:manage | Register visitor (sends OTP) |
| GET | `/tenant/visitors/:id` | visitors:manage | Get visitor details |
| POST | `/tenant/visitors/:id/verify-otp` | visitors:manage | Verify OTP |
| POST | `/tenant/visitors/:id/check-in` | visitors:manage | Check-in visitor |
| POST | `/tenant/visitors/:id/check-out` | visitors:manage | Check-out visitor |

---

## Tenant — Finance

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/finance/dashboard` | finance:read | Finance dashboard |
| GET | `/tenant/finance/income` | finance:read | List income records |
| POST | `/tenant/finance/income` | finance:manage | Record income |
| GET | `/tenant/finance/expenses` | finance:read | List expense records |
| POST | `/tenant/finance/expenses` | finance:manage | Record expense |

---

## Tenant — Maintenance

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/maintenance` | maintenance:manage | List maintenance requests |
| POST | `/tenant/maintenance` | maintenance:manage | Create request |
| GET | `/tenant/maintenance/:id` | maintenance:manage | Get request details |
| PUT | `/tenant/maintenance/:id` | maintenance:manage | Update request |

---

## Tenant — Documents

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/documents` | documents:manage | List documents |
| POST | `/tenant/documents/upload` | documents:manage | Upload document (multipart) |
| DELETE | `/tenant/documents/:id` | documents:manage | Delete document |

### POST /tenant/documents/upload
```
Content-Type: multipart/form-data
Fields: file, residentId, entityType, entityId, name
```

---

## Tenant — Notifications

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/notifications` | Any tenant user | List user notifications |
| POST | `/tenant/notifications` | notifications:manage | Create notification |
| PUT | `/tenant/notifications/:id/read` | Any tenant user | Mark as read |
| PUT | `/tenant/notifications/read-all` | Any tenant user | Mark all as read |

---

## Common Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `limit` | integer | Items per page (default: 20, max: 100) |
| `search` | string | Full-text search |
| `sortBy` | string | Sort field |
| `sortOrder` | asc/desc | Sort direction |
| `status` | string | Filter by status |
| `buildingId` | uuid | Filter by building |

---

## Standard Response Format

### Success
```json
{
  "success": true,
  "message": "Success",
  "data": { ... }
}
```

### Paginated
```json
{
  "success": true,
  "message": "Success",
  "data": [ ... ],
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5,
      "hasNext": true,
      "hasPrev": false
    }
  }
}
```

### Error
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "body.email", "message": "Invalid email" }
  ]
}
```

---

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 401 | Unauthorized |
| 403 | Forbidden / Subscription limit |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 422 | Validation error |
| 429 | Rate limited |
| 500 | Server error |

---

## Subscription Plans

| Plan | Buildings | Devices | API | White Label | Support |
|------|-----------|---------|-----|-------------|---------|
| Starter | 3 | 3 | No | No | Standard |
| Growth | 5 | 5 | No | No | Standard |
| Business | 20 | 10 | Yes | No | Priority |
| Enterprise | Unlimited | Unlimited | Yes | Yes | Priority |

---

## Default Credentials (After Seed)

| Role | Email | Password |
|------|-------|----------|
| Platform Super Admin | admin@ezehub.com | Admin@123456 |

---

## Swagger Documentation

Interactive API docs available at: `http://localhost:5000/api/docs`
