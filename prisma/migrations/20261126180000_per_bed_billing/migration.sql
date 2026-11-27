-- Per-bed billing: replaces fixed plans with a per-tenant rate per bed, a free trial and platform billing settings.
-- Safety: keep a copy of the old plan data before the columns are dropped.
-- (plan is stored as text so the old enum type can be dropped below)
CREATE TABLE "subscriptions_plan_backup_20261126" AS
SELECT "id", "tenant_id", "plan"::text AS "plan", "status"::text AS "status", "building_limit", "device_limit",
       "api_access", "white_label", "priority_support", "price", "billing_cycle", "start_date", "end_date",
       "trial_ends_at", "created_at", "updated_at"
FROM "subscriptions";
-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "api_access",
DROP COLUMN "building_limit",
DROP COLUMN "device_limit",
DROP COLUMN "plan",
DROP COLUMN "price",
DROP COLUMN "priority_support",
DROP COLUMN "white_label",
ADD COLUMN     "is_custom_rate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rate_per_bed" DECIMAL(10,2) NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "billing_invoices" ADD COLUMN     "bed_count" INTEGER,
ADD COLUMN     "rate_per_bed" DECIMAL(10,2),
ADD COLUMN     "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
ALTER COLUMN "plan" DROP NOT NULL;

-- DropEnum
DROP TYPE "SubscriptionPlan";

-- CreateTable
CREATE TABLE "subscription_rate_history" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "old_rate" DECIMAL(10,2),
    "new_rate" DECIMAL(10,2) NOT NULL,
    "is_custom_rate" BOOLEAN NOT NULL,
    "reason" TEXT,
    "changed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "default_rate_per_bed" DECIMAL(10,2) NOT NULL DEFAULT 20,
    "trial_days" INTEGER NOT NULL DEFAULT 15,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_rate_history_tenant_id_created_at_idx" ON "subscription_rate_history"("tenant_id", "created_at");

-- AddForeignKey
ALTER TABLE "subscription_rate_history" ADD CONSTRAINT "subscription_rate_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Platform defaults: Rs 20 per bed per month, 15-day trial, no tax.
INSERT INTO "billing_settings" ("id", "default_rate_per_bed", "trial_days", "tax_percent", "updated_at")
VALUES ('default', 20, 15, 0, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

-- Existing tenants move to the default rate.
UPDATE "subscriptions" SET "rate_per_bed" = 20, "is_custom_rate" = false;