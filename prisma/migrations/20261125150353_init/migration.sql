-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('WORK', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('PROSPECT', 'ACTIVE', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('OUTSOURCING', 'EXPENSE');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalEventType" AS ENUM ('SUBMIT', 'WITHDRAW', 'APPROVE', 'REJECT', 'CANCEL_APPROVAL');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGIN_FAILURE', 'PASSWORD_CHANGE', 'PASSWORD_RESET', 'TOTP_ENABLE', 'TOTP_DISABLE', 'TOTP_RESET', 'USER_CREATE', 'USER_UPDATE', 'USER_DISABLE', 'RATE_CHANGE', 'TIMESHEET_SUBMIT', 'TIMESHEET_WITHDRAW', 'TIMESHEET_APPROVE', 'TIMESHEET_REJECT', 'TIMESHEET_APPROVAL_CANCEL', 'MONTH_CLOSE', 'MONTH_REOPEN', 'PROJECT_CHANGE', 'EXPENSE_CHANGE', 'MASTER_CHANGE', 'COMPANY_CHANGE', 'EXPORT');

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('DRAFT_ENTRIES', 'EXPLAIN_FORECAST', 'SUMMARIZE_PERIOD', 'MONTHLY_REPORT');

-- CreateEnum
CREATE TYPE "AiOutcome" AS ENUM ('OK', 'FALLBACK_NO_KEY', 'RATE_LIMITED', 'TIMEOUT', 'API_ERROR', 'REFUSAL', 'INVALID_OUTPUT');

-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "timeStepMinutes" INTEGER NOT NULL DEFAULT 15,
    "gapThresholdMinutes" INTEGER NOT NULL DEFAULT 15,
    "submissionGraceDays" INTEGER NOT NULL DEFAULT 3,
    "requireTotpForManagers" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "departmentId" UUID,
    "approverId" UUID,
    "canViewCost" BOOLEAN NOT NULL DEFAULT false,
    "dailyStandardMinutes" INTEGER NOT NULL DEFAULT 480,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "totpSecretEnc" TEXT,
    "totpEnabledAt" TIMESTAMPTZ(6),
    "totpLastUsedStep" INTEGER,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(6),

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostRate" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "hourlyRate" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkCategory" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProjectKind" NOT NULL DEFAULT 'WORK',
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "clientId" UUID,
    "pmId" UUID,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "revenueAmount" INTEGER,
    "colorIndex" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "Phase" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "budgetMinutes" INTEGER NOT NULL DEFAULT 0,
    "remainingMinutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Phase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "ExpenseKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "workCategoryId" UUID,
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendance" (
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "gapReason" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Attendance_pkey" PRIMARY KEY ("userId","date")
);

-- CreateTable
CREATE TABLE "RunningTimer" (
    "userId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "phaseId" UUID NOT NULL,
    "workCategoryId" UUID,
    "note" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "RunningTimer_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TimesheetPeriod" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "TimesheetStatus" NOT NULL,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMPTZ(6),
    "decidedAt" TIMESTAMPTZ(6),
    "deciderId" UUID,
    "comment" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "TimesheetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalEvent" (
    "id" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "type" "ApprovalEventType" NOT NULL,
    "actorId" UUID NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosingMonth" (
    "yearMonth" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMPTZ(6),
    "closedById" UUID,
    "reopenedAt" TIMESTAMPTZ(6),
    "reopenReason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ClosingMonth_pkey" PRIMARY KEY ("yearMonth")
);

-- CreateTable
CREATE TABLE "MonthlyLaborCost" (
    "yearMonth" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "minutes" INTEGER NOT NULL,
    "laborCost" INTEGER NOT NULL,
    "unratedMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MonthlyLaborCost_pkey" PRIMARY KEY ("yearMonth","userId","projectId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID,
    "action" "AuditAction" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "ip" TEXT,
    "detail" JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "feature" "AiFeature" NOT NULL,
    "model" TEXT,
    "outcome" "AiOutcome" NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCache" (
    "key" TEXT NOT NULL,
    "feature" "AiFeature" NOT NULL,
    "output" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCache_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_approverId_idx" ON "User"("approverId");

-- CreateIndex
CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CostRate_userId_effectiveFrom_key" ON "CostRate"("userId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "Client_code_key" ON "Client"("code");

-- CreateIndex
CREATE UNIQUE INDEX "WorkCategory_code_key" ON "WorkCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- CreateIndex
CREATE INDEX "Project_pmId_idx" ON "Project"("pmId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_projectId_name_key" ON "Phase"("projectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Phase_id_projectId_key" ON "Phase"("id", "projectId");

-- CreateIndex
CREATE INDEX "Expense_projectId_date_idx" ON "Expense"("projectId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_userId_date_idx" ON "TimeEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_projectId_date_idx" ON "TimeEntry"("projectId", "date");

-- CreateIndex
CREATE INDEX "TimeEntry_phaseId_idx" ON "TimeEntry"("phaseId");

-- CreateIndex
CREATE INDEX "TimesheetPeriod_status_idx" ON "TimesheetPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TimesheetPeriod_userId_startDate_key" ON "TimesheetPeriod"("userId", "startDate");

-- CreateIndex
CREATE INDEX "ApprovalEvent_periodId_at_idx" ON "ApprovalEvent"("periodId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_at_idx" ON "AuditLog"("actorId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_action_at_idx" ON "AuditLog"("action", "at");

-- CreateIndex
CREATE INDEX "AiUsageLog_userId_createdAt_idx" ON "AiUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiCache_expiresAt_idx" ON "AiCache"("expiresAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostRate" ADD CONSTRAINT "CostRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_pmId_fkey" FOREIGN KEY ("pmId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Phase" ADD CONSTRAINT "Phase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_phaseId_projectId_fkey" FOREIGN KEY ("phaseId", "projectId") REFERENCES "Phase"("id", "projectId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_workCategoryId_fkey" FOREIGN KEY ("workCategoryId") REFERENCES "WorkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "Phase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_workCategoryId_fkey" FOREIGN KEY ("workCategoryId") REFERENCES "WorkCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_deciderId_fkey" FOREIGN KEY ("deciderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TimesheetPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlyLaborCost" ADD CONSTRAINT "MonthlyLaborCost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsageLog" ADD CONSTRAINT "AiUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- 整合性の制約（Prisma のスキーマでは表せないもの）
-- ============================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Company"
  ADD CONSTRAINT "Company_single_row" CHECK ("id" = 1),
  ADD CONSTRAINT "Company_step" CHECK ("timeStepMinutes" IN (5, 10, 15, 30)),
  ADD CONSTRAINT "Company_gap" CHECK ("gapThresholdMinutes" BETWEEN 0 AND 120),
  ADD CONSTRAINT "Company_grace" CHECK ("submissionGraceDays" BETWEEN 0 AND 14);

ALTER TABLE "User"
  ADD CONSTRAINT "User_not_self_approver" CHECK ("approverId" IS NULL OR "approverId" <> "id"),
  ADD CONSTRAINT "User_standard_minutes" CHECK ("dailyStandardMinutes" BETWEEN 0 AND 1440);

ALTER TABLE "CostRate"
  ADD CONSTRAINT "CostRate_range" CHECK ("hourlyRate" BETWEEN 0 AND 100000);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_period" CHECK ("endDate" IS NULL OR "endDate" >= "startDate"),
  ADD CONSTRAINT "Project_revenue" CHECK ("revenueAmount" IS NULL OR "revenueAmount" >= 0),
  ADD CONSTRAINT "Project_internal_no_revenue" CHECK ("kind" = 'WORK' OR ("revenueAmount" IS NULL AND "clientId" IS NULL)),
  ADD CONSTRAINT "Project_color" CHECK ("colorIndex" BETWEEN 0 AND 11);

ALTER TABLE "Phase"
  ADD CONSTRAINT "Phase_budget" CHECK ("budgetMinutes" >= 0),
  ADD CONSTRAINT "Phase_remaining" CHECK ("remainingMinutes" IS NULL OR "remainingMinutes" >= 0);

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_amount" CHECK ("amount" >= 1);

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_range" CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440),
  ADD CONSTRAINT "TimeEntry_minutes" CHECK ("minutes" = "endMinute" - "startMinute"),
  -- 同じ人・同じ日の時間帯は重ならない（端が接するのはよい）
  ADD CONSTRAINT "TimeEntry_no_overlap" EXCLUDE USING gist (
    "userId" WITH =,
    "date" WITH =,
    int4range("startMinute", "endMinute") WITH &&
  );

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_range" CHECK (
    "startMinute" >= 0 AND "startMinute" < 1440
    AND "endMinute" > "startMinute" AND "endMinute" <= "startMinute" + 1440
    AND "breakMinutes" >= 0 AND "breakMinutes" < "endMinute" - "startMinute"
  );

ALTER TABLE "TimesheetPeriod"
  ADD CONSTRAINT "TimesheetPeriod_no_self_approval" CHECK ("deciderId" IS NULL OR "deciderId" <> "userId"),
  ADD CONSTRAINT "TimesheetPeriod_dates" CHECK ("endDate" >= "startDate");

-- 承認履歴・監査ログは追記のみ
CREATE OR REPLACE FUNCTION tsumugi_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% は追記のみです', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ApprovalEvent_append_only" BEFORE UPDATE OR DELETE ON "ApprovalEvent"
  FOR EACH ROW EXECUTE FUNCTION tsumugi_append_only();
CREATE TRIGGER "AuditLog_append_only" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION tsumugi_append_only();
