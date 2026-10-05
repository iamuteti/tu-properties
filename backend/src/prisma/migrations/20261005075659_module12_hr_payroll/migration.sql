-- CreateEnum
CREATE TYPE "PayrollRuleType" AS ENUM ('PROGRESSIVE_BANDS', 'PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "PayrollCalculationBase" AS ENUM ('GROSS', 'BASIC', 'TAXABLE');

-- CreateEnum
CREATE TYPE "PayrollBearer" AS ENUM ('EMPLOYEE', 'EMPLOYER', 'BOTH');

-- CreateEnum
CREATE TYPE "PayrollPeriodMode" AS ENUM ('PERIOD', 'ANNUALISED');

-- CreateEnum
CREATE TYPE "PayrollDeductionKind" AS ENUM ('STATUTORY', 'COMPANY', 'OTHER');

-- CreateEnum
CREATE TYPE "PayrollLineDirection" AS ENUM ('EARNING', 'EMPLOYEE_DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'PATERNITY', 'ADOPTION', 'BEREAVEMENT', 'COMPENSATORY', 'OFFICIAL', 'OFF_DUTY');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'PAID', 'VOID');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'EMPLOYEE';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "defaultLocale" VARCHAR(35),
ADD COLUMN     "payrollCountryCode" CHAR(2),
ADD COLUMN     "payrollRegionCode" TEXT,
ADD COLUMN     "weekendDays" INTEGER[] DEFAULT ARRAY[6, 7]::INTEGER[];

-- CreateTable
CREATE TABLE "payroll_rules" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "countryCode" CHAR(2),
    "regionCode" TEXT,
    "type" "PayrollRuleType" NOT NULL DEFAULT 'PERCENTAGE',
    "base" "PayrollCalculationBase" NOT NULL DEFAULT 'GROSS',
    "bearer" "PayrollBearer" NOT NULL DEFAULT 'EMPLOYEE',
    "ratePercent" DECIMAL(7,4),
    "minimumBaseAmount" DECIMAL(14,2),
    "maximumBaseAmount" DECIMAL(14,2),
    "bands" JSONB,
    "periodMode" "PayrollPeriodMode" NOT NULL DEFAULT 'PERIOD',
    "periodsPerYear" INTEGER NOT NULL DEFAULT 12,
    "exemptBelowBaseAmount" DECIMAL(14,2),
    "ledgerAccountCode" TEXT,
    "expenseAccountCode" TEXT DEFAULT '5090',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_components" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "PayrollDeductionKind" NOT NULL DEFAULT 'STATUTORY',
    "direction" "PayrollLineDirection" NOT NULL DEFAULT 'EMPLOYEE_DEDUCTION',
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isPensionable" BOOLEAN NOT NULL DEFAULT true,
    "countryCode" CHAR(2),
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeNumber" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "preferredLocale" VARCHAR(35),
    "department" TEXT,
    "jobTitle" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "hireDate" TIMESTAMP(3) NOT NULL,
    "terminationDate" TIMESTAMP(3),
    "basicSalary" DECIMAL(14,2) NOT NULL,
    "salaryCurrency" TEXT NOT NULL DEFAULT 'KES',
    "payFrequency" "PayFrequency" NOT NULL DEFAULT 'MONTHLY',
    "periodsPerYear" INTEGER NOT NULL DEFAULT 12,
    "nationalId" TEXT,
    "taxNumber" TEXT,
    "socialSecurityNumber" TEXT,
    "bankAccount" TEXT,
    "bankName" TEXT,
    "bankBranch" TEXT,
    "bankCode" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "leavePolicyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_components" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payComponentId" TEXT NOT NULL,
    "percentage" DECIMAL(7,4),
    "amount" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" CHAR(2),
    "regionCode" TEXT,
    "annualEntitlementDays" DECIMAL(5,2) NOT NULL,
    "carryoverLimitDays" DECIMAL(5,2),
    "minNoticeDays" INTEGER NOT NULL DEFAULT 0,
    "minNoticeWaivedDays" INTEGER NOT NULL DEFAULT 1,
    "unpaidAllowed" BOOLEAN NOT NULL DEFAULT true,
    "maxConsecutiveDays" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "countryCode" CHAR(2),
    "regionCode" VARCHAR(10),
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL DEFAULT 'ANNUAL',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "workflowInstanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "rulesApplied" JSONB,
    "journalEntryId" TEXT,
    "calculatedAt" TIMESTAMP(3),
    "calculatedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "basicSalary" DECIMAL(14,2) NOT NULL,
    "rulesApplied" JSONB,
    "locale" VARCHAR(35),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_lines" (
    "id" TEXT NOT NULL,
    "payslipId" TEXT NOT NULL,
    "direction" "PayrollLineDirection" NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "kind" "PayrollDeductionKind" NOT NULL DEFAULT 'STATUTORY',
    "payrollRuleId" TEXT,
    "payComponentId" TEXT,
    "accountCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_rules_organizationId_idx" ON "payroll_rules"("organizationId");

-- CreateIndex
CREATE INDEX "payroll_rules_countryCode_idx" ON "payroll_rules"("countryCode");

-- CreateIndex
CREATE INDEX "payroll_rules_code_idx" ON "payroll_rules"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_rules_organizationId_code_countryCode_regionCode_va_key" ON "payroll_rules"("organizationId", "code", "countryCode", "regionCode", "validFrom");

-- CreateIndex
CREATE INDEX "pay_components_organizationId_idx" ON "pay_components"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "pay_components_organizationId_code_countryCode_key" ON "pay_components"("organizationId", "code", "countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "employees_userId_key" ON "employees"("userId");

-- CreateIndex
CREATE INDEX "employees_organizationId_idx" ON "employees"("organizationId");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_userId_idx" ON "employees"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_organizationId_employeeNumber_key" ON "employees"("organizationId", "employeeNumber");

-- CreateIndex
CREATE INDEX "employee_components_employeeId_idx" ON "employee_components"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_components_employeeId_payComponentId_effectiveFrom_key" ON "employee_components"("employeeId", "payComponentId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "leave_policies_organizationId_idx" ON "leave_policies"("organizationId");

-- CreateIndex
CREATE INDEX "leave_policies_countryCode_idx" ON "leave_policies"("countryCode");

-- CreateIndex
CREATE UNIQUE INDEX "leave_policies_organizationId_code_key" ON "leave_policies"("organizationId", "code");

-- CreateIndex
CREATE INDEX "holidays_organizationId_idx" ON "holidays"("organizationId");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE INDEX "holidays_countryCode_idx" ON "holidays"("countryCode");

-- CreateIndex
CREATE INDEX "leave_requests_organizationId_idx" ON "leave_requests"("organizationId");

-- CreateIndex
CREATE INDEX "leave_requests_employeeId_idx" ON "leave_requests"("employeeId");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "leave_requests_startDate_idx" ON "leave_requests"("startDate");

-- CreateIndex
CREATE INDEX "payroll_runs_organizationId_idx" ON "payroll_runs"("organizationId");

-- CreateIndex
CREATE INDEX "payroll_runs_status_idx" ON "payroll_runs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_organizationId_reference_key" ON "payroll_runs"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "payslips_organizationId_idx" ON "payslips"("organizationId");

-- CreateIndex
CREATE INDEX "payslips_employeeId_idx" ON "payslips"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_payrollRunId_employeeId_key" ON "payslips"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "payslip_lines_payslipId_idx" ON "payslip_lines"("payslipId");

-- CreateIndex
CREATE INDEX "payslip_lines_payrollRuleId_idx" ON "payslip_lines"("payrollRuleId");

-- AddForeignKey
ALTER TABLE "payroll_rules" ADD CONSTRAINT "payroll_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_components" ADD CONSTRAINT "pay_components_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "leave_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_components" ADD CONSTRAINT "employee_components_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_components" ADD CONSTRAINT "employee_components_payComponentId_fkey" FOREIGN KEY ("payComponentId") REFERENCES "pay_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslipId_fkey" FOREIGN KEY ("payslipId") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payrollRuleId_fkey" FOREIGN KEY ("payrollRuleId") REFERENCES "payroll_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payComponentId_fkey" FOREIGN KEY ("payComponentId") REFERENCES "pay_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;
