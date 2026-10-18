import {
  PrismaClient,
  UserRole,
  InvoiceStatus,
  PaymentMethod,
  ReceiptType,
  ReceiptCategory,
  PaymentType,
  ReceiptTo,
  DRTOrDRF,
  TenantStatus,
  UnitStatus,
  AgreementStatus,
  AgreementType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Jedan Apartment configuration ──────────────────────────────────────────

const RENT_1B = 11500; // KES
const RENT_2B = 14500; // KES
const GARBAGE = 200; // KES per unit per month
const PAYMENT_DAY = 5; // Rent due by the 5th
const DEPOSIT_1B = RENT_1B; // One month rent
const DEPOSIT_2B = RENT_2B;

// 4 floors: A=Ground, B=1st, C=2nd, D=3rd
// 11 units per floor: 01-03 = 2BR (14,500), 04-11 = 1BR (11,500)
// Total: 44 units (12×2BR, 32×1BR)
const FLOORS = [
  { floor: 0, label: 'A' },
  { floor: 1, label: 'B' },
  { floor: 2, label: 'C' },
  { floor: 3, label: 'D' },
];

// Billing window: 18 months, April 2025 → October 2026
const WINDOW_START = new Date(2025, 3, 1); // April 2025
const WINDOW_END = new Date(2026, 9, 31); // October 2026

// Kenyan name pools (from KE jurisdiction profile)
const KE_FIRST_NAMES = [
  'John',
  'Mary',
  'Peter',
  'Sarah',
  'David',
  'Jane',
  'Michael',
  'Emma',
  'James',
  'Lisa',
  'Daniel',
  'Grace',
  'Joseph',
  'Ruth',
  'Samuel',
  'Elizabeth',
  'Paul',
  'Martha',
  'Andrew',
  'Hannah',
  'William',
  'Rebecca',
  'Thomas',
  'Rachel',
  'Charles',
  'Esther',
  'Robert',
  'Deborah',
  'George',
  'Miriam',
  'Mwangi',
  'Wanjiku',
  'Kamau',
  'Nyambura',
  'Njoroge',
  'Wambui',
  'Kariuki',
  'Njeri',
  'Gichuki',
  'Wangari',
  'Ochieng',
  'Akinyi',
  'Omondi',
  'Adhiambo',
  'Otieno',
  'Anyango',
  'Odinga',
  'Atieno',
  'Ouma',
  'Awuor',
];
const KE_LAST_NAMES = [
  'Mwangi',
  'Kamau',
  'Njoroge',
  'Kariuki',
  'Gichuki',
  'Wainaina',
  'Ngugi',
  'Mugo',
  'Kibet',
  'Kipchoge',
  'Ochieng',
  'Omondi',
  'Otieno',
  'Odinga',
  'Ouma',
  'Owino',
  'Okoth',
  'Onyango',
  'Odhiambo',
  'Oloo',
  'Kimani',
  'Ndungu',
  'Gatheru',
  'Macharia',
  'Maina',
  'Ndegwa',
  'Gichuhi',
  'Muriuki',
  'Mutiso',
  'Musyoka',
  'Smith',
  'Brown',
  'Johnson',
  'Williams',
  'Jones',
];

const KENYAN_PHONE_PREFIXES = [
  '700',
  '701',
  '702',
  '703',
  '704',
  '705',
  '706',
  '707',
  '708',
  '709',
  '710',
  '711',
  '712',
  '713',
  '714',
  '715',
  '716',
  '717',
  '718',
  '719',
  '720',
  '721',
  '722',
  '723',
  '724',
  '725',
  '726',
  '727',
  '728',
  '729',
  '740',
  '741',
  '742',
  '743',
  '744',
  '745',
  '746',
  '747',
  '748',
  '749',
  '750',
  '751',
  '752',
  '753',
  '754',
  '755',
  '756',
  '757',
  '758',
  '759',
  '790',
  '791',
  '792',
  '793',
  '794',
  '795',
  '796',
  '797',
  '798',
  '799',
];

const r = (n: number) => Math.floor(Math.random() * n);

const kraPin = (): string =>
  `A${Array.from({ length: 9 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.charAt(r(36))).join('')}${String.fromCharCode(65 + r(26))}`;

const kenyanPhone = (): string =>
  `+254${KENYAN_PHONE_PREFIXES[r(KENYAN_PHONE_PREFIXES.length)]}${String(r(1000000)).padStart(6, '0')}`;

const randomName = (): { firstName: string; lastName: string } => ({
  firstName: KE_FIRST_NAMES[r(KE_FIRST_NAMES.length)],
  lastName: KE_LAST_NAMES[r(KE_LAST_NAMES.length)],
});

const daysInMonth = (year: number, month: number): number =>
  new Date(year, month + 1, 0).getDate();

const monthLabel = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Generate all billing months in window (April 2025 → October 2026)
const billingMonths: Array<{ start: Date; end: Date; label: string }> = [];
const m = new Date(WINDOW_START);
while (m <= WINDOW_END) {
  const start = new Date(m.getFullYear(), m.getMonth(), 1);
  const end = new Date(m.getFullYear(), m.getMonth() + 1, 0);
  billingMonths.push({ start, end, label: monthLabel(m) });
  m.setMonth(m.getMonth() + 1);
}

// ── Tenancy generation ─────────────────────────────────────────────────────

type Tenancy = {
  moveIn: Date;
  moveOut: Date | null;
  tenant: { firstName: string; lastName: string };
};

const generateUnitTenancies = (unitCode: string): Tenancy[] => {
  // B06 is the user's unit: previous tenant Apr 2025–Apr 2026, vacant May–Jun 2026,
  // current tenant moved in July 19 2026.
  if (unitCode === 'JEDAN-B-06') {
    return [
      {
        moveIn: new Date(2025, 3, 1),
        moveOut: new Date(2026, 3, 30),
        tenant: randomName(),
      },
      {
        moveIn: new Date(2026, 6, 19),
        moveOut: null,
        tenant: randomName(),
      },
    ];
  }

  // All other units: mostly continuous tenancy, occasional turnover.
  const roll = r(100);
  const tenancies: Tenancy[] = [];

  if (roll < 70) {
    // Single continuous tenancy starting sometime in 2025
    const startMonth = r(9); // Apr–Dec 2025
    tenancies.push({
      moveIn: new Date(2025, 3 + startMonth, 1 + r(28)),
      moveOut: null,
      tenant: randomName(),
    });
  } else if (roll < 90) {
    // Two tenancies with a gap (turnover)
    const t1StartMonth = r(6); // Apr–Sep 2025
    const t1End = new Date(2025, 9 + r(4), 1 + r(28)); // Oct 2025–Jan 2026
    const gapStart = new Date(t1End.getTime() + 86400000);
    const t2Start = new Date(gapStart.getTime() + r(60) * 86400000);
    tenancies.push({
      moveIn: new Date(2025, 3 + t1StartMonth, 1 + r(28)),
      moveOut: t1End,
      tenant: randomName(),
    });
    tenancies.push({
      moveIn: t2Start > WINDOW_END ? WINDOW_END : t2Start,
      moveOut: null,
      tenant: randomName(),
    });
  } else {
    // Vacant for first half, occupied second half
    const start = new Date(2026, 0, 1 + r(28)); // Jan–Mar 2026
    tenancies.push({
      moveIn: start,
      moveOut: null,
      tenant: randomName(),
    });
  }

  return tenancies;
};

// ── Proration ──────────────────────────────────────────────────────────────

const proratedRent = (
  baseRent: number,
  moveIn: Date,
  monthStart: Date,
): number => {
  // B06 July 2026: exact figure user paid (deposit 11,500 + rent 4,480)
  const isB06July =
    moveIn.getFullYear() === 2026 &&
    moveIn.getMonth() === 6 &&
    moveIn.getDate() === 19 &&
    monthStart.getFullYear() === 2026 &&
    monthStart.getMonth() === 6;
  if (isB06July) return 4480;

  const dim = daysInMonth(monthStart.getFullYear(), monthStart.getMonth());
  const dailyRate = baseRent / dim;
  // Days from move-in to end of month (inclusive of move-in day)
  const daysRemaining = dim - moveIn.getDate() + 1;
  return Math.round(dailyRate * daysRemaining * 100) / 100;
};

// ── Payment behavior ───────────────────────────────────────────────────────

const rollPayment = (): {
  status: InvoiceStatus;
  paidFraction: number; // 0 to 1
  daysLate: number;
} => {
  const roll = r(100);
  if (roll < 90) {
    return { status: InvoiceStatus.PAID, paidFraction: 1, daysLate: r(5) }; // 0-4 days late (on time)
  }
  if (roll < 96) {
    return {
      status: InvoiceStatus.PARTIALLY_PAID,
      paidFraction: 0.5 + r(40) / 100,
      daysLate: 5 + r(10),
    };
  }
  if (roll < 99) {
    return { status: InvoiceStatus.PENDING, paidFraction: 0, daysLate: 0 };
  }
  return {
    status: InvoiceStatus.OVERDUE,
    paidFraction: 0,
    daysLate: 15 + r(30),
  };
};

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Jedan Apartments (immersive 18-month history)...');

  // ── 1. Clean existing Jedan-scoped data ────────────────────────────────
  const existingOrg = await prisma.organization.findFirst({
    where: { slug: 'jedan-apartments' },
  });

  if (existingOrg) {
    const orgId = existingOrg.id;
    await prisma.invoice.deleteMany({ where: { organizationId: orgId } });
    await prisma.payment.deleteMany({ where: { organizationId: orgId } });
    await prisma.receipt.deleteMany({ where: { organizationId: orgId } });
    await prisma.rentalAgreement.deleteMany({
      where: { organizationId: orgId },
    });
    await prisma.tenant.deleteMany({ where: { organizationId: orgId } });
    await prisma.unitServiceCharge.deleteMany({
      where: { unit: { property: { organizationId: orgId } } },
    });
    await prisma.unit.deleteMany({
      where: { property: { organizationId: orgId } },
    });
    await prisma.property.deleteMany({ where: { organizationId: orgId } });
    await prisma.landlord.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.roleAssignment.deleteMany({
      where: { user: { organizationId: orgId } },
    });
    await prisma.role.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
    console.log('Cleaned existing Jedan data.');
  }

  // ── 2. Organization ────────────────────────────────────────────────────
  console.log('Creating organization...');
  const organization = await prisma.organization.create({
    data: {
      name: 'Jedan Apartments',
      slug: 'jedan-apartments',
      subdomain: 'jedan',
      plan: 'STARTER',
      maxUsers: 10,
      maxProperties: 10,
      isActive: true,
      currency: 'KES',
      timezone: 'Africa/Nairobi',
      taxCountryCode: 'KE',
      taxRegionCode: null,
      defaultLocale: 'en-KE',
      weekendDays: [6, 7],
    },
  });

  await prisma.subscription.create({
    data: {
      organizationId: organization.id,
      plan: 'STARTER',
      enabledModules: [
        'properties',
        'properties/units',
        'tenants',
        'leases',
        'invoices',
        'payments',
        'receipts',
        'arrears',
      ],
    },
  });

  // ── 3. Landlord ────────────────────────────────────────────────────────
  console.log('Creating landlord...');
  const landlord = await prisma.landlord.create({
    data: {
      code: 'JEDAN-LL-001',
      name: 'Jedidah Adhiambo',
      email: 'jedidah.adhiambo@gmail.com',
      phone: '+254798056574',
      address: 'Kenya Israel - Machakos',
      city: 'Machakos',
      country: 'Kenya',
      postalCode: null,
      bankName: 'Standard Chartered',
      bankBranch: 'Machakos',
      accountName: 'Jedidah Adhiambo',
      accountNumber: '0100303043800',
      taxPin: kraPin(),
      vatRegistered: false,
      organizationId: organization.id,
    },
  });

  // ── 4. Property ────────────────────────────────────────────────────────
  console.log('Creating property...');
  const property = await prisma.property.create({
    data: {
      code: 'JEDAN-001',
      name: 'Jedan Apartment',
      estateArea: 'Kenya Israel',
      areaRegion: 'Machakos',
      country: 'Kenya',
      roadStreet: null,
      category: 'residential',
      type: 'apartment',
      specification: 'multi-unit',
      multiStoryType: 'low-rise',
      numberOfFloors: 4,
      lrNumber: null, // No plot number; schema field is optional
      notes:
        '4-storey residential apartment in Kenya Israel, Machakos. ' +
        '44 units across 4 floors (A–D), 11 units per floor: ' +
        '3×2-bedroom (KES 14,500) + 8×1-bedroom (KES 11,500) per floor. ' +
        'Garbage collection KES 200/unit/month included in rent invoice. ' +
        'Rent due by the 5th of each month.',
      landlordId: landlord.id,
      organizationId: organization.id,
    },
  });

  // ── 5. Property manager user ───────────────────────────────────────────
  console.log('Creating property manager user...');
  const passwordHash = await bcrypt.hash('Password123!', 10);
  await prisma.user.create({
    data: {
      email: 'manager@jedan-apartments.co.ke',
      firstName: 'Jedan',
      lastName: 'Manager',
      phone: kenyanPhone(),
      passwordHash,
      role: UserRole.PROPERTY_MANAGER,
      organizationId: organization.id,
      isActive: true,
      emailVerified: true,
    },
  });

  // ── 6. Units ───────────────────────────────────────────────────────────
  console.log('Creating units...');
  const units: Array<{
    id: string;
    code: string;
    name: string;
    bedrooms: number;
    baseRent: number;
    floor: number;
    floorLabel: string;
  }> = [];

  for (const floor of FLOORS) {
    for (let unitNum = 1; unitNum <= 11; unitNum++) {
      const bedrooms = unitNum <= 3 ? 2 : 1;
      const baseRent = unitNum <= 3 ? RENT_2B : RENT_1B;
      const code = `JEDAN-${floor.label}-${String(unitNum).padStart(2, '0')}`;
      const name = `Unit ${floor.label}-${String(unitNum).padStart(2, '0')}`;

      const unit = await prisma.unit.create({
        data: {
          code,
          name,
          propertyId: property.id,
          type: bedrooms === 2 ? 'two-bedroom' : 'one-bedroom',
          baseRent,
          currency: 'KES',
          floor: floor.floor,
          bedrooms,
          bathrooms: bedrooms,
          furnished: false,
          status: UnitStatus.OCCUPIED,
          apartmentNotes: `${bedrooms}-BR unit on ${floor.label} floor, unit #${unitNum}`,
        },
      });
      units.push({
        id: unit.id,
        code,
        name,
        bedrooms,
        baseRent,
        floor: floor.floor,
        floorLabel: floor.label,
      });
    }
  }
  console.log(`Created ${units.length} units`);

  // ── 7. Tenancies, tenants, deposits, agreements ────────────────────────
  console.log('Creating tenancies, tenants, deposits and leases...');

  type LeaseCtx = {
    unitId: string;
    unitCode: string;
    unitName: string;
    bedrooms: number;
    baseRent: number;
    tenantId: string;
    agreementId: string;
    moveIn: Date;
    moveOut: Date | null;
    deposit: number;
  };

  const leases: LeaseCtx[] = [];

  for (const unit of units) {
    const tenancies = generateUnitTenancies(unit.code);

    for (const tenancy of tenancies) {
      // Clamp move-in to window
      let moveIn = new Date(tenancy.moveIn);
      if (moveIn < WINDOW_START) moveIn = new Date(WINDOW_START);
      if (moveIn > WINDOW_END) continue;

      let moveOut: Date | null = tenancy.moveOut
        ? new Date(tenancy.moveOut)
        : null;
      if (moveOut && moveOut > WINDOW_END) moveOut = new Date(WINDOW_END);

      // Skip if entirely outside window
      if (moveOut && moveOut < WINDOW_START) continue;

      const tenant = await prisma.tenant.create({
        data: {
          accountNumber: `JEDAN-TEN-${String(r(999999) + 1).padStart(6, '0')}`,
          code: `JEDAN-T${String(r(99999) + 1).padStart(5, '0')}`,
          tenantType: 'Individual',
          surname: tenancy.tenant.lastName,
          otherNames: tenancy.tenant.firstName,
          email: `${tenancy.tenant.firstName.toLowerCase()}.${tenancy.tenant.lastName.toLowerCase()}@gmail.com`,
          phone: kenyanPhone(),
          town: 'Machakos',
          status: moveOut ? TenantStatus.INACTIVE : TenantStatus.ACTIVE,
          idNoRegNo: kraPin(),
          taxPin: kraPin(),
          postalAddress: `PO Box ${r(99999) + 1}, Machakos`,
          postalCode: null,
          country: 'Kenya',
          organizationId: organization.id,
        },
      });

      const deposit = unit.bedrooms === 2 ? DEPOSIT_2B : DEPOSIT_1B;

      // Determine agreement end date
      let agreementEnd: Date | null = null;
      let termMonths: number | null = null;
      if (moveOut) {
        agreementEnd = moveOut;
        const diffMs = moveOut.getTime() - moveIn.getTime();
        termMonths = Math.max(
          1,
          Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)),
        );
      } else {
        // Open-ended; set end to end of window + 1 year
        agreementEnd = new Date(2027, 9, 31);
        termMonths = 12;
      }

      const agreement = await prisma.rentalAgreement.create({
        data: {
          code: `JEDAN-RA-${String(r(999999) + 1).padStart(6, '0')}`,
          unitId: unit.id,
          tenantId: tenant.id,
          agreementType: AgreementType.RENTAL,
          startDate: moveIn,
          endDate: agreementEnd,
          termMonths,
          rentAmount: unit.baseRent,
          currency: 'KES',
          paymentDay: PAYMENT_DAY,
          securityDeposit: deposit,
          noticePeriodDays: 30,
          status: moveOut ? AgreementStatus.TERMINATED : AgreementStatus.ACTIVE,
          organizationId: organization.id,
        },
      });

      leases.push({
        unitId: unit.id,
        unitCode: unit.code,
        unitName: unit.name,
        bedrooms: unit.bedrooms,
        baseRent: unit.baseRent,
        tenantId: tenant.id,
        agreementId: agreement.id,
        moveIn,
        moveOut,
        deposit,
      });
    }
  }
  console.log(`Created ${leases.length} leases across ${units.length} units`);

  // ── 8. Invoices, payments, receipts (18 months) ────────────────────────
  console.log('Generating 18 months of invoices, payments and receipts...');

  let invoiceCount = 0;
  let paymentCount = 0;
  let receiptCount = 0;

  for (const lease of leases) {
    for (const bm of billingMonths) {
      // Is this unit occupied during this billing month?
      const monthStart = bm.start;
      const monthEnd = bm.end;
      const leaseStart = lease.moveIn;
      const leaseEnd = lease.moveOut;

      // Occupancy check: lease overlaps this month
      const occupiesMonth =
        leaseStart <= monthEnd && (!leaseEnd || leaseEnd >= monthStart);

      if (!occupiesMonth) continue;

      // First month: prorate rent if move-in is after month start
      const isFirstMonth =
        leaseStart.getFullYear() === monthStart.getFullYear() &&
        leaseStart.getMonth() === monthStart.getMonth();

      const rentAmount =
        isFirstMonth && leaseStart.getDate() > 1
          ? proratedRent(lease.baseRent, leaseStart, monthStart)
          : lease.baseRent;

      const totalAmount = rentAmount + GARBAGE;

      // Due date: 5th of the month
      const dueDate = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth(),
        PAYMENT_DAY,
      );

      // Determine payment behavior
      const now = new Date();
      const billMonthDate = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth(),
        1,
      );
      const isFuture = billMonthDate > now;
      const isCurrent =
        billMonthDate.getFullYear() === now.getFullYear() &&
        billMonthDate.getMonth() === now.getMonth();

      let paymentResult: {
        status: InvoiceStatus;
        paidFraction: number;
        daysLate: number;
      };
      if (isFuture) {
        // Future month: invoice issued but not due yet
        paymentResult = {
          status: InvoiceStatus.PENDING,
          paidFraction: 0,
          daysLate: 0,
        };
      } else if (isCurrent && now.getDate() < PAYMENT_DAY) {
        // Current month, before due date: pending
        paymentResult = {
          status: InvoiceStatus.PENDING,
          paidFraction: 0,
          daysLate: 0,
        };
      } else {
        paymentResult = rollPayment();
      }

      const paidAmount =
        Math.round(totalAmount * paymentResult.paidFraction * 100) / 100;
      const balanceAmount = Math.round((totalAmount - paidAmount) * 100) / 100;

      // Invoice dates
      const issueDate = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth(),
        1,
      );
      let paymentDate: Date | null = null;
      if (
        paymentResult.status === InvoiceStatus.PAID ||
        paymentResult.status === InvoiceStatus.PARTIALLY_PAID
      ) {
        const daysOffset =
          paymentResult.daysLate > 0
            ? PAYMENT_DAY + paymentResult.daysLate
            : r(5);
        paymentDate = new Date(
          monthStart.getFullYear(),
          monthStart.getMonth(),
          Math.min(daysOffset, 28),
        );
      }

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-JEDAN-${bm.label}-${lease.unitCode.replace('JEDAN-', '').replace('-', '')}-${invoiceCount}`,
          rentalAgreementId: lease.agreementId,
          issueDate,
          dueDate,
          amount: totalAmount,
          totalAmount,
          paidAmount,
          balanceAmount,
          currency: 'KES',
          transactionClass: 'RENT',
          billingPeriod: bm.label,
          status: isFuture ? InvoiceStatus.PENDING : paymentResult.status,
          organizationId: organization.id,
          invoiceItems: {
            create: [
              {
                description: `Rent — ${lease.unitName} (${lease.bedrooms}BR)`,
                quantity: 1,
                unitPrice: rentAmount,
                amount: rentAmount,
                revenueExpenseItem: 'RENT',
              },
              {
                description: 'Garbage Collection',
                quantity: 1,
                unitPrice: GARBAGE,
                amount: GARBAGE,
                revenueExpenseItem: 'GARBAGE',
              },
            ],
          },
        },
      });
      invoiceCount++;

      if (paidAmount > 0 && paymentDate) {
        const paymentMethod =
          r(100) < 70 ? PaymentMethod.MPESA : PaymentMethod.BANK_TRANSFER;
        const payment = await prisma.payment.create({
          data: {
            rentalAgreementId: lease.agreementId,
            invoiceId: invoice.id,
            paymentDate,
            amount: paidAmount,
            currency: 'KES',
            paymentMethod,
            paymentReference:
              paymentMethod === PaymentMethod.MPESA
                ? `MPESA-${String(r(999999)).padStart(6, '0')}`
                : `REF-${String(r(99999999)).padStart(8, '0')}`,
            payee: `${lease.unitName} tenant`,
            paidFrom:
              paymentMethod === PaymentMethod.MPESA
                ? 'M-PESA'
                : 'Bank Transfer',
            paidTo: 'Jedan Apartments Operating Account',
            paymentType: PaymentType.ApplyToBill,
            recordedBy: 'Jedidah Adhiambo',
            organizationId: organization.id,
          },
        });
        paymentCount++;

        await prisma.receipt.create({
          data: {
            receiptId: `REC-JEDAN-${bm.label}-${lease.unitCode.replace('JEDAN-', '').replace('-', '')}-${receiptCount}`,
            receiptType: ReceiptType.ApplyToInvoice,
            receiptCategory: ReceiptCategory.Rent,
            receivedFrom: `${lease.unitName} tenant`,
            paymentMethod,
            recordingDate: paymentDate,
            amountReceived: paidAmount,
            currency: 'KES',
            tenantId: lease.tenantId,
            landlordId: landlord.id,
            receiptTo: ReceiptTo.Landlord,
            drtOrDrf: DRTOrDRF.DirectReceipt,
            recordedBy: 'Jedidah Adhiambo',
            payments: { connect: { id: payment.id } },
            organizationId: organization.id,
          },
        });
        receiptCount++;
      }
    }
  }

  console.log(
    `Generated ${invoiceCount} invoices, ${paymentCount} payments, ${receiptCount} receipts`,
  );

  console.log(
    `Jedan Apartments seeded: ${units.length} units (12×2BR @ KES ${RENT_2B}, 32×1BR @ KES ${RENT_1B}), ` +
      `${leases.length} leases, ${billingMonths.length} billing months (Apr 2025–Oct 2026), ` +
      `${invoiceCount} invoices. Rent due by the ${PAYMENT_DAY}th. Garbage: KES ${GARBAGE}/unit/month.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
