-- CreateEnum
CREATE TYPE "Role" AS ENUM ('LEADER', 'DEPUTY', 'CURATOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'FIRED');

-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FormType" AS ENUM ('APPLICATION', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('NEW', 'NOTIFIED', 'NO_EMPLOYEE', 'NO_FORM', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'DELIVERED', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "login" TEXT,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'EMPLOYEE',
    "rank" TEXT,
    "division" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "gameId" TEXT,
    "discordTag" TEXT,
    "hiredAt" TIMESTAMP(3),
    "firedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT NOT NULL,
    "content" JSONB,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "externalId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Form" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "FormType" NOT NULL DEFAULT 'APPLICATION',
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "formKey" TEXT,
    "googleFormId" TEXT,
    "googleFormUrl" TEXT,
    "questions" JSONB,
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT true,
    "webhookUrlEnc" TEXT,
    "webhookUsername" TEXT,
    "webhookAvatarUrl" TEXT,
    "webhookContent" TEXT,
    "webhookTitle" TEXT,
    "webhookColor" INTEGER,
    "webhookFooter" TEXT,
    "webhookTimestamp" BOOLEAN NOT NULL DEFAULT true,
    "webhookMention" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "formId" TEXT,
    "externalId" TEXT,
    "answers" JSONB NOT NULL,
    "employeeId" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'NEW',
    "meta" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "googleDocId" TEXT,
    "googleDocUrl" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_configured',
    "details" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorLogin" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'discord_webhook',
    "targetUrlEnc" TEXT,
    "targetUrlMasked" TEXT,
    "payload" JSONB NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dedupeKey" TEXT,
    "relatedSubmissionId" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_login_key" ON "Employee"("login");

-- CreateIndex
CREATE INDEX "Employee_fullName_idx" ON "Employee"("fullName");

-- CreateIndex
CREATE INDEX "Employee_status_idx" ON "Employee"("status");

-- CreateIndex
CREATE INDEX "Employee_division_idx" ON "Employee"("division");

-- CreateIndex
CREATE UNIQUE INDEX "Report_externalId_key" ON "Report"("externalId");

-- CreateIndex
CREATE INDEX "Report_employeeId_idx" ON "Report"("employeeId");

-- CreateIndex
CREATE INDEX "Report_submittedAt_idx" ON "Report"("submittedAt");

-- CreateIndex
CREATE INDEX "Report_type_idx" ON "Report"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Form_formKey_key" ON "Form"("formKey");

-- CreateIndex
CREATE UNIQUE INDEX "Form_googleFormId_key" ON "Form"("googleFormId");

-- CreateIndex
CREATE INDEX "Form_status_idx" ON "Form"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FormSubmission_externalId_key" ON "FormSubmission"("externalId");

-- CreateIndex
CREATE INDEX "FormSubmission_formId_idx" ON "FormSubmission"("formId");

-- CreateIndex
CREATE INDEX "FormSubmission_status_idx" ON "FormSubmission"("status");

-- CreateIndex
CREATE INDEX "FormSubmission_receivedAt_idx" ON "FormSubmission"("receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_kind_key" ON "Integration"("kind");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_actorLogin_idx" ON "AuditLog"("actorLogin");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryJob_dedupeKey_key" ON "DeliveryJob"("dedupeKey");

-- CreateIndex
CREATE INDEX "DeliveryJob_status_idx" ON "DeliveryJob"("status");

-- CreateIndex
CREATE INDEX "DeliveryJob_nextAttemptAt_idx" ON "DeliveryJob"("nextAttemptAt");

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_formId_fkey" FOREIGN KEY ("formId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryJob" ADD CONSTRAINT "DeliveryJob_relatedSubmissionId_fkey" FOREIGN KEY ("relatedSubmissionId") REFERENCES "FormSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

