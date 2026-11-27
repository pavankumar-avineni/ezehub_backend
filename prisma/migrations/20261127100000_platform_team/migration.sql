-- Platform team: employee records, tenant ownership (creator + account manager), activity log, login history.
-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'EXITED');

-- AlterTable
ALTER TABLE "platform_users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "created_by_id" TEXT,
ADD COLUMN     "department" TEXT,
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "emergency_contact" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "employee_code" TEXT,
ADD COLUMN     "employee_status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
ADD COLUMN     "exit_date" DATE,
ADD COLUMN     "exit_reason" TEXT,
ADD COLUMN     "id_proof_number" TEXT,
ADD COLUMN     "id_proof_type" TEXT,
ADD COLUMN     "joining_date" DATE,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "password_changed_at" TIMESTAMP(3),
ADD COLUMN     "personal_email" TEXT,
ADD COLUMN     "personal_phone" TEXT,
ADD COLUMN     "pincode" TEXT,
ADD COLUMN     "reports_to_id" TEXT,
ADD COLUMN     "sessions_valid_after" TIMESTAMP(3),
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "account_manager_assigned_at" TIMESTAMP(3),
ADD COLUMN     "account_manager_id" TEXT,
ADD COLUMN     "created_by_id" TEXT;

-- CreateTable
CREATE TABLE "platform_login_history" (
    "id" TEXT NOT NULL,
    "platform_user_id" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "failure_reason" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_login_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_activity_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "actor_name" TEXT,
    "actor_email" TEXT,
    "event" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "tenant_id" TEXT,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_assignment_history" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "from_user_id" TEXT,
    "to_user_id" TEXT,
    "reason" TEXT,
    "assigned_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_assignment_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_login_history_platform_user_id_created_at_idx" ON "platform_login_history"("platform_user_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_login_history_created_at_idx" ON "platform_login_history"("created_at");

-- CreateIndex
CREATE INDEX "platform_activity_logs_actor_id_created_at_idx" ON "platform_activity_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_activity_logs_tenant_id_created_at_idx" ON "platform_activity_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "platform_activity_logs_event_idx" ON "platform_activity_logs"("event");

-- CreateIndex
CREATE INDEX "platform_activity_logs_entity_entity_id_idx" ON "platform_activity_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "platform_activity_logs_created_at_idx" ON "platform_activity_logs"("created_at");

-- CreateIndex
CREATE INDEX "tenant_assignment_history_tenant_id_created_at_idx" ON "tenant_assignment_history"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "tenant_assignment_history_to_user_id_idx" ON "tenant_assignment_history"("to_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_employee_code_key" ON "platform_users"("employee_code");

-- CreateIndex
CREATE INDEX "platform_users_reports_to_id_idx" ON "platform_users"("reports_to_id");

-- CreateIndex
CREATE INDEX "platform_users_employee_status_idx" ON "platform_users"("employee_status");

-- CreateIndex
CREATE INDEX "tenants_account_manager_id_idx" ON "tenants"("account_manager_id");

-- CreateIndex
CREATE INDEX "tenants_created_by_id_idx" ON "tenants"("created_by_id");

-- AddForeignKey
ALTER TABLE "platform_users" ADD CONSTRAINT "platform_users_reports_to_id_fkey" FOREIGN KEY ("reports_to_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_login_history" ADD CONSTRAINT "platform_login_history_platform_user_id_fkey" FOREIGN KEY ("platform_user_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_assignment_history" ADD CONSTRAINT "tenant_assignment_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_account_manager_id_fkey" FOREIGN KEY ("account_manager_id") REFERENCES "platform_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing platform users become employees: give each an employee code (EMP-0001, EMP-0002, ...).
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "created_at") AS n FROM "platform_users" WHERE "employee_code" IS NULL
)
UPDATE "platform_users" p
SET "employee_code" = 'EMP-' || LPAD(numbered.n::text, 4, '0')
FROM numbered
WHERE p."id" = numbered."id";
