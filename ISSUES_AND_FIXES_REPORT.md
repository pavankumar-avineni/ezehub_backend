# EzeHub Platform Audit & Fixes Report

## Overview
This document outlines the critical bugs, missing functional gaps, newly added features, and end-to-end verification steps implemented across the **EzeHub Frontend** (`D:\ezehub_frontend`, branch: `fardin`) and **EzeHub Backend Fork** (`D:\far ezehub-backend\ezehub_backend`).

---

## 1. Bugs Identified & Resolved

### 1.1 Remote Prisma Transaction Timeout in Tenant Creation
- **Module**: Backend (`tenant.service.js`)
- **Root Cause**: On remote cloud databases (Neon PostgreSQL), Prisma interactive transactions default to a 5-second timeout. Inside `tx`, the service ran CPU-intensive bcrypt hashing (`hashPassword(adminPassword)`) and a sequential loop of 10 individual `tx.buildingType.create()` queries. Combined with network latency, this exceeded 5 seconds and threw `Transaction API error: Transaction not found`.
- **Fix**:
  - Pre-computed `hashPassword` before entering the transaction.
  - Replaced the 10 sequential queries with a single batch `tx.buildingType.createMany(...)`.
  - Configured explicit transaction options: `{ maxWait: 15000, timeout: 30000 }`.

### 1.2 Decimal String Concatenation in Rent Payments
- **Module**: Backend (`rent.service.js`)
- **Root Cause**: In `RentService.updateCharge`, updating paid amounts performed JavaScript `+` addition directly on Decimal fields (`existingPaid + paymentAmount`), causing string concatenation (e.g. `"5000"` and `200` became `"5000200"`).
- **Fix**: Wrapped payments in `new Prisma.Decimal(...)` and used Prisma Decimal arithmetic methods.

### 1.3 Rent Balance Metric Structure (`NaN` / `0` Display)
- **Module**: Backend (`rent.service.js`) & Frontend (`RentPage.jsx`)
- **Root Cause**: `RentService.getOutstandingBalance` returned only `{ totalOutstanding, charges }`, but `RentPage.jsx` expected `{ overdueAmount, residentsWithDue }`. This caused the dashboard metrics to display `NaN` and `0`.
- **Fix**: Updated `rent.service.js` to return `overdueAmount` and `residentsWithDue` accurately.

### 1.4 Platform Dashboard Occupancy Chart Crash
- **Module**: Backend (`tenant.service.js`) & Frontend (`PlatformDashboardPage.jsx`)
- **Root Cause**: Prisma count aggregation returned `{ _count: { _all: N } }` instead of a flat count, causing Recharts pie chart to fail on null/undefined properties.
- **Fix**: Flattened `_count` mapping before returning tenant stats to the frontend.

### 1.5 Operational Staff Role Requirement Bug
- **Module**: Frontend (`StaffPage.jsx`) & Backend (`staff.service.js`)
- **Root Cause**: The backend Zod schema strictly required `roleId`, but the frontend form only prompted for `roleId` when `createLogin` was toggled on. Adding operational staff (cleaners, wardens) without web logins failed with silent 400 Bad Request errors.
- **Fix**: Added an automatic fallback to the default staff role in `StaffPage.jsx`.

### 1.6 Inventory Date Format Rejection
- **Module**: Frontend (`InventoryPage.jsx`)
- **Root Cause**: When adding an item without a purchase date, the form passed `purchaseDate: ""`. In Zod, `z.string().datetime().optional()` treats an empty string as an invalid ISO date format, failing schema validation.
- **Fix**: Sanitized `purchaseDate` to format as an ISO string or send `undefined` when blank.

---

## 2. Missing Functional Gaps Restored

### 2.1 Public Tenant Registration (Sign-Up Flow)
- **Previous State**: The application only supported "Sign In". Clicking "Get Started Free" opened the sign-in modal. No public API existed for tenant registration (only Super Admin could create tenants via `/platform/tenants`).
- **Restoration**:
  - Added `signupSchema` in `validators/index.js`.
  - Added `signup` controller in `auth.controller.js` and registered `POST /api/v1/auth/signup`.
  - Updated `LoginPage.jsx` with a dual **Sign In / Sign Up** tab switcher and registration form with auto-login redirection.

### 2.2 Complaints Module Dead Code & Missing UI Actions
- **Previous State**: In `ComplaintsPage.jsx`, form state, query hooks, and create mutations existed in code, but the "Add Complaint" button was omitted from `PageHeader` and the creation `<Dialog>` was missing from the JSX tree. In the detail dialog, there were no controls to assign staff or update complaint status.
- **Restoration**:
  - Added "Add Complaint" button to `PageHeader`.
  - Restored `<Dialog>` with building selection, resident picker, category, priority, and description inputs.
  - Added staff assignment dropdown and status action buttons (`IN_PROGRESS`, `RESOLVED`, `CLOSED`, `REJECTED`) with resolution notes.

### 2.3 Maintenance Module Missing Create Dialog
- **Previous State**: `MaintenancePage.jsx` had create mutations in code, but no "New Request" button in `PageHeader` and no creation dialog in JSX.
- **Restoration**:
  - Restored "New Request" action button in `PageHeader`.
  - Added creation modal with building picker, category, priority, and description fields.

### 2.4 Finance Module Read-Only Limitation
- **Previous State**: `FinancePage.jsx` only displayed tables for income and expenses. There was no user interface to trigger `POST /tenant/finance/income` or `POST /tenant/finance/expenses`.
- **Restoration**:
  - Added "Add Income" and "Add Expense" buttons in `PageHeader`.
  - Built modals for recording income and expenses with building selection, category tags, amount, date picker, and invoice/reference numbers.

---

## 3. Newly Added UI & Validation Features

### 3.1 Strict Phone Number Formatting & Validation
- **Instant Numeric Filtering**: Form input automatically strips non-numeric characters (letters, symbols) via regex `replace(/\D/g, '')`.
- **Strict 10-Digit Constraint**: Capped at exactly 10 digits (`maxLength={10}`, `inputMode="numeric"`).
- **Live Visual Counter**: Added a dynamic `X/10` counter next to the Phone label.
- **Backend Schema Enforcement**: Added `z.string().regex(/^\d{10}$/)` to `signupSchema`.

### 3.2 Show / Hide Password Toggles
- Added interactive eye icons (`Eye` / `EyeOff`) to:
  - Sign In password field
  - Sign Up password field
  - Sign Up confirm password field

### 3.3 Confirm Password Field & Validation
- Added a dedicated "Confirm Password" input aligned in a 2-column layout beside "Password".
- Added client-side matching validation (`passwords must match` and minimum 8 characters) before submitting.

---

## 4. Verification & Testing Checklist

| Test Scenario | Action / Click Path | Expected Outcome |
| :--- | :--- | :--- |
| **Phone Digit Restriction** | Go to Sign Up modal, type letters or 11+ numbers | Only numbers appear, capped strictly at 10 digits |
| **Password Show/Hide** | Click eye icon next to any password input | Password toggles between obscured dots and plain text |
| **Confirm Password Check** | Enter mismatched passwords and submit | Rejects with *"Passwords do not match"* |
| **Public Sign-Up** | Fill all valid fields and click *"Get Started Free"* | Account created, auto-logged in, and navigated to dashboard |
| **Add Complaint** | In Complaints, click *"+ Add Complaint"*, fill form, submit | New complaint added; detail modal allows assigning staff & updating status |
| **Add Maintenance Request** | In Maintenance, click *"+ New Request"*, fill form, submit | Request added; can be moved to *In Progress* or *Completed* |
| **Record Income / Expense** | In Finance, click *"+ Add Income"* or *"+ Add Expense"* | Transaction saved, stat cards & profit recalculate immediately |
