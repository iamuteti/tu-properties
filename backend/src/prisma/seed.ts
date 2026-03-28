import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { generateDemoData } from './demo-data';

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
  await prisma.invoice.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.tenantEmergencyContact.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.unitFeature.deleteMany();
  await prisma.unitMeterNumber.deleteMany();
  await prisma.unitServiceCharge.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.propertySecurityDeposit.deleteMany();
  await prisma.propertyStandingCharge.deleteMany();
  await prisma.property.deleteMany();
  await prisma.landlord.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  // 2. Create only Super Admin
  console.log('Creating super admin...');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  await prisma.user.create({
    data: {
      email: 'admin@tuhame.co.ke',
      firstName: 'Super',
      lastName: 'Admin',
      phone: '+254700000001',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
    },
  });

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
