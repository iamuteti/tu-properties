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

    // 1. Clean the database
    console.log('Cleaning database...');
    await prisma.payment.deleteMany();
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

    // 2. Create default Organization (Westhill Properties - for basic testing)
    console.log('Creating organizations...');
    const defaultOrg = await prisma.organization.create({
        data: {
            name: 'Westhill Properties',
            slug: 'westhill-properties',
            subdomain: 'demo',
            plan: 'PROFESSIONAL',
            maxUsers: 10,
            maxProperties: 100,
            isActive: true,
        },
    });

    // 3. Create Rohi Estate Management Organization (for demo data)
    const rohiOrg = await prisma.organization.create({
        data: {
            name: 'Rohi Estate Management',
            slug: 'rohi-estate-management',
            subdomain: 'rohi',
            plan: 'ENTERPRISE',
            maxUsers: 50,
            maxProperties: 500,
            isActive: true,
        },
    });

    // 4. Create Users
    console.log('Creating users...');
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Super Admin (no organization)
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

    // Admin for Westhill Properties
    await prisma.user.create({
        data: {
            email: 'admin@westhill.co.ke',
            firstName: 'Westhill',
            lastName: 'Admin',
            phone: '+254700000002',
            passwordHash,
            role: UserRole.ADMIN,
            organizationId: defaultOrg.id,
        },
    });

    // Property Manager for Westhill Properties
    await prisma.user.create({
        data: {
            email: 'manager@westhill.co.ke',
            firstName: 'Property',
            lastName: 'Manager',
            phone: '+254700000003',
            passwordHash,
            role: UserRole.PROPERTY_MANAGER,
            organizationId: defaultOrg.id,
        },
    });

    // Accountant for Westhill Properties
    await prisma.user.create({
        data: {
            email: 'accountant@westhill.co.ke',
            firstName: 'Finance',
            lastName: 'Accountant',
            phone: '+254700000004',
            passwordHash,
            role: UserRole.ACCOUNTANT,
            organizationId: defaultOrg.id,
        },
    });

    // Admin for Rohi Estate Management
    await prisma.user.create({
        data: {
            email: 'admin@rohi.co.ke',
            firstName: 'Rohi',
            lastName: 'Admin',
            phone: '+254700000005',
            passwordHash,
            role: UserRole.ADMIN,
            organizationId: rohiOrg.id,
        },
    });

    // 5. Generate demo data for Rohi Estate Management
    await generateDemoData(prisma, rohiOrg.id);

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
