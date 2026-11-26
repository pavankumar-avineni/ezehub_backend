-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('IN_USE', 'IN_STORAGE', 'UNDER_REPAIR', 'LOST', 'DISPOSED');

-- CreateEnum
CREATE TYPE "InventoryServiceType" AS ENUM ('REPAIR', 'SERVICE', 'INSPECTION');

-- CreateEnum
CREATE TYPE "InventoryServiceStatus" AS ENUM ('OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryAuditStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InventoryAuditResult" AS ENUM ('PENDING', 'FOUND', 'MISSING', 'UNEXPECTED');

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "assigned_resident_id" TEXT,
ADD COLUMN     "brand" TEXT,
ADD COLUMN     "disposal_reason" TEXT,
ADD COLUMN     "disposal_value" DECIMAL(12,2),
ADD COLUMN     "disposed_at" TIMESTAMP(3),
ADD COLUMN     "invoice_number" TEXT,
ADD COLUMN     "last_service_date" TIMESTAMP(3),
ADD COLUMN     "model" TEXT,
ADD COLUMN     "next_service_date" TIMESTAMP(3),
ADD COLUMN     "salvage_value" DECIMAL(12,2),
ADD COLUMN     "serial_number" TEXT,
ADD COLUMN     "status" "InventoryStatus" NOT NULL DEFAULT 'IN_USE',
ADD COLUMN     "useful_life_years" INTEGER,
ADD COLUMN     "vendor" TEXT;

-- AlterTable
ALTER TABLE "inventory_history" ADD COLUMN     "from_building_id" TEXT,
ADD COLUMN     "resident_id" TEXT,
ADD COLUMN     "status" "InventoryStatus",
ADD COLUMN     "to_building_id" TEXT;

-- CreateTable
CREATE TABLE "inventory_attachments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'IMAGE',
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "public_id" TEXT,
    "size" INTEGER,
    "mime_type" TEXT,
    "uploaded_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "inventory_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_service_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "type" "InventoryServiceType" NOT NULL DEFAULT 'REPAIR',
    "status" "InventoryServiceStatus" NOT NULL DEFAULT 'OPEN',
    "description" TEXT NOT NULL,
    "vendor" TEXT,
    "cost" DECIMAL(12,2),
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "next_service_date" TIMESTAMP(3),
    "previous_status" "InventoryStatus",
    "resolution" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_service_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_audits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "room_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "InventoryAuditStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "started_by" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_audit_items" (
    "id" TEXT NOT NULL,
    "audit_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "result" "InventoryAuditResult" NOT NULL DEFAULT 'PENDING',
    "expected_room_id" TEXT,
    "found_room_id" TEXT,
    "scanned_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "inventory_audit_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_attachments_tenant_id_idx" ON "inventory_attachments"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_attachments_inventory_item_id_idx" ON "inventory_attachments"("inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_service_logs_tenant_id_status_idx" ON "inventory_service_logs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "inventory_service_logs_inventory_item_id_idx" ON "inventory_service_logs"("inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_audits_tenant_id_status_idx" ON "inventory_audits"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "inventory_audits_building_id_idx" ON "inventory_audits"("building_id");

-- CreateIndex
CREATE INDEX "inventory_audit_items_audit_id_result_idx" ON "inventory_audit_items"("audit_id", "result");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_audit_items_audit_id_inventory_item_id_key" ON "inventory_audit_items"("audit_id", "inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_room_id_idx" ON "inventory_items"("tenant_id", "room_id");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_category_idx" ON "inventory_items"("tenant_id", "category");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_status_idx" ON "inventory_items"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "inventory_items_tenant_id_deleted_at_idx" ON "inventory_items"("tenant_id", "deleted_at");

-- CreateIndex
CREATE INDEX "inventory_items_assigned_resident_id_idx" ON "inventory_items"("assigned_resident_id");

-- CreateIndex
CREATE INDEX "inventory_history_inventory_item_id_created_at_idx" ON "inventory_history"("inventory_item_id", "created_at");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_assigned_resident_id_fkey" FOREIGN KEY ("assigned_resident_id") REFERENCES "residents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_attachments" ADD CONSTRAINT "inventory_attachments_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_service_logs" ADD CONSTRAINT "inventory_service_logs_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_items" ADD CONSTRAINT "inventory_audit_items_audit_id_fkey" FOREIGN KEY ("audit_id") REFERENCES "inventory_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_audit_items" ADD CONSTRAINT "inventory_audit_items_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill: items that were disposed or soft-deleted before the status column existed
UPDATE "inventory_items" SET "status" = 'DISPOSED', "disposed_at" = COALESCE("deleted_at", "updated_at")
WHERE "condition" = 'DISPOSED' OR "deleted_at" IS NOT NULL;

-- Backfill: QR payload for existing items
UPDATE "inventory_items" SET "qr_code" = 'EZEHUB:INV:' || "unique_code" WHERE "qr_code" IS NULL;
