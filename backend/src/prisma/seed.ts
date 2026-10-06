import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { seedDemoData } from './demo-data';
import { seedRoles } from './roles-seed';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding database...');

  // 1. Clean the database (in correct order to handle foreign keys)
  console.log('Cleaning database...');
  await prisma.payment.deleteMany();
  await prisma.receiptLine.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.invoiceItem.deleteMany();
  // Sales own instalments and commissions, and reference properties/users, so they
  // are cleared before the tables they point at. Without these three lines this
  // seed cannot run a second time at all: `sale_transactions_propertyId_fkey` is
  // ON DELETE RESTRICT, so the `properties.deleteMany()` below trips over the sales
  // module's data. `demo-data.ts` has always had them; this file had not caught up.
  await prisma.commission.deleteMany();
  await prisma.saleInstallment.deleteMany();
  await prisma.saleTransaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.rentalAgreement.deleteMany();
  await prisma.tenantEmergencyContact.deleteMany();
  // CRM first: `Lead`/`Contact` reference properties, branches, users and (optionally)
  // tenants, and `CommunicationLog` references both.
  await prisma.communicationLog.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.tenant.deleteMany();
  // Module 10 runs request -> RFQ -> quote -> order -> receipt and every table points
  // at the one before it, so it is cleared child-first. Module 11's movements come
  // first of all: they are the only table referencing purchase-order lines, work
  // orders *and* goods-receipt lines at once.
  await prisma.stockMovement.deleteMany();
  await prisma.goodsReceiptLine.deleteMany();
  await prisma.goodsReceipt.deleteMany();
  await prisma.purchaseOrderLine.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.rfqQuoteLine.deleteMany();
  await prisma.rfqQuote.deleteMany();
  await prisma.rfqInvitation.deleteMany();
  await prisma.rfq.deleteMany();
  await prisma.purchaseRequestLine.deleteMany();
  await prisma.purchaseRequest.deleteMany();
  // Module 12: payslips hang off a run, an employee and (via their reason) a work
  // order, so they go before all three.
  await prisma.payslipLine.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.employeeComponent.deleteMany();
  await prisma.payComponent.deleteMany();
  await prisma.leavePolicy.deleteMany();
  await prisma.holiday.deleteMany();
  // Module 9: work orders point at properties, units, tenants, assets and users.
  await prisma.workOrderTask.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.preventiveMaintenanceRun.deleteMany();
  await prisma.preventiveMaintenanceSchedule.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.unitFeature.deleteMany();
  // Module 14 - Utilities. Charges first: they reference readings with
  // ON DELETE RESTRICT, so a readings delete would otherwise be refused. Meters
  // last, since readings and rates cascade from them but their own deletes are
  // clearer in this order than relying on four cascades.
  await prisma.utilityCharge.deleteMany();
  await prisma.meterReading.deleteMany();
  await prisma.utilityRate.deleteMany();
  await prisma.utilityMeter.deleteMany();
  await prisma.unitServiceCharge.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.propertySecurityDeposit.deleteMany();
  await prisma.propertyStandingCharge.deleteMany();
  await prisma.property.deleteMany();
  await prisma.landlord.deleteMany();
  await prisma.roleAssignment.deleteMany();
  await prisma.document.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.session.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
  await prisma.organization.deleteMany();

  // 2. Create only Super Admin
  console.log('Creating super admin...');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  await prisma.user.create({
    data: {
      email: 'admin@tuproperties.co.ke',
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+254700000001',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    },
  });

  // 3. Seed the 12 system roles with structured permissions (Module 1)
  await seedRoles(prisma);

  // 4. Seed demo organizations, users, and business data (Westhill + Rohi)
  await seedDemoData();

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
