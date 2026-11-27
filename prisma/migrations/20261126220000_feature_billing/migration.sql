-- Feature catalog, per-tenant feature assignment and per-feature billing.
-- CreateEnum
CREATE TYPE "FeaturePriceType" AS ENUM ('PER_BED', 'FLAT');

-- AlterTable
ALTER TABLE "billing_settings" ADD COLUMN     "default_features" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "billing_invoices" ADD COLUMN     "line_items" JSONB;

-- CreateTable
CREATE TABLE "features" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "group" TEXT NOT NULL,
    "is_core" BOOLEAN NOT NULL DEFAULT false,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "price_type" "FeaturePriceType" NOT NULL DEFAULT 'PER_BED',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_features" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "feature_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "custom_price" DECIMAL(10,2),
    "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),
    "enabled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_change_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "feature_code" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "old_value" JSONB,
    "new_value" JSONB,
    "reason" TEXT,
    "changed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "features_code_key" ON "features"("code");

-- CreateIndex
CREATE INDEX "tenant_features_tenant_id_is_enabled_idx" ON "tenant_features"("tenant_id", "is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_features_tenant_id_feature_id_key" ON "tenant_features"("tenant_id", "feature_id");

-- CreateIndex
CREATE INDEX "feature_change_logs_tenant_id_created_at_idx" ON "feature_change_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "feature_change_logs_feature_code_created_at_idx" ON "feature_change_logs"("feature_code", "created_at");

-- AddForeignKey
ALTER TABLE "tenant_features" ADD CONSTRAINT "tenant_features_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "features"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed the catalog. Price starts at 0 (set it from the platform API). Code-owned fields mirror src/constants/features.js.
INSERT INTO "features" ("id", "code", "name", "description", "group", "is_core", "price", "price_type", "is_active", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'PROPERTY_SETUP', 'Property setup', 'Buildings, floors, rooms, beds, building types and the visual bed map.', 'Property setup', true, 0, 'PER_BED', true, 10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'RESIDENTS', 'Residents', 'Resident records, check-in, transfer and checkout.', 'Residents', true, 0, 'PER_BED', true, 20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'RENT_PAYMENTS', 'Rent & payments', 'Monthly rent generation, charges, payment recording, proof confirmation and payment settings.', 'Money', true, 0, 'PER_BED', true, 30, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DASHBOARD', 'Dashboard', 'Tenant dashboard with occupancy, rent and complaint stats.', 'Insights & admin', true, 0, 'PER_BED', true, 40, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'NOTIFICATIONS', 'Notifications', 'In-app notifications for staff and residents.', 'Communication & growth', true, 0, 'PER_BED', true, 50, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ROLES_ACCESS', 'Roles & permissions', 'Custom roles and permission management for your team.', 'Insights & admin', true, 0, 'PER_BED', true, 60, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'STAFF', 'Staff management', 'Staff records, attendance and leave management.', 'Operations', false, 0, 'PER_BED', true, 100, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'INVENTORY', 'Inventory', 'Asset register with QR codes, transfers, assignments, repairs, stock-take audits, valuation and export.', 'Operations', false, 0, 'PER_BED', true, 110, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'MAINTENANCE', 'Maintenance requests', 'Maintenance request tracking and assignment.', 'Operations', false, 0, 'PER_BED', true, 120, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'COMPLAINTS', 'Complaints', 'Complaint desk with assignment, status and comments (also used by the resident app).', 'Operations', false, 0, 'PER_BED', true, 130, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'VISITORS', 'Visitor management', 'Visitor registration with OTP check-in and check-out (also used by the resident app).', 'Operations', false, 0, 'PER_BED', true, 140, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FOOD_MENU', 'Food menu', 'Weekly food menu per building (also shown in the resident app).', 'Operations', false, 0, 'PER_BED', true, 150, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'FINANCE', 'Finance', 'Income and expense records and the finance dashboard.', 'Money', false, 0, 'PER_BED', true, 200, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DISCOUNTS', 'Discounts', 'Discount rules for residents and buildings (also shown in the resident app).', 'Money', false, 0, 'PER_BED', true, 210, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ONLINE_PAYMENTS', 'Online rent payments', 'Residents pay rent online through Razorpay using your own Razorpay account.', 'Money', false, 0, 'PER_BED', true, 220, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'PROMOTIONS', 'Promotions', 'Local business promotions shown to residents.', 'Communication & growth', false, 0, 'PER_BED', true, 300, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'DOCUMENTS', 'Documents', 'Document upload and storage (also visible to residents).', 'Communication & growth', false, 0, 'PER_BED', true, 310, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'REPORTS', 'Reports', 'Occupancy and rent collection reports.', 'Insights & admin', false, 0, 'PER_BED', true, 400, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'RESIDENT_APP', 'Resident app', 'Resident login (OTP / password), profile, rent, payment proof and notifications for residents.', 'Resident app', false, 0, 'PER_BED', true, 500, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

-- Existing tenants keep everything they could use before: every add-on is enabled for them.
-- Add-on prices are 0, so their bills do not change until the platform admin sets a price.
INSERT INTO "tenant_features" ("id", "tenant_id", "feature_id", "is_enabled", "enabled_at", "updated_at")
SELECT gen_random_uuid()::text, t."id", f."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "tenants" t CROSS JOIN "features" f
WHERE f."is_core" = false
ON CONFLICT ("tenant_id", "feature_id") DO NOTHING;

-- New tenants (self sign-up or created without choosing features) start with every add-on until the platform admin narrows this list.
UPDATE "billing_settings" SET "default_features" = ARRAY['STAFF', 'INVENTORY', 'MAINTENANCE', 'COMPLAINTS', 'VISITORS', 'FOOD_MENU', 'FINANCE', 'DISCOUNTS', 'ONLINE_PAYMENTS', 'PROMOTIONS', 'DOCUMENTS', 'REPORTS', 'RESIDENT_APP']::text[] WHERE "id" = 'default';
