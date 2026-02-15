import { PrismaClient, UserRole, UnitStatus, LeaseStatus, InvoiceStatus, PaymentMethod, Unit } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Seeding database...');

    // 1. Clean the database
    console.log('Cleaning database...');
    await prisma.auditLog.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.invoiceItem.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.lease.deleteMany();
    await prisma.tenantEmergencyContact.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.unitFeature.deleteMany();
    await prisma.unitMeterNumber.deleteMany();
    await prisma.unitServiceCharge.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.unitType.deleteMany();
    await prisma.propertySecurityDeposit.deleteMany();
    await prisma.propertyStandingCharge.deleteMany();
    await prisma.property.deleteMany();
    await prisma.propertyType.deleteMany();
    await prisma.propertyCategory.deleteMany();
    await prisma.landlord.deleteMany();
    await prisma.user.deleteMany();

    // 2. Create Users
    console.log('Creating users...');
    const passwordHash = await bcrypt.hash('Password123!', 10);

    const admin = await prisma.user.create({
        data: {
            email: 'admin@tuhame.co.ke',
            firstName: 'Super',
            lastName: 'Admin',
            phone: '+254700000001',
            passwordHash,
            role: UserRole.SUPER_ADMIN,
        },
    });

    const manager = await prisma.user.create({
        data: {
            email: 'manager@tuhame.co.ke',
            firstName: 'Property',
            lastName: 'Manager',
            phone: '+254700000002',
            passwordHash,
            role: UserRole.PROPERTY_MANAGER,
        },
    });

    const accountant = await prisma.user.create({
        data: {
            email: 'accountant@tuhame.co.ke',
            firstName: 'Finance',
            lastName: 'Accountant',
            phone: '+254700000003',
            passwordHash,
            role: UserRole.ACCOUNTANT,
        },
    });

    // 3. Create Landlords
    console.log('Creating landlords...');
    const landlords = await Promise.all([
        prisma.landlord.create({
            data: {
                code: 'LL001',
                name: 'James Mwangi',
                email: 'james.mwangi@example.co.ke',
                phone: '+254711222333',
                address: 'Kilimani, Nairobi',
                bankName: 'Equity Bank',
                accountNumber: '1234567890',
            },
        }),
        prisma.landlord.create({
            data: {
                code: 'LL002',
                name: 'Sarah Chen',
                email: 'sarah.chen@example.co.ke',
                phone: '+254722333444',
                address: 'Westlands, Nairobi',
                bankName: 'KCB Bank',
                accountNumber: '0987654321',
            },
        }),
    ]);

    // 4. Property Categories & Types
    const categories = await Promise.all([
        prisma.propertyCategory.create({ data: { name: 'Residential', code: 'RES' } }),
        prisma.propertyCategory.create({ data: { name: 'Commercial', code: 'COM' } }),
    ]);

    const pTypes = await Promise.all([
        prisma.propertyType.create({ data: { name: 'Apartment', code: 'APT' } }),
        prisma.propertyType.create({ data: { name: 'Office Block', code: 'OFF' } }),
        prisma.propertyType.create({ data: { name: 'Townhouse', code: 'TWN' } }),
    ]);

    // 5. Create Properties
    console.log('Creating properties...');
    const properties = await Promise.all([
        prisma.property.create({
            data: {
                code: 'PROP-001',
                name: 'Riverside Heights',
                estateArea: 'Riverside',
                country: 'Kenya',
                landlordId: landlords[0].id,
                categoryId: categories[0].id,
                propertyTypeId: pTypes[0].id,
                mpesaPropertyPayNumber: '543210',
            },
        }),
        prisma.property.create({
            data: {
                code: 'PROP-002',
                name: 'Westlands Plaza',
                estateArea: 'Westlands',
                country: 'Kenya',
                landlordId: landlords[1].id,
                categoryId: categories[1].id,
                propertyTypeId: pTypes[1].id,
                mpesaPropertyPayNumber: '123456',
            },
        }),
    ]);

    // 6. Unit Types
    const uTypes = await Promise.all([
        prisma.unitType.create({ data: { name: 'Two Bedroom' } }),
        prisma.unitType.create({ data: { name: 'One Bedroom' } }),
        prisma.unitType.create({ data: { name: 'Studio' } }),
        prisma.unitType.create({ data: { name: 'Executive Suite' } }),
    ]);

    // 7. Create Units
    console.log('Creating units...');
    const units: Unit[] = [];
    // Property 1 Units (Riverside)
    for (let i = 1; i <= 5; i++) {
        const unit = await prisma.unit.create({
            data: {
                code: `RIV-${100 + i}`,
                name: `Apartment ${100 + i}`,
                propertyId: properties[0].id,
                unitTypeId: uTypes[i % 3].id,
                baseRent: 50000 + i * 5000,
                status: i < 4 ? UnitStatus.OCCUPIED : UnitStatus.VACANT,
            },
        });
        units.push(unit);
    }

    // Property 2 Units (Westlands)
    for (let i = 1; i <= 3; i++) {
        const unit = await prisma.unit.create({
            data: {
                code: `WP-${i}F`,
                name: `Floor ${i}`,
                propertyId: properties[1].id,
                unitTypeId: uTypes[3].id,
                baseRent: 200000 + i * 20000,
                status: i === 1 ? UnitStatus.OCCUPIED : UnitStatus.VACANT,
            },
        });
        units.push(unit);
    }

    // 8. Create Tenants
    console.log('Creating tenants...');
    const tenants = await Promise.all([
        prisma.tenant.create({
            data: {
                accountNumber: 'TEN-001',
                code: 'T001',
                surname: 'Doe',
                otherNames: 'John',
                email: 'john.doe@example.co.ke',
                phone: '+254799000111',
            },
        }),
        prisma.tenant.create({
            data: {
                accountNumber: 'TEN-002',
                code: 'T002',
                surname: 'Smith',
                otherNames: 'Mary',
                email: 'mary.smith@example.co.ke',
                phone: '+254799000222',
            },
        }),
        prisma.tenant.create({
            data: {
                accountNumber: 'TEN-003',
                code: 'T003',
                surname: 'Kamau',
                otherNames: 'Peter',
                email: 'peter.kamau@example.co.ke',
                phone: '+254799000333',
            },
        }),
    ]);

    // 9. Create Leases, Invoices, Payments
    console.log('Creating leases, invoices and payments...');

    // Create an active lease for Tenant 1
    const lease1 = await prisma.lease.create({
        data: {
            code: 'L-001',
            unitId: units[0].id,
            tenantId: tenants[0].id,
            startDate: new Date('2024-01-01'),
            rentAmount: units[0].baseRent!,
            status: LeaseStatus.ACTIVE,
        },
    });

    // Create an invoice for Lease 1
    const inv1 = await prisma.invoice.create({
        data: {
            invoiceNumber: 'INV-2024-001',
            leaseId: lease1.id,
            dueDate: new Date('2024-01-05'),
            amount: units[0].baseRent!,
            totalAmount: units[0].baseRent!,
            balanceAmount: 0,
            paidAmount: units[0].baseRent!,
            status: InvoiceStatus.PAID,
        },
    });

    // Create a payment for Invoice 1
    await prisma.payment.create({
        data: {
            receiptNumber: 'REC-001',
            leaseId: lease1.id,
            invoiceId: inv1.id,
            amount: units[0].baseRent!,
            paymentMethod: PaymentMethod.MPESA,
            paymentReference: 'RBT98V7W6X',
        },
    });

    // Create a pending invoice for Lease 1 (current month)
    await prisma.invoice.create({
        data: {
            invoiceNumber: 'INV-2024-002',
            leaseId: lease1.id,
            dueDate: new Date('2025-02-05'),
            amount: units[0].baseRent!,
            totalAmount: units[0].baseRent!,
            balanceAmount: units[0].baseRent!,
            paidAmount: 0,
            status: InvoiceStatus.PENDING,
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