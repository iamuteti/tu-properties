import {
  PrismaClient,
  InvoiceStatus,
  PaymentMethod,
  ReceiptType,
  ReceiptCategory,
  PaymentType,
  ReceiptTo,
  DRTOrDRF,
  Landlord,
  Property,
  Unit,
  Tenant,
  TenantStatus,
  RentalAgreement,
  UnitStatus,
  AgreementStatus,
  AgreementType,
  Invoice,
  UserRole,
  ManagementFeeType,
  ChargeCategory,
  OwnerStatementStatus,
  PayoutStatus,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import {
  PROPERTY_CATEGORIES,
  PROPERTY_TYPES,
  UNIT_TYPES,
} from '@/common/contants';
import { seedRoles } from './roles-seed';

dotenv.config();

// Generate random string
const randomString = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Generate random phone number
const randomPhone = (): string => {
  return `+254${Math.floor(Math.random() * 900000000) + 100000000}`;
};

// Generate random email
const randomEmail = (name: string): string => {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'example.co.ke'];
  return `${name.toLowerCase().replace(/\s+/g, '.')}@${domains[Math.floor(Math.random() * domains.length)]}`;
};

// Kenyan names for more realistic data
const kenyanFirstNames = [
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
  'Edward',
  'Sarah',
  'Henry',
  'Naomi',
  'Walter',
  'Abigail',
  'Arthur',
  'Lydia',
  'Harold',
  'Anna',
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

const kenyanLastNames = [
  'Smith',
  'Brown',
  'Johnson',
  'Williams',
  'Jones',
  'Garcia',
  'Miller',
  'Davis',
  'Rodriguez',
  'Martinez',
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
];

// Generate random name
const randomName = (): string => {
  return `${kenyanFirstNames[Math.floor(Math.random() * kenyanFirstNames.length)]} ${kenyanLastNames[Math.floor(Math.random() * kenyanLastNames.length)]}`;
};

// Generate random address
const randomAddress = (): string => {
  const streets = [
    'Main St',
    'First Ave',
    'Park Rd',
    'High St',
    'Oak St',
    'Kenyatta Ave',
    'Moi Ave',
    'Uhuru Hwy',
  ];
  const cities = [
    'Nairobi',
    'Mombasa',
    'Kisumu',
    'Nakuru',
    'Eldoret',
    'Thika',
    'Malindi',
    'Kitale',
  ];
  return `${Math.floor(Math.random() * 1000) + 1} ${streets[Math.floor(Math.random() * streets.length)]}, ${cities[Math.floor(Math.random() * cities.length)]}`;
};

// Property names for more realistic data
const propertyPrefixes = [
  'Riverside',
  'Westlands',
  'Kilimani',
  'Lavington',
  'Karen',
  'Langata',
  'Kileleshwa',
  'Parklands',
  'Spring Valley',
  'Muthaiga',
  'Runda',
  'Gigiri',
  'Rosslyn',
  'Loresho',
  'Mountain View',
  'Embakasi',
  'South B',
  'South C',
  'Eastleigh',
  'Westlands',
  'Industrial Area',
  'CBD',
  'Upper Hill',
  'Nairobi West',
];

const propertySuffixes = [
  'Heights',
  'Plaza',
  'Gardens',
  'Towers',
  'Mall',
  'Complex',
  'Court',
  'Terrace',
  'Villas',
  'Apartments',
  'Suites',
  'Residence',
  'House',
  'Mansion',
  'Estate',
  'Village',
  'Cottage',
  'Manor',
  'Lodge',
  'Studio',
];

// Generate random property name
const randomPropertyName = (index: number): string => {
  const prefix =
    propertyPrefixes[Math.floor(Math.random() * propertyPrefixes.length)];
  const suffix =
    propertySuffixes[Math.floor(Math.random() * propertySuffixes.length)];
  return `${prefix} ${suffix} ${index}`;
};

// Generate demo data for Rohi Estate Management
export async function generateDemoData(
  prisma: PrismaClient,
  organizationId: string,
) {
  console.log('Generating demo data for Rohi Estate Management...');
  const orgPrefix = 'ROHI';

  // ========== Landlords (120 landlords) ==========
  console.log('Generating landlords...');
  const landlords: Landlord[] = [];
  for (let i = 1; i <= 120; i++) {
    const name = randomName();
    const landlord = await prisma.landlord.create({
      data: {
        code: `${orgPrefix}-LL${String(i).padStart(3, '0')}`,
        name,
        email: randomEmail(name),
        phone: randomPhone(),
        address: randomAddress(),
        bankName: [
          'Equity Bank',
          'KCB Bank',
          'Co-op Bank',
          'Absa Bank',
          'Standard Chartered',
          'NCBA Bank',
          'I&M Bank',
          'Stanbic Bank',
        ][Math.floor(Math.random() * 8)],
        bankBranch: [
          'Nairobi CBD',
          'Westlands',
          'Kilimani',
          'Mombasa Rd',
          'Thika Rd',
          'Junction',
          'Sarit Centre',
        ][Math.floor(Math.random() * 7)],
        accountNumber: String(Math.floor(Math.random() * 10000000000)),
        accountName: name,
        taxPin: `A${randomString(9)}`,
        vatRegistered: Math.random() > 0.7,
        organizationId,
      },
    });
    landlords.push(landlord);
  }
  console.log(`Generated ${landlords.length} landlords`);

  // ========== Properties (100 properties - 90% residential, 10% commercial) ==========
  console.log('Generating properties...');
  const properties: Property[] = [];
  for (let i = 1; i <= 100; i++) {
    const landlord = landlords[Math.floor(Math.random() * landlords.length)];

    // 90% residential, 10% commercial
    const isResidential = Math.random() < 0.9;
    const category = isResidential
      ? PROPERTY_CATEGORIES.find((c) => c.value === 'residential')!
      : PROPERTY_CATEGORIES[Math.floor(Math.random() * 4) + 1]; // Commercial, Industrial, Retail, Office

    // Select property type based on category
    let propertyType;
    if (isResidential) {
      // Residential: Apartment, House, Condo, Townhouse, Studio
      const residentialTypes = PROPERTY_TYPES.filter((t) =>
        ['apartment', 'house', 'condo', 'townhouse', 'studio'].includes(
          t.value,
        ),
      );
      propertyType =
        residentialTypes[Math.floor(Math.random() * residentialTypes.length)];
    } else {
      // Commercial: Warehouse, Factory, Storefront, Office Space, Retail Space
      const commercialTypes = PROPERTY_TYPES.filter((t) =>
        [
          'warehouse',
          'factory',
          'storefront',
          'office-space',
          'retail-space',
        ].includes(t.value),
      );
      propertyType =
        commercialTypes[Math.floor(Math.random() * commercialTypes.length)];
    }

    const property = await prisma.property.create({
      data: {
        code: `${orgPrefix}-PROP-${String(i).padStart(3, '0')}`,
        name: randomPropertyName(i),
        estateArea:
          propertyPrefixes[Math.floor(Math.random() * propertyPrefixes.length)],
        country: 'Kenya',
        landlordId: landlord.id,
        category: category.value,
        type: propertyType.value,
        mpesaPropertyPayNumber: String(Math.floor(Math.random() * 1000000)),
        organizationId,
      },
    });
    properties.push(property);
  }
  console.log(`Generated ${properties.length} properties`);

  // ========== Units (1500+ units) ==========
  console.log('Generating units...');
  const units: Unit[] = [];
  for (const property of properties) {
    // Determine number of units per property
    const unitsPerProperty = Math.floor(Math.random() * 30) + 10; // 10-40 units

    for (let i = 1; i <= unitsPerProperty; i++) {
      // Determine base rent and unit type based on property category
      let baseRent: number;
      let unitType;

      if (property.category === 'residential') {
        // Residential unit types
        const residentialTypes = UNIT_TYPES.filter((t) =>
          ['two-bedroom', 'one-bedroom', 'studio', 'executive-suite'].includes(
            t.value,
          ),
        );
        unitType =
          residentialTypes[Math.floor(Math.random() * residentialTypes.length)];

        switch (unitType.value) {
          case 'studio':
            baseRent = Math.floor(Math.random() * 30000) + 15000; // 15k-45k
            break;
          case 'one-bedroom':
            baseRent = Math.floor(Math.random() * 50000) + 25000; // 25k-75k
            break;
          case 'two-bedroom':
            baseRent = Math.floor(Math.random() * 80000) + 40000; // 40k-120k
            break;
          case 'executive-suite':
            baseRent = Math.floor(Math.random() * 200000) + 100000; // 100k-300k
            break;
          default:
            baseRent = Math.floor(Math.random() * 50000) + 20000;
        }
      } else {
        // Commercial unit types
        const commercialTypes = UNIT_TYPES.filter((t) =>
          ['commercial-space', 'warehouse', 'office', 'retail'].includes(
            t.value,
          ),
        );
        unitType =
          commercialTypes[Math.floor(Math.random() * commercialTypes.length)];

        switch (unitType.value) {
          case 'office':
            baseRent = Math.floor(Math.random() * 300000) + 50000; // 50k-350k
            break;
          case 'commercial-space':
            baseRent = Math.floor(Math.random() * 200000) + 30000; // 30k-230k
            break;
          case 'retail':
            baseRent = Math.floor(Math.random() * 150000) + 40000; // 40k-190k
            break;
          case 'warehouse':
            baseRent = Math.floor(Math.random() * 500000) + 100000; // 100k-600k
            break;
          default:
            baseRent = Math.floor(Math.random() * 100000) + 30000;
        }
      }

      const unit = await prisma.unit.create({
        data: {
          code: `${property.code}-${String(i).padStart(3, '0')}`,
          name: `Unit ${i}`,
          propertyId: property.id,
          type: unitType.value,
          baseRent,
          status: UnitStatus.VACANT, // Will be updated based on rental agreement
        },
      });
      units.push(unit);
    }
  }
  console.log(`Generated ${units.length} units`);

  // ========== Mark some units as occupied for demo ==========
  // We DON'T set them to OCCUPIED here - we set status AFTER creating rental agreements
  // to ensure consistency. For now, keep them as VACANT.
  const occupiedUnits = units.slice(0, Math.floor(units.length * 0.75)); // 75% will be occupied

  const tenants: Tenant[] = [];

  for (let i = 1; i <= occupiedUnits.length; i++) {
    const name = randomName();
    const tenant = await prisma.tenant.create({
      data: {
        accountNumber: `${orgPrefix}-TEN-${String(i).padStart(4, '0')}`,
        code: `${orgPrefix}-T${String(i).padStart(4, '0')}`,
        surname: name.split(' ')[1],
        otherNames: name.split(' ')[0],
        email: randomEmail(name),
        phone: randomPhone(),
        town: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'][
          Math.floor(Math.random() * 5)
        ],
        status: TenantStatus.ACTIVE,
        organizationId,
      },
    });
    tenants.push(tenant);
  }
  console.log(`Generated ${tenants.length} tenants`);

  // ========== Rental Agreements (all occupied units get agreements) ==========
  console.log('Generating rental agreements...');
  const rentalAgreements: (RentalAgreement & { tenant: Tenant; unit: Unit })[] =
    [];
  let agreementIndex = 0;

  for (let i = 0; i < occupiedUnits.length; i++) {
    const unit = occupiedUnits[i];
    const property = properties.find((p) => p.id === unit.propertyId)!;

    // Determine agreement type based on property category
    const isResidential = property.category === 'residential';
    const agreementType = isResidential
      ? AgreementType.RENTAL
      : AgreementType.LEASE;

    const tenant = tenants[i];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 365));

    // For leases (commercial), set a fixed end date; for rentals (residential), endDate is null (monthly)
    let endDate: Date | null = null;
    let termMonths: number | null = null;
    let securityDeposit: number | null = null;

    if (agreementType === AgreementType.LEASE) {
      // Commercial lease: 1-3 year term
      const years = Math.floor(Math.random() * 3) + 1;
      endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + years);
      termMonths = years * 12;

      // 90% of leases have security deposits
      if (Math.random() < 0.9) {
        securityDeposit = Number(unit.baseRent) * 2;
      }
    } else {
      // Residential rental: monthly by default, but half get a 6-12 month term.
      // A fixed term keeps the renewal path (and the expiry-reminder list)
      // demonstrable, while rolling monthlies stay represented.
      if (Math.random() < 0.5) {
        const months = Math.floor(Math.random() * 7) + 6;
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + months);
        termMonths = months;
        securityDeposit = Number(unit.baseRent);
      } else if (Math.random() < 0.3) {
        securityDeposit = Number(unit.baseRent);
      }
    }

    const rentalAgreement = await prisma.rentalAgreement.create({
      data: {
        code: `${orgPrefix}-RA-${String(agreementIndex + 1).padStart(4, '0')}`,
        unitId: unit.id,
        tenantId: tenant.id,
        agreementType,
        startDate,
        endDate,
        termMonths,
        rentAmount: Number(unit.baseRent),
        currency: 'KES',
        paymentDay: 1,
        securityDeposit,
        // A standard notice period on every tenancy, so the portal's
        // early-notice flag on a move-out request has something to compare to.
        noticePeriodDays: 30,
        status:
          endDate && endDate < new Date()
            ? AgreementStatus.EXPIRED
            : AgreementStatus.ACTIVE,
        organizationId,
      },
    });

    // Update unit status based on rental agreement status
    const unitStatus =
      endDate && endDate < new Date() ? UnitStatus.VACANT : UnitStatus.OCCUPIED;
    await prisma.unit.update({
      where: { id: unit.id },
      data: { status: unitStatus },
    });

    rentalAgreements.push({ ...rentalAgreement, tenant, unit });
    agreementIndex++;
  }
  console.log(`Generated ${rentalAgreements.length} rental agreements`);

  // ========== Invoices, Payments, and Receipts (for all occupied units) ==========
  console.log('Generating invoices, payments, and receipts...');
  const months = 9; // 9 months of data
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - months * 30);

  let invoiceCount = 0;
  let paymentCount = 0;
  let receiptCount = 0;

  // Create invoices for all occupied units (tenants with rental agreements)
  for (let i = 0; i < occupiedUnits.length; i++) {
    const unit = occupiedUnits[i];
    const property = properties.find((p) => p.id === unit.propertyId)!;
    const tenant = tenants[i]; // Each occupied unit has a corresponding tenant

    // Find the rental agreement for this unit
    const rentalAgreement = rentalAgreements.find(
      (ra) => ra.unit.id === unit.id,
    );
    const rentalAgreementId = rentalAgreement ? rentalAgreement.id : null;

    for (let month = 0; month < months; month++) {
      const invoiceDate = new Date(startDate);
      invoiceDate.setDate(invoiceDate.getDate() + month * 30);

      // Skip some months randomly (10% chance)
      if (Math.random() < 0.1) continue;

      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + 5); // Due 5 days after invoice

      // Determine payment status
      const isPaid = Math.random() > 0.15; // 85% paid
      const isPartial = !isPaid && Math.random() > 0.5; // 50% of unpaid are partially paid

      const paidAmount = isPaid
        ? Number(unit.baseRent)
        : isPartial
          ? Math.floor(Number(unit.baseRent) * Math.random() * 0.8)
          : 0;
      const balanceAmount = Number(unit.baseRent) - paidAmount;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${invoiceCount}${randomString(4)}`,
          rentalAgreementId,
          issueDate: invoiceDate,
          dueDate,
          amount: Number(unit.baseRent),
          totalAmount: Number(unit.baseRent),
          balanceAmount,
          paidAmount,
          status: isPaid
            ? InvoiceStatus.PAID
            : isPartial
              ? InvoiceStatus.PARTIALLY_PAID
              : InvoiceStatus.PENDING,
          organizationId,
        },
      });
      invoiceCount++;

      // Create payment if invoice is paid or partially paid
      if (paidAmount > 0) {
        const paymentDate = new Date(invoiceDate);
        paymentDate.setDate(
          paymentDate.getDate() + Math.floor(Math.random() * 10) + 1,
        ); // Payment 1-10 days after invoice

        const paymentMethod =
          Object.values(PaymentMethod)[
            Math.floor(Math.random() * Object.values(PaymentMethod).length)
          ];

        const payment = await prisma.payment.create({
          data: {
            rentalAgreementId,
            invoiceId: invoice.id,
            paymentDate,
            amount: paidAmount,
            currency: 'KES',
            paymentMethod,
            paymentReference:
              paymentMethod === PaymentMethod.MPESA
                ? randomString(10)
                : `REF-${randomString(8)}`,
            payee: `${tenant.surname} ${tenant.otherNames}`,
            paidFrom:
              paymentMethod === PaymentMethod.MPESA
                ? 'M-PESA'
                : 'Bank Transfer',
            paidTo: 'Operating Account',
            paymentType: PaymentType.ApplyToBill,
            recordedBy: [
              'MASHABAZI GIDEON',
              'John Smith',
              'Mary Johnson',
              'Admin User',
            ][Math.floor(Math.random() * 4)],
            organizationId,
          },
        });
        paymentCount++;

        // Create receipt for payment
        await prisma.receipt.create({
          data: {
            receiptId: `REC-${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${receiptCount}${randomString(4)}`,
            receiptType: ReceiptType.ApplyToInvoice,
            receiptCategory: ReceiptCategory.Rent,
            receivedFrom: `${tenant.surname} ${tenant.otherNames}`,
            paymentMethod,
            recordingDate: paymentDate,
            amountReceived: paidAmount,
            currency: 'KES',
            tenantId: tenant.id,
            landlordId: property.landlordId,
            receiptTo: ReceiptTo.Landlord,
            drtOrDrf: DRTOrDRF.DirectReceipt,
            recordedBy: [
              'MASHABAZI GIDEON',
              'John Smith',
              'Mary Johnson',
              'Admin User',
            ][Math.floor(Math.random() * 4)],
            payments: { connect: { id: payment.id } },
            organizationId,
          },
        });
        receiptCount++;
      }
    }
  }

  console.log(
    `Generated ${invoiceCount} invoices, ${paymentCount} payments, and ${receiptCount} receipts`,
  );
  console.log('Demo data generation completed!');

  // ========== CRM: leads, contacts, communication history (Module 3) ==========
  console.log('Generating CRM leads and contacts...');
  const crmCounts = await generateCrmData(
    prisma,
    organizationId,
    properties,
    tenants,
  );
  console.log(
    `Generated ${crmCounts.leads} leads, ${crmCounts.contacts} contacts, ${crmCounts.communications} log entries`,
  );

  // ========== SALES: transactions, instalments, commissions (Module 4) ==========
  console.log('Generating sales transactions and commissions...');
  const salesCounts = await generateSalesData(
    prisma,
    organizationId,
    properties,
    crmCounts.buyerContactId,
  );
  console.log(
    `Generated ${salesCounts.sales} sales, ${salesCounts.installments} instalments, ${salesCounts.commissions} commissions`,
  );

  // ========== OWNERS: charges, statements, payouts (Module 6) ==========
  console.log('Generating owner charges, statements and payouts...');
  const ownerCounts = await generateOwnerData(
    prisma,
    organizationId,
    landlords,
    properties,
    startDate,
    months,
  );
  console.log(
    `Generated ${ownerCounts.charges} owner charges, ${ownerCounts.statements} statements, ${ownerCounts.payouts} payouts`,
  );

  return {
    landlords: landlords.length,
    properties: properties.length,
    units: units.length,
    tenants: tenants.length,
    rentalAgreements: rentalAgreements.length,
    invoices: invoiceCount,
    payments: paymentCount,
    receipts: receiptCount,
    leads: crmCounts.leads,
    contacts: crmCounts.contacts,
    communications: crmCounts.communications,
    sales: salesCounts.sales,
    installments: salesCounts.installments,
    commissions: salesCounts.commissions,
    ownerCharges: ownerCounts.charges,
    ownerStatements: ownerCounts.statements,
    ownerPayouts: ownerCounts.payouts,
  };
}

/**
 * Owner money data (Module 6).
 *
 * A handful of landlords — the ones with the most properties — get real
 * statements generated from the payments that were just created, so the module
 * opens with figures that reconcile rather than hand-typed ones.
 *
 * The arithmetic is duplicated here on purpose: this script seeds the database
 * directly, outside Nest, so it cannot reach `OwnerStatementsService`. It calls
 * the same calculation rules in spirit — income from payments dated in the
 * period, expenses from unclaimed charges, a percentage fee, net payout — and
 * writes the frozen line snapshots so the documents still reconcile.
 */
async function generateOwnerData(
  prisma: PrismaClient,
  organizationId: string,
  landlords: Landlord[],
  properties: Property[],
  /** Window the rent data was generated for, reused to date the charges. */
  historyStart: Date,
  historyMonths: number,
) {
  // Landlords with the biggest portfolios get the most interesting history.
  const owners = landlords
    .map((landlord) => ({
      landlord,
      properties: properties.filter(
        (property) => property.landlordId === landlord.id,
      ),
    }))
    .filter((entry) => entry.properties.length > 0)
    .sort((a, b) => b.properties.length - a.properties.length)
    .slice(0, 12);

  // Give every landlord in the demo a plausible management agreement, so the
  // statement screen shows a fee rather than a column of zeros. The rate is
  // kept per landlord and reused when their statement is written, so the
  // profile and the statement never disagree.
  const feeRates = new Map<string, number>();
  for (const { landlord } of owners) {
    const rate = [8, 8.5, 9, 10][Math.floor(Math.random() * 4)];
    feeRates.set(landlord.id, rate);
    await prisma.landlord.update({
      where: { id: landlord.id },
      data: {
        managementFeeType: ManagementFeeType.PERCENTAGE,
        managementFeeRate: rate,
        notes:
          Math.random() > 0.5
            ? 'Prefers quarterly statements. Send the printed copy to the Kileleshwa address.'
            : null,
      },
    });
  }

  // Statements cover the two full months before the current one: those periods
  // are finished, so they are the ones an operator would actually run. Defined
  // before the charges so most charges can be dated inside them and actually
  // show up as deductions.
  const periodEnds: Date[] = [];
  for (let monthOffset = 1; monthOffset <= 2; monthOffset += 1) {
    const end = new Date();
    end.setMonth(end.getMonth() - monthOffset, 0);
    end.setHours(23, 59, 59, 999);
    periodEnds.push(end);
  }

  const periods = periodEnds.map((periodEnd) => {
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1, 1);
    periodStart.setHours(0, 0, 0, 0);
    return { periodStart, periodEnd };
  });

  // Costs charged to owners, some already claimed by a statement, some still
  // waiting to be deducted from the next one.
  const chargeTemplates = [
    {
      category: ChargeCategory.REPAIR,
      description: 'Burst pipe in unit 4B',
      amount: 18_500,
    },
    {
      category: ChargeCategory.MAINTENANCE,
      description: 'Serviced the water pump',
      amount: 32_000,
    },
    {
      category: ChargeCategory.UTILITIES,
      description: 'Water bill advanced by the office',
      amount: 24_750,
    },
    {
      category: ChargeCategory.INSURANCE,
      description: 'Annual building insurance premium',
      amount: 45_000,
    },
    {
      category: ChargeCategory.TAX,
      description: 'Ground rent / rates for the year',
      amount: 60_000,
    },
    {
      category: ChargeCategory.LEGAL,
      description: 'Lease renewal legal fees',
      amount: 15_000,
    },
  ];

  const chargeRows: Array<{
    id: string;
    landlordId: string;
    amount: number;
    chargeDate: Date;
    category: ChargeCategory;
    description: string;
    propertyName: string | null;
  }> = [];

  for (const { landlord, properties: ownerProperties } of owners) {
    const count = 1 + Math.floor(Math.random() * 3);
    for (let index = 0; index < count; index += 1) {
      const template =
        chargeTemplates[Math.floor(Math.random() * chargeTemplates.length)];

      // Most charges land inside a statement period so they actually appear as
      // deductions; the rest sit in the older history and stay unstated.
      let chargeDate: Date;
      if (Math.random() > 0.3) {
        const period = periods[Math.floor(Math.random() * periods.length)];
        const spanDays = Math.floor(
          (period.periodEnd.getTime() - period.periodStart.getTime()) / 86_400_000,
        );
        chargeDate = new Date(period.periodStart);
        chargeDate.setDate(
          chargeDate.getDate() + Math.floor(Math.random() * spanDays),
        );
      } else {
        chargeDate = new Date(historyStart);
        chargeDate.setDate(
          chargeDate.getDate() +
            Math.floor(Math.random() * (historyMonths * 30)),
        );
      }

      const property =
        ownerProperties[Math.floor(Math.random() * ownerProperties.length)];

      const charge = await prisma.landlordCharge.create({
        data: {
          organizationId,
          landlordId: landlord.id,
          propertyId: property.id,
          category: template.category,
          description: template.description,
          amount: template.amount,
          chargeDate,
          createdBy: 'MASHABAZI GIDEON',
        },
      });

      chargeRows.push({
        id: charge.id,
        landlordId: landlord.id,
        amount: Number(charge.amount),
        chargeDate,
        category: template.category,
        description: template.description,
        propertyName: property.name,
      });
    }
  }

  let statementCount = 0;
  let payoutCount = 0;

  for (const { landlord } of owners) {
    for (let index = 0; index < periods.length; index += 1) {
      const { periodStart, periodEnd } = periods[index];

      const payments = await prisma.payment.findMany({
        where: {
          organizationId,
          paymentDate: { gte: periodStart, lte: periodEnd },
          invoice: {
            organizationId,
            saleTransactionId: null,
            OR: [
              { landlordId: landlord.id },
              {
                landlordId: null,
                rentalAgreement: {
                  unit: {
                    property: { landlordId: landlord.id },
                  },
                },
              },
            ],
          },
        },
        select: {
          amount: true,
          paymentDate: true,
          invoice: {
            select: {
              invoiceNumber: true,
              rentalAgreement: {
                select: {
                  unit: { select: { property: { select: { name: true } } } },
                },
              },
            },
          },
        },
      });

      const byInvoice = new Map<
        string,
        { amountCents: number; paymentDate: string; property: string | null }
      >();

      for (const payment of payments) {
        const invoiceNumber = payment.invoice?.invoiceNumber;
        if (!invoiceNumber) continue;
        const existing = byInvoice.get(invoiceNumber) ?? {
          amountCents: 0,
          paymentDate: payment.paymentDate.toISOString().slice(0, 10),
          property:
            payment.invoice?.rentalAgreement?.unit.property.name ?? null,
        };
        existing.amountCents += Math.round(Number(payment.amount) * 100);
        existing.paymentDate = payment.paymentDate.toISOString().slice(0, 10);
        byInvoice.set(invoiceNumber, existing);
      }

      const incomeLines = [...byInvoice.entries()].map(([ref, entry]) => ({
        ref,
        description: 'Rent collected',
        property: entry.property,
        amount: entry.amountCents / 100,
        paymentDate: entry.paymentDate,
      }));

      const claimable = chargeRows.filter(
        (charge) =>
          charge.landlordId === landlord.id &&
          charge.chargeDate >= periodStart &&
          charge.chargeDate <= periodEnd,
      );

      const grossIncomeCents = incomeLines.reduce(
        (sum, line) => sum + Math.round(line.amount * 100),
        0,
      );
      const expensesCents = claimable.reduce(
        (sum, charge) => sum + Math.round(charge.amount * 100),
        0,
      );
      const feeRate = feeRates.get(landlord.id) ?? 8.5;
      const managementFeeCents = Math.round((grossIncomeCents * feeRate) / 100);
      const netCents = grossIncomeCents - expensesCents - managementFeeCents;

      if (netCents <= 0 && index === 0) continue; // nothing worth issuing

      const statementNumber = `OST-${periodEnd.getFullYear()}${String(periodEnd.getMonth() + 1).padStart(2, '0')}-${String(statementCount + 1).padStart(4, '0')}`;

      const statement = await prisma.ownerStatement.create({
        data: {
          statementNumber,
          organizationId,
          landlordId: landlord.id,
          periodStart,
          periodEnd,
          grossIncome: grossIncomeCents / 100,
          expenses: expensesCents / 100,
          managementFee: managementFeeCents / 100,
          carriedForward: 0,
          netPayout: netCents / 100,
          status: OwnerStatementStatus.ISSUED,
          issuedAt: new Date(periodEnd.getTime() + 2 * 24 * 60 * 60 * 1000),
          notes:
            index === 0
              ? 'Rent collected less repairs and the management fee. Statement printed and emailed.'
              : null,
          incomeLines: incomeLines as never,
          expenseLines: claimable.map((charge) => ({
            ref: charge.id,
            category: charge.category,
            description: charge.description,
            property: charge.propertyName,
            amount: charge.amount,
            chargeDate: charge.chargeDate.toISOString().slice(0, 10),
          })) as never,
          generatedBy: 'MASHABAZI GIDEON',
        },
      });

      await prisma.landlordCharge.updateMany({
        where: { id: { in: claimable.map((charge) => charge.id) } },
        data: { ownerStatementId: statement.id },
      });

      statementCount += 1;

      // The oldest statement gets paid in full; the recent one is left partly
      // open so the dashboard has something genuinely outstanding.
      if (index === periodEnds.length - 1) {
        const payoutAmount =
          Math.random() > 0.4
            ? netCents / 100
            : Math.round((netCents / 100) * (0.4 + Math.random() * 0.3) * 100) /
              100;

        if (payoutAmount > 0) {
          const paidInFull = Math.abs(payoutAmount - netCents / 100) < 0.01;
          await prisma.landlordPayout.create({
            data: {
              organizationId,
              landlordId: landlord.id,
              ownerStatementId: statement.id,
              amount: payoutAmount,
              currency: 'KES',
              method: PaymentMethod.BANK_TRANSFER,
              status: paidInFull ? PayoutStatus.PAID : PayoutStatus.PROCESSING,
              reference: paidInFull ? `BNK-RTGS-${randomString(6)}` : null,
              paidAt: paidInFull
                ? new Date(periodEnd.getTime() + 5 * 24 * 60 * 60 * 1000)
                : null,
              scheduledFor: paidInFull
                ? null
                : new Date(periodEnd.getTime() + 7 * 24 * 60 * 60 * 1000),
              notes: paidInFull
                ? null
                : 'Awaiting the transfer confirmation from the bank.',
              createdBy: 'Mary Johnson',
            },
          });

          if (paidInFull) {
            await prisma.ownerStatement.update({
              where: { id: statement.id },
              data: { status: OwnerStatementStatus.SETTLED },
            });
          }

          payoutCount += 1;

          // A second instalment on some owners, so a statement shows a payout
          // history rather than a single row.
          if (paidInFull && Math.random() > 0.6) {
            await prisma.landlordPayout.create({
              data: {
                organizationId,
                landlordId: landlord.id,
                amount: Math.round(Math.random() * 20_000 * 100) / 100,
                currency: 'KES',
                method: PaymentMethod.MPESA,
                status: PayoutStatus.FAILED,
                failureReason:
                  'Account number rejected by the bank — confirm with the owner.',
                notes: 'Goodwill payment; retry once the account is corrected.',
                createdBy: 'Mary Johnson',
              },
            });
            payoutCount += 1;
          }
        }
      }
    }
  }

  return {
    charges: chargeRows.length,
    statements: statementCount,
    payouts: payoutCount,
  };
}

/**
 * Sales data (Module 4).
 *
 * Spreads sales across the pipeline so the board shows a real funnel: two
 * quotations, an offer, a reservation, a sale in payment collection with a
 * payment schedule and raised invoices, and one completed handover. The handed
 * over sale carries a split commission so the report has two agents on it.
 */
async function generateSalesData(
  prisma: PrismaClient,
  organizationId: string,
  properties: Property[],
  buyerContactId: string | null,
) {
  // Only properties without an open sale can carry one (enforced by the API).
  const candidates = properties.filter(
    (property) => property.type?.toLowerCase() !== 'land',
  );
  if (candidates.length < 6 || !buyerContactId) {
    return { sales: 0, installments: 0, commissions: 0 };
  }

  const agents = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true },
    take: 2,
  });
  const agentId = agents[0]?.id ?? null;
  const secondAgentId = agents[1]?.id ?? agentId;

  const stages = [
    'QUOTATION',
    'QUOTATION',
    'OFFER',
    'RESERVATION',
    'PAYMENT',
    'HANDOVER',
  ] as const;

  let sales = 0;
  let installments = 0;
  let commissions = 0;
  let sequence = 1;

  for (const [index, stage] of stages.entries()) {
    const property = candidates[index];
    if (!property) break;

    const agreedPrice = 40_000_000 + index * 7_500_000;
    const isHandover = stage === 'HANDOVER';

    const sale = await prisma.saleTransaction.create({
      data: {
        code: `SALE-2026-${String(sequence).padStart(4, '0')}`,
        organizationId,
        propertyId: property.id,
        propertyTitle: property.name,
        buyerContactId,
        agentUserId: agentId,
        stage,
        askingPrice: agreedPrice + 3_000_000,
        agreedPrice,
        bookingFee: 500_000,
        depositAmount: 5_000_000,
        commissionRate: 3,
        quotationDate: daysFromNow(-60 + index * 5),
        offerDate: stage === 'QUOTATION' ? null : daysFromNow(-55 + index * 5),
        reservationDate:
          stage === 'QUOTATION' || stage === 'OFFER'
            ? null
            : daysFromNow(-50 + index * 5),
        agreementDate:
          stage === 'QUOTATION' || stage === 'OFFER' || stage === 'RESERVATION'
            ? null
            : daysFromNow(-45 + index * 5),
        paymentDate:
          stage === 'PAYMENT' || isHandover ? daysFromNow(-30) : null,
        handoverDate: isHandover ? daysFromNow(-5) : null,
        notes: 'Seeded sale for demonstration.',
      },
    });
    sales += 1;

    // Only the money stages need a schedule; earlier stages have nothing to bill.
    if (stage === 'RESERVATION' || stage === 'PAYMENT' || isHandover) {
      const deposit = 5_000_000;
      const financed = agreedPrice - deposit;
      const count = 4;
      const per = Math.round((financed / count) * 100) / 100;

      const rows: Array<{
        saleTransactionId: string;
        sequence: number;
        description: string;
        amount: number;
        dueDate: Date;
        status: 'SCHEDULED' | 'PAID';
        paidAt?: Date;
      }> = [
        {
          saleTransactionId: sale.id,
          sequence: 1,
          description: 'Deposit',
          amount: deposit,
          dueDate: daysFromNow(-40),
          status: isHandover ? 'PAID' : 'SCHEDULED',
          ...(isHandover ? { paidAt: daysFromNow(-40) } : {}),
        },
      ];

      for (let i = 0; i < count; i += 1) {
        rows.push({
          saleTransactionId: sale.id,
          sequence: i + 2,
          description: `Instalment ${i + 1}`,
          amount:
            i === count - 1
              ? Math.round((financed - per * (count - 1)) * 100) / 100
              : per,
          dueDate: daysFromNow(-10 + i * 30),
          status: isHandover ? 'PAID' : 'SCHEDULED',
          ...(isHandover ? { paidAt: daysFromNow(-10 + i * 30) } : {}),
        });
      }

      await prisma.saleInstallment.createMany({ data: rows });
      installments += rows.length;

      // Raise finance invoices for the two money stages, as the API would.
      const created = await prisma.saleInstallment.findMany({
        where: { saleTransactionId: sale.id },
        orderBy: { sequence: 'asc' },
      });
      for (const row of created) {
        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber: `INV-SALE-${String(sequence).padStart(4, '0')}-${row.sequence}`,
            transactionClass: 'SALE',
            billTo: 'Seeded buyer',
            issueDate: daysFromNow(-12),
            dueDate: row.dueDate,
            amount: row.amount,
            totalAmount: row.amount,
            paidAmount: row.status === 'PAID' ? row.amount : 0,
            balanceAmount: row.status === 'PAID' ? 0 : row.amount,
            status: row.status === 'PAID' ? 'PAID' : 'PENDING',
            memo: `Sale ${sale.code} — ${row.description}`,
            organizationId,
            saleTransactionId: sale.id,
            invoiceItems: {
              create: [
                {
                  description: `${row.description} (${sale.code})`,
                  revenueExpenseItem: 'Property sale',
                  quantity: 1,
                  unitPrice: row.amount,
                  amount: row.amount,
                },
              ],
            },
          },
        });

        await prisma.saleInstallment.update({
          where: { id: row.id },
          data: {
            invoiceId: invoice.id,
            status: isHandover ? 'PAID' : 'INVOICED',
          },
        });

        if (isHandover) {
          await prisma.payment.create({
            data: {
              invoiceId: invoice.id,
              amount: row.amount,
              paymentMethod: 'MPESA',
              paymentReference: `SALE-PAY-${row.sequence}`,
              organizationId,
            },
          });
        }
      }

      // Commission split: 70/30 when a second agent exists.
      const total = Math.round(agreedPrice * 0.03 * 100) / 100;
      const participants =
        secondAgentId && secondAgentId !== agentId
          ? [
              { agentUserId: agentId ?? '', share: 70 },
              { agentUserId: secondAgentId, share: 30 },
            ]
          : [{ agentUserId: agentId ?? '', share: 100 }];

      let allocated = 0;
      for (const [pIndex, participant] of participants.entries()) {
        const amount =
          pIndex === participants.length - 1
            ? Math.round((total - allocated) * 100) / 100
            : Math.round(((total * participant.share) / 100) * 100) / 100;
        allocated += amount;

        await prisma.commission.create({
          data: {
            organizationId,
            saleTransactionId: sale.id,
            agentUserId: participant.agentUserId,
            amount,
            splitPercentage: participant.share,
            currency: 'KES',
            basis: 'SALE',
            status: isHandover
              ? 'PAID'
              : stage === 'PAYMENT'
                ? 'APPROVED'
                : 'PENDING',
            approvedAt:
              isHandover || stage === 'PAYMENT' ? daysFromNow(-30) : null,
            paidAt: isHandover ? daysFromNow(-5) : null,
            paidRef: isHandover ? `COMM-PAY-${sequence}` : null,
          },
        });
        commissions += 1;
      }
    }

    sequence += 1;
  }

  return { sales, installments, commissions };
}

/**
 * Small, realistic CRM data set (Module 3).
 *
 * Deliberately hand-written rather than randomised: the pipeline board is the
 * screen a reviewer looks at first, so it needs leads spread across the stages
 * — including one won lead (with its converted contact), one lost lead with a
 * reason, and a communication history worth reading.
 */
async function generateCrmData(
  prisma: PrismaClient,
  organizationId: string,
  properties: Property[],
  tenants: Tenant[],
) {
  const people: Array<{
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    source: 'WEBSITE' | 'FACEBOOK' | 'WHATSAPP' | 'WALK_IN' | 'REFERRAL';
    sourceDetail: string;
    message: string;
    stage:
      | 'NEW'
      | 'CONTACTED'
      | 'VIEWING_SCHEDULED'
      | 'NEGOTIATION'
      | 'WON'
      | 'LOST';
    lostReason?: string;
  }> = [
    {
      firstName: 'Amina',
      lastName: 'Wanjiru',
      email: 'amina.wanjiru@example.com',
      phone: '+254712000001',
      source: 'WEBSITE',
      sourceDetail: 'Kileleshi listings page',
      message:
        'Looking for a 2-bedroom in Kileleshi or Lavington, budget 60–70k, moving next month.',
      stage: 'CONTACTED',
    },
    {
      firstName: 'Brian',
      lastName: 'Otieno',
      email: 'brian.otieno@example.com',
      phone: '+254712000002',
      source: 'FACEBOOK',
      sourceDetail: 'Facebook Lead Ad — apartments',
      message:
        'Interested in serviced apartments near Westlands for two months.',
      stage: 'VIEWING_SCHEDULED',
    },
    {
      firstName: 'Caroline',
      lastName: 'Mwangi',
      email: 'caroline.mwangi@example.com',
      phone: '+254712000003',
      source: 'WALK_IN',
      sourceDetail: '',
      message: 'Walked in asking about a 3-bedroom for sale in Ruiru.',
      stage: 'NEGOTIATION',
    },
    {
      firstName: 'David',
      lastName: 'Kimani',
      email: 'david.kimani@example.com',
      phone: '+254712000004',
      source: 'REFERRAL',
      sourceDetail: 'Referred by Mr. Otieno (unit B4)',
      message: 'Referred by an existing tenant, wants a smaller one-bed.',
      stage: 'WON',
    },
    {
      firstName: 'Esther',
      lastName: 'Njeri',
      email: 'esther.njeri@example.com',
      phone: '+254712000005',
      source: 'WHATSAPP',
      sourceDetail: 'WhatsApp Business number',
      message: 'Asked for a 1-bedroom with parking, anywhere in Nairobi.',
      stage: 'LOST',
      lostReason: 'Went with a competitor with a cheaper service charge.',
    },
    {
      firstName: 'Frank',
      lastName: 'Odhiambo',
      email: 'frank.odhiambo@example.com',
      phone: '+254712000006',
      source: 'WEBSITE',
      sourceDetail: 'Homepage enquiry form',
      message: 'General enquiry about a warehouse in Industrial Area.',
      stage: 'NEW',
    },
  ];

  let leads = 0;
  let contacts = 0;
  let communications = 0;
  let buyerContactId: string | null = null;

  for (const [index, person] of people.entries()) {
    const property = properties[index % Math.max(properties.length, 1)];

    const lead = await prisma.lead.create({
      data: {
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        phone: person.phone,
        message: person.message,
        source: person.source,
        sourceDetail: person.sourceDetail || null,
        stage: person.stage,
        lostReason: person.lostReason ?? null,
        organizationId,
        interestedPropertyId: property?.id ?? null,
        communications: {
          create: {
            channel: 'NOTE',
            direction: 'INBOUND',
            subject: 'Lead captured',
            content: person.message,
            organizationId,
          },
        },
      },
    });
    leads += 1;

    // The won lead becomes a contact (the conversion the module is judged on).
    if (person.stage === 'WON') {
      const contact = await prisma.contact.create({
        data: {
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          type: 'TENANT',
          notes: 'Referred by an existing tenant; moving in next month.',
          organizationId,
          communications: {
            create: {
              channel: 'NOTE',
              direction: 'INBOUND',
              subject: `Converted from lead (${person.source})`,
              content: person.message,
              organizationId,
            },
          },
        },
      });
      contacts += 1;
      // Reused as the buyer on the seeded sales (Module 4).
      buyerContactId = buyerContactId ?? contact.id;

      await prisma.communicationLog.create({
        data: {
          channel: 'CALL',
          direction: 'OUTBOUND',
          subject: 'Confirmed unit and move-in date',
          content:
            'Agreed on unit B7, move-in on the 1st. Asked for the deposit terms in writing.',
          outcome: 'answered',
          occurredAt: daysFromNow(-3),
          contactId: contact.id,
          leadId: lead.id,
          organizationId,
        },
      });
      communications += 1;

      await prisma.lead.update({
        where: { id: lead.id },
        data: { contactId: contact.id, convertedAt: daysFromNow(-4) },
      });
    }

    // A couple of extra history entries so the contact timeline is not empty.
    if (person.stage === 'NEGOTIATION' || person.stage === 'LOST') {
      const contact = await prisma.contact.create({
        data: {
          firstName: person.firstName,
          lastName: person.lastName,
          email: person.email,
          phone: person.phone,
          type: 'BUYER',
          organizationId,
        },
      });
      contacts += 1;

      await prisma.communicationLog.create({
        data: {
          channel: 'EMAIL',
          direction: 'OUTBOUND',
          subject: 'Sent the shortlist',
          content:
            'Shared four matching units with photos and service charges.',
          occurredAt: daysFromNow(-6),
          contactId: contact.id,
          organizationId,
        },
      });
      communications += 1;
    }
  }

  // Link a couple of existing tenants to the directory so the contact detail
  // screen shows the Tenant relationship.
  for (const tenant of tenants.slice(0, 3)) {
    const existing = await prisma.contact.findFirst({
      where: {
        organizationId,
        email: tenant.email ?? undefined,
        firstName: tenant.otherNames ?? '',
        lastName: tenant.surname,
      },
      select: { id: true },
    });
    if (existing) {
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { contactId: existing.id },
      });
    }
  }

  return { leads, contacts, communications, buyerContactId };
}

function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

// Main function to run demo data generation standalone
export async function seedDemoData() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  const passwordHash = await bcrypt.hash('Password123!', 10);

  try {
    // Clean the database (in correct order to handle foreign keys)
    // Preserve super admin user
    console.log('Cleaning database...');
    await prisma.payment.deleteMany();
    await prisma.receiptLine.deleteMany();
    await prisma.receipt.deleteMany();
    await prisma.invoiceItem.deleteMany();
    // Sales own instalments and commissions, and reference properties/users,
    // so they are cleared before the tables they point at.
    await prisma.commission.deleteMany();
    await prisma.saleInstallment.deleteMany();
    await prisma.saleTransaction.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.rentalAgreement.deleteMany();
    await prisma.tenantEmergencyContact.deleteMany();
    // CRM first: `Lead`/`Contact` reference properties, branches, users and
    // (optionally) tenants, and `CommunicationLog` references both.
    await prisma.communicationLog.deleteMany();
    await prisma.lead.deleteMany();
    await prisma.contact.deleteMany();
    await prisma.tenant.deleteMany();
    await prisma.unitFeature.deleteMany();
    await prisma.unitMeterNumber.deleteMany();
    await prisma.unitServiceCharge.deleteMany();
    await prisma.unit.deleteMany();
    await prisma.propertySecurityDeposit.deleteMany();
    await prisma.propertyStandingCharge.deleteMany();
    await prisma.property.deleteMany();
    await prisma.landlord.deleteMany();
    await prisma.roleAssignment.deleteMany();
    await prisma.document.deleteMany();
    await prisma.branch.deleteMany();
    await prisma.role.deleteMany({ where: { organizationId: { not: null } } });
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany({
      where: {
        role: {
          not: UserRole.SUPER_ADMIN,
        },
      },
    });
    await prisma.organization.deleteMany();

    // Create organizations
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

    // Seed the 12 system roles (idempotent; organization-scoped roles were
    // cleaned above)
    await seedRoles(prisma);

    // Create users
    console.log('Creating users...');

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

    // Generate demo data for Rohi Estate Management
    await generateDemoData(prisma, rohiOrg.id);

    // Tenant portal logins (Module 5 checklist, auth in Module 1).
    //
    // Created *after* the demo data so a tenant actually exists to bind to:
    // one resident per organization, linked to that tenant's record, so
    // `/portal` can be demonstrated — sign in as `tenant@rohi.co.ke` with the
    // demo password to see only that household's lease, invoices and receipts.
    for (const [org, email] of [
      [rohiOrg, 'tenant@rohi.co.ke'],
      [defaultOrg, 'tenant@westhill.co.ke'],
    ] as const) {
      const tenant = await prisma.tenant.findFirst({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, surname: true, otherNames: true },
      });
      if (!tenant) {
        // The other demo org has no tenancy data seeded, so there is nothing to
        // bind a portal login to.
        continue;
      }

      await prisma.user.create({
        data: {
          email,
          // Some seeded tenants carry no other names, so fall back to a placeholder
          // rather than an empty first name.
          firstName: (tenant.otherNames ?? '').trim() || 'Tenant',
          lastName: tenant.surname,
          passwordHash,
          // A portal login is a resident: never a staff role.
          role: UserRole.USER,
          organizationId: org.id,
          portalTenantId: tenant.id,
        },
      });
      console.log(`  Portal login: ${email} (password: Password123!)`);
    }

    console.log('Demo data generation completed successfully!');
  } catch (error) {
    console.error('Error generating demo data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedDemoData();
}
