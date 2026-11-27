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
  "email": "contact@sunrisepg.com",
  "phone": "9876543210",
  "adminFirstName": "Raj",
  "adminLastName": "Kumar",
  "adminEmail": "admin@sunrisepg.com",
  "adminPassword": "SecurePass@123",
  "ratePerBed": 15,
  "trialDays": 30,
  "features": ["STAFF", "INVENTORY", "FINANCE"]
}
```
`ratePerBed`, `trialDays` and `features` are optional. Without them the tenant gets the platform defaults
(default rate per bed, default free-trial days, default add-on features). `trialDays: 0` skips the trial.
`features` is the exact list of add-ons for this tenant (`[]` = core features only). Core features are always on.

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

`inventory:manage` is the superset and is accepted on every route. Granular permissions:
`inventory:read` (R), `inventory:write` (W), `inventory:delete` (D), `inventory:audit` (A).
Existing roles keep working through `inventory:manage`. New permissions are created when the seed runs.

| Method | Endpoint | Perm | Description |
|--------|----------|------|-------------|
| GET | `/tenant/inventory` | R | List. Filters: buildingId, roomId, category, condition, status, assignedResidentId, unassigned, warrantyExpiringInDays, warrantyExpired, serviceDue, purchasedFrom/To, includeDisposed, onlyDeleted, search, sortBy, sortOrder |
| POST | `/tenant/inventory` | W | Create (code auto-generated if omitted, QR payload set, history written) |
| POST | `/tenant/inventory/bulk` | W | Bulk create: `items[]` or `template` + `quantity` (max 200, atomic) |
| POST | `/tenant/inventory/bulk-transfer` | W | Transfer many items to a room/building/storage |
| GET | `/tenant/inventory/summary` | R | Counts by status/condition/category/building, purchase vs depreciated value, attention counts |
| GET | `/tenant/inventory/alerts` | R | Warranty expiring, service due, poor condition, lost, open repairs (`days`, `buildingId`) |
| GET | `/tenant/inventory/categories` | R | Known and used categories with counts |
| GET | `/tenant/inventory/export` | R | CSV export (same filters as list, max 10,000 rows) |
| GET | `/tenant/inventory/by-code/:code` | R | Look up by unique code or scanned QR payload |
| GET | `/tenant/inventory/service-logs` | R | List repair/service logs (status, type, buildingId, inventoryItemId) |
| POST | `/tenant/inventory/service-logs/:logId/complete` | W | Complete; restores status, updates service dates, books cost as Maintenance expense |
| POST | `/tenant/inventory/service-logs/:logId/cancel` | W | Cancel an open log |
| GET | `/tenant/inventory/audits` | R | List stock-take audits |
| POST | `/tenant/inventory/audits` | A | Start an audit for a building or room |
| GET | `/tenant/inventory/audits/:id` | R | Audit detail, progress, item results (`result` filter) |
| POST | `/tenant/inventory/audits/:id/scan` | A | Scan an item by code or QR payload |
| POST | `/tenant/inventory/audits/:id/complete` | A | Finish: unscanned become MISSING, optional `markMissingAsLost` |
| POST | `/tenant/inventory/audits/:id/cancel` | A | Cancel |
| GET | `/tenant/inventory/:id` | R | Item with attachments, recent service logs, recent history, valuation |
| PUT | `/tenant/inventory/:id` | W | Update item details (whitelisted fields; `null` clears dates) |
| DELETE | `/tenant/inventory/:id` | D | Soft delete for entries made in error (frees the code) |
| GET | `/tenant/inventory/:id/history` | R | Paginated audit trail with user, room, building and resident names |
| GET | `/tenant/inventory/:id/qr` | R | QR code, `format=png` (default) or `json`, `size` |
| POST | `/tenant/inventory/:id/transfer` | W | Move to another room/building/storage |
| POST | `/tenant/inventory/:id/status` | W | Set IN_USE, IN_STORAGE or LOST |
| POST | `/tenant/inventory/:id/assign` | W | Assign to an active resident |
| POST | `/tenant/inventory/:id/unassign` | W | Return from resident, with returned condition |
| POST | `/tenant/inventory/:id/dispose` | D | Retire an item (reason required) |
| POST | `/tenant/inventory/:id/restore` | D | Restore a deleted or disposed item |
| GET | `/tenant/inventory/:id/service-logs` | R | Service logs for one item |
| POST | `/tenant/inventory/:id/service-logs` | W | Open a repair/service/inspection. A repair sets UNDER_REPAIR |
| POST | `/tenant/inventory/:id/attachments` | W | Upload photo/invoice/warranty (multipart `file`, `kind`, max 20) |
| DELETE | `/tenant/inventory/:id/attachments/:attachmentId` | W | Delete an attachment |

---

## Tenant — Rent & Payments

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/tenant/rent/generate` | rent:manage | Generate monthly rent |
| GET | `/tenant/rent/charges` | rent:manage | List rent charges |
| PUT | `/tenant/rent/charges/:id` | rent:manage | Update rent charge |
| GET | `/tenant/rent/outstanding` | rent:manage | Outstanding balance |
| GET | `/tenant/payments` | payments:manage | List payments |
| POST | `/tenant/payments` | payments:manage | Record payment (manual) |
| GET | `/tenant/payments/pending-proofs` | payments:manage | Pending payment proofs from residents |
| POST | `/tenant/payments/:paymentId/confirm` | payments:manage | Confirm resident payment proof |
| POST | `/tenant/payments/:paymentId/reject` | payments:manage | Reject resident payment proof |

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

### POST /tenant/payments/:paymentId/reject
```json
{ "reason": "Invalid transaction ID, amount mismatch" }
```

---

## Tenant — Payment Settings

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| GET | `/tenant/settings/payment` | Any tenant user | Get payment settings (UPI, QR, bank) |
| PUT | `/tenant/settings/payment` | Any tenant user | Update payment settings |

### PUT /tenant/settings/payment
```json
{
  "paymentUpiId": "sunrise@upi",
  "paymentQrUrl": "https://res.cloudinary.com/.../qr.png",
  "paymentBankName": "HDFC Bank",
  "paymentAccountNumber": "1234567890",
  "paymentIfscCode": "HDFC0001234",
  "paymentAccountHolder": "Sunrise PG Pvt Ltd",
  "paymentInstructions": "Pay using any UPI app and submit proof in the app."
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

## Subscription & Billing (Platform ↔ Tenant)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/subscription/pricing` | No | Rate per bed + free-trial days (public, for pricing/sign-up pages) |
| GET | `/subscription/payment-config` | No | Get platform payment QR/UPI config |
| GET | `/subscription/admin/settings` | Platform | View default rate per bed, trial days, tax % |
| PUT | `/subscription/admin/settings` | Super admin | Change the defaults (new tenants / new invoices only). `applyToExistingTenants` re-prices tenants on the default rate |
| GET | `/subscription/admin/:tenantId/pricing` | Platform | One tenant's rate, beds per building, estimated invoice, trial, rate history |
| PUT | `/subscription/admin/:tenantId/rate` | Super admin | Set a custom rate per bed (`ratePerBed`), or `useDefault: true` |
| PUT | `/subscription/admin/:tenantId/trial` | Super admin | Extend (`extendDays`) or set (`trialEndsAt`) the free trial |
| GET | `/subscription/features` | No | Feature catalog with default prices (public) |
| GET | `/subscription/admin/features` | Platform | Catalog: every feature, price, price type, tenants using it |
| PUT | `/subscription/admin/features/:code` | Super admin | Edit price / price type / name / availability (new invoices only) |
| GET | `/subscription/admin/features/history` | Platform | Audit trail of feature changes (`tenantId`, `featureCode`, `scope=catalog`) |
| GET | `/subscription/admin/:tenantId/features` | Platform | One tenant's features, prices, monthly cost and history |
| PUT | `/subscription/admin/:tenantId/features` | Super admin | Set the complete add-on list for a tenant |
| POST | `/subscription/admin/:tenantId/features/:code/enable` | Super admin | Enable one add-on |
| POST | `/subscription/admin/:tenantId/features/:code/disable` | Super admin | Disable one add-on (data is kept) |
| PUT | `/subscription/admin/:tenantId/features/:code/price` | Super admin | Special price for one tenant (`price`) or `useCatalogPrice: true` |
| GET | `/subscription/my/features` | Tenant | My features: on, locked, and what each costs |
| GET | `/subscription/admin/analytics` | Platform | Subscription analytics (trials, paying, beds, expected revenue) |
| GET | `/subscription/admin/invoices/:tenantId` | Platform | Get invoices for a tenant |
| POST | `/subscription/admin/invoices/:tenantId` | Platform | Generate invoice for tenant |
| POST | `/subscription/admin/invoices/:invoiceId/confirm` | Platform | Confirm tenant payment |
| POST | `/subscription/admin/invoices/:invoiceId/reject` | Platform | Reject tenant payment |
| POST | `/subscription/admin/:tenantId/hold` | Platform | Put tenant on hold |
| POST | `/subscription/admin/:tenantId/dismiss` | Platform | Permanently dismiss tenant |
| GET | `/subscription/my` | Tenant | Get my subscription info |
| POST | `/subscription/my/pay/:invoiceId` | Tenant | Submit payment proof (multipart) |
| GET | `/subscription/my/invoices` | Tenant | Get my invoices |

### POST /subscription/my/pay/:invoiceId
```
Content-Type: multipart/form-data
Fields: transactionId (required), paymentMethod, proof (image), notes
```

### POST /subscription/admin/invoices/:invoiceId/reject
```json
{ "reason": "Invalid transaction, amount does not match" }
```

---

## Resident — Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/resident/send-otp` | No | Send OTP to resident phone |
| POST | `/auth/resident/verify-otp` | No | Verify OTP and get tokens |
| POST | `/auth/resident/login` | No | Login with phone + password |
| POST | `/auth/resident/set-password` | Yes | Set password (after first OTP login) |

### POST /auth/resident/send-otp
```json
{ "phone": "9876543210" }
```

### POST /auth/resident/verify-otp
```json
{ "phone": "9876543210", "otp": "123456" }
```

---

## Resident — Profile & Data

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resident/me` | Resident | Get own profile with room/bed/building details |
| GET | `/resident/documents` | Resident | Get own documents |

---

## Resident — Rent & Payments

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resident/rent` | Resident | Get own rent charges with payments |
| GET | `/resident/rent/payment-config` | Resident | Get tenant's UPI/QR/bank details |
| POST | `/resident/rent/:chargeId/pay` | Resident | Submit payment proof (multipart) |
| GET | `/resident/rent/payments` | Resident | Get own payment history |

### GET /resident/rent/payment-config
Returns the tenant's configured UPI ID, QR code URL, bank account details. This is what the resident mobile app shows to guide the payment.

### POST /resident/rent/:chargeId/pay
```
Content-Type: multipart/form-data
Fields: transactionId (required), paymentMethod (default: UPI), amount (optional, defaults to remaining), notes, proof (image)
```

**Flow:**
1. Resident views rent charges → sees pending amount
2. Gets payment config (QR/UPI) → pays externally via UPI app
3. Submits proof here → payment created with status=PENDING
4. Tenant admin sees it in "Pending Proofs" → confirms or rejects
5. On confirm → rent charge paidAmount updated, resident notified
6. On reject → resident gets notification to resubmit

---

## Resident — Complaints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resident/complaints` | Resident | Get own complaints |
| POST | `/resident/complaints` | Resident | Submit a complaint |

### POST /resident/complaints
```json
{ "title": "AC not working", "description": "AC has been non-functional for 2 days", "category": "MAINTENANCE", "priority": "HIGH" }
```

---

## Resident — Visitors

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resident/visitors` | Resident | Get visitors I registered |
| POST | `/resident/visitors` | Resident | Pre-register a visitor |

### POST /resident/visitors
```json
{ "name": "Ravi Kumar", "phone": "9876543210", "purpose": "Family Visit" }
```

---

## Resident — Notifications

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/resident/notifications` | Resident | Get own notifications |
| PUT | `/resident/notifications/:id/read` | Resident | Mark notification as read |

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

## Pricing: per bed

There are no plans. Every tenant gets every feature and unlimited buildings, and pays per bed.

| Rule | Value |
|------|-------|
| Default rate | ₹20 per bed per month (platform setting, editable) |
| Free trial | 15 days for new tenants (platform setting, editable, 0 = no trial) |
| Tax | 0% by default (platform setting, editable) |
| Billable beds | Every bed in the tenant's live buildings, empty or occupied. Deleted beds, rooms, floors and buildings are not billed |
| Invoice | beds × rate per bed, plus one line per priced add-on feature, plus tax, for a 30-day period. All lines (`lineItems`), bed count, rate and tax % are saved on the invoice and never recalculated |
| Custom price | The platform super admin can set a custom rate for one tenant (`PUT /subscription/admin/:tenantId/rate`). Every change is kept in the rate history |
| When changes apply | New tenants and new invoices only. Existing invoices never change |
| Free trial end | The first invoice's period starts when the trial ends. Nothing blocks a tenant automatically when a trial or paid period ends; the platform admin puts a tenant on hold |

---

## Features

**Core features** (always on, included in the per-bed rate, never priced): Property setup, Residents, Rent & payments, Dashboard, Notifications, Roles & permissions.

**Add-on features** (switched on per tenant by the platform, priced per bed or flat per month):

| Code | Feature | Gates |
|------|---------|-------|
| `STAFF` | Staff management | `/tenant/staff`, `/tenant/attendance` |
| `INVENTORY` | Inventory | `/tenant/inventory/*` |
| `MAINTENANCE` | Maintenance requests | `/tenant/maintenance` |
| `COMPLAINTS` | Complaints | `/tenant/complaints`, `/resident/complaints` |
| `VISITORS` | Visitor management | `/tenant/visitors`, `/resident/visitors` |
| `FOOD_MENU` | Food menu | `/tenant/menu`, `/resident/menu` |
| `FINANCE` | Finance | `/tenant/finance/*` |
| `DISCOUNTS` | Discounts | `/tenant/discounts`, `/resident/discounts` |
| `ONLINE_PAYMENTS` | Online rent payments (needs `RESIDENT_APP`) | `/payment/rent/*` |
| `PROMOTIONS` | Promotions | `/tenant/promotions`, `/resident/promotions` |
| `DOCUMENTS` | Documents | `/tenant/documents`, `/resident/documents` |
| `REPORTS` | Reports | `/tenant/reports/*` |
| `RESIDENT_APP` | Resident app | `/resident/*` and resident OTP / password login |

A tenant calling a feature it does not have gets `403` with `errors: [{ "code": "FEATURE_NOT_ENABLED", "feature": "<CODE>" }]`.
Turning a feature off blocks access immediately but keeps the data. Turning it back on restores access.
Login and `/auth/profile` return `enabledFeatures` (core + enabled add-ons) so the UI can hide locked menus.

---

## Default Credentials (After Seed)

| Role | Email | Password |
|------|-------|----------|
| Platform Super Admin | admin@ezehub.com | Admin@123456 |

---

## Swagger Documentation

Interactive API docs available at: `http://localhost:5000/api/docs`
