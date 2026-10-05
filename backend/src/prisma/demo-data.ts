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
  WorkflowApproverKind,
  WorkflowEventType,
  WorkflowInstanceStatus,
  WorkflowStepStatus,
  AssetType,
  AssetStatus,
  MaintenanceCategory,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  PurchaseCategory,
  PurchasePriority,
  PurchaseRequestStatus,
  PurchaseOrderStatus,
  RfqStatus,
  QuoteStatus,
  SupplierStatus,
  SupplierCategory,
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
          (period.periodEnd.getTime() - period.periodStart.getTime()) /
            86_400_000,
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

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

/**
 * Module 18 — Workflow Engine demo data.
 *
 * Two things are demonstrated here that no other screen can show:
 *
 *   1. **A policy is configuration.** A platform default for `REFUND` (two
 *      levels, the second conditional on amount) plus Rohi's own one-level
 *      policy that shadows it and escalates after 24 hours. Editing either row
 *      changes how the next request behaves — no code, no deploy.
 *   2. **The states an approval really gets into**: waiting on Finance, already
 *      declined with a note, and blown past its deadline and escalated to the
 *      administrator. All three are recorded truthfully — none of them has moved
 *      money, which is exactly why they are safe to seed.
 */
async function generateWorkflowData(
  prisma: PrismaClient,
  organizationId: string,
) {
  const admin = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.ADMIN },
    select: { id: true },
  });
  const accountant = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.ACCOUNTANT },
    select: { id: true },
  });
  const propertyManager = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.PROPERTY_MANAGER },
    select: { id: true },
  });

  const payment = await prisma.payment.findFirst({
    where: { organizationId },
    orderBy: { paymentDate: 'desc' },
    select: { id: true, amount: true, currency: true, paymentReference: true },
  });
  if (!payment) return;

  // ── platform default policy, shared by every organization ──────────────
  const defaultSteps = [
    {
      name: 'Finance review',
      approverKind: 'ROLE',
      approverRole: 'Accountant',
      approverUserId: null,
      condition: null,
      escalateAfterHours: 48,
      escalateToUserId: null,
    },
    {
      name: 'Director sign-off',
      approverKind: 'ROLE',
      approverRole: 'Company Admin',
      approverUserId: null,
      // Only a large refund gets the second pair of eyes.
      condition: { field: 'amount', op: 'gt', value: 50000 },
      escalateAfterHours: null,
      escalateToUserId: null,
    },
  ];

  const existingDefault = await prisma.workflowDefinition.findFirst({
    where: { organizationId: null, entityType: 'REFUND' },
  });
  const defaultDefinition = existingDefault
    ? await prisma.workflowDefinition.update({
        where: { id: existingDefault.id },
        data: { steps: defaultSteps, isActive: true },
      })
    : await prisma.workflowDefinition.create({
        data: {
          organizationId: null,
          entityType: 'REFUND',
          name: 'Refund approval (default)',
          description:
            'Finance reviews every refund; anything above 50,000 also needs the director. Offered to every organization, who may copy and change it.',
          steps: defaultSteps,
          isActive: true,
          priority: 0,
        },
      });

  // ── Rohi's own policy: shadows the default, and escalates ──────────────
  const ownSteps = [
    {
      name: 'Finance review',
      approverKind: 'ROLE',
      approverRole: 'Accountant',
      approverUserId: null,
      condition: null,
      // Rohi wants an unattended refund chased after a day, not two.
      escalateAfterHours: 24,
      escalateToUserId: admin?.id ?? null,
    },
  ];

  const existingOwn = await prisma.workflowDefinition.findFirst({
    where: { organizationId, entityType: 'REFUND' },
  });
  const ownDefinition = existingOwn
    ? await prisma.workflowDefinition.update({
        where: { id: existingOwn.id },
        data: { steps: ownSteps, isActive: true, priority: 10 },
      })
    : await prisma.workflowDefinition.create({
        data: {
          organizationId,
          entityType: 'REFUND',
          name: 'Refund approval',
          description:
            'One level: the accountant reviews every refund and escalates to an administrator after 24 hours.',
          steps: ownSteps,
          isActive: true,
          priority: 10,
        },
      });

  const label = (amount: number) =>
    `Refund of ${payment.currency || 'KES'} ${amount.toLocaleString()} on payment ${payment.paymentReference ?? payment.id}`;

  // ── 1. waiting on Finance ──────────────────────────────────────────────
  await prisma.workflowInstance.create({
    data: {
      organizationId,
      workflowDefinitionId: ownDefinition.id,
      entityType: 'REFUND',
      entityId: payment.id,
      entityLabel: label(8500),
      steps: ownSteps,
      context: {
        paymentId: payment.id,
        amount: 8500,
        currency: payment.currency,
        reason: 'Overpayment returned after the tenancy was credited',
        refundReference: null,
        toCredit: false,
        payer: 'Achieng Otieno',
        invoiceNumber: null,
      },
      status: WorkflowInstanceStatus.IN_PROGRESS,
      currentStep: 0,
      startedById: propertyManager?.id ?? null,
      startedAt: hoursAgo(6),
      stepInstances: {
        create: {
          stepIndex: 0,
          name: 'Finance review',
          approverKind: WorkflowApproverKind.ROLE,
          approverRole: 'Accountant',
          status: WorkflowStepStatus.ACTIVE,
          dueAt: hoursFromNow(18),
          escalateToUserId: admin?.id ?? null,
        },
      },
      events: {
        create: {
          type: WorkflowEventType.STARTED,
          actorUserId: propertyManager?.id ?? null,
          stepIndex: 0,
        },
      },
    },
  });

  // ── 2. declined, with the note the requester reads ─────────────────────
  const smallSteps = [
    {
      name: 'Finance review',
      approverKind: 'ROLE',
      approverRole: 'Accountant',
      approverUserId: null,
      condition: null,
      escalateAfterHours: 24,
      escalateToUserId: admin?.id ?? null,
    },
  ];
  await prisma.workflowInstance.create({
    data: {
      organizationId,
      workflowDefinitionId: ownDefinition.id,
      entityType: 'REFUND',
      entityId: payment.id,
      entityLabel: label(2400),
      steps: smallSteps,
      context: {
        paymentId: payment.id,
        amount: 2400,
        currency: payment.currency,
        reason: 'Resident asked for the duplicate posting back',
        refundReference: null,
        toCredit: false,
        payer: 'Achieng Otieno',
        invoiceNumber: null,
      },
      status: WorkflowInstanceStatus.REJECTED,
      currentStep: 0,
      finalComment:
        'This is the same money as the 8,500 request raised earlier today — it is already being refunded once.',
      startedById: propertyManager?.id ?? null,
      startedAt: hoursAgo(30),
      completedAt: hoursAgo(28),
      stepInstances: {
        create: {
          stepIndex: 0,
          name: 'Finance review',
          approverKind: WorkflowApproverKind.ROLE,
          approverRole: 'Accountant',
          status: WorkflowStepStatus.REJECTED,
          dueAt: hoursFromNow(-6),
          actedById: accountant?.id ?? null,
          actedAt: hoursAgo(28),
          comment:
            'This is the same money as the 8,500 request raised earlier today — it is already being refunded once.',
        },
      },
      events: {
        create: [
          {
            type: WorkflowEventType.STARTED,
            actorUserId: propertyManager?.id ?? null,
            stepIndex: 0,
            createdAt: hoursAgo(30),
          },
          {
            type: WorkflowEventType.REJECTED,
            actorUserId: accountant?.id ?? null,
            stepIndex: 0,
            comment:
              'This is the same money as the 8,500 request raised earlier today — it is already being refunded once.',
            createdAt: hoursAgo(28),
          },
        ],
      },
    },
  });

  // ── 3. blown past its deadline and escalated to an administrator ───────
  if (admin) {
    await prisma.workflowInstance.create({
      data: {
        organizationId,
        workflowDefinitionId: ownDefinition.id,
        entityType: 'REFUND',
        entityId: payment.id,
        entityLabel: label(41000),
        steps: smallSteps,
        context: {
          paymentId: payment.id,
          amount: 41000,
          currency: payment.currency,
          reason: 'Deposit released early after a negotiated termination',
          refundReference: null,
          toCredit: false,
          payer: 'Achieng Otieno',
          invoiceNumber: null,
        },
        status: WorkflowInstanceStatus.ESCALATED,
        currentStep: 0,
        startedById: propertyManager?.id ?? null,
        startedAt: hoursAgo(52),
        stepInstances: {
          create: {
            stepIndex: 0,
            name: 'Finance review',
            // Escalation reassigns the level rather than copying it, so the
            // inbox and the authorization check need no special case.
            approverKind: WorkflowApproverKind.USER,
            approverUserId: admin.id,
            approverRole: null,
            status: WorkflowStepStatus.ESCALATED,
            dueAt: hoursFromNow(-28),
            escalatedAt: hoursAgo(28),
            escalateToUserId: admin.id,
          },
        },
        events: {
          create: [
            {
              type: WorkflowEventType.STARTED,
              actorUserId: propertyManager?.id ?? null,
              stepIndex: 0,
              createdAt: hoursAgo(52),
            },
            {
              type: WorkflowEventType.ESCALATED,
              stepIndex: 0,
              comment:
                '"Finance review" passed its deadline and was escalated.',
              createdAt: hoursAgo(28),
            },
          ],
        },
      },
    });
  }

  console.log(
    `  Approval workflows: "${defaultDefinition.name}" (platform default) + "${ownDefinition.name}" (this organization), 3 sample requests`,
  );
}

/**
 * Module 9 — Maintenance demo data.
 *
 * Built so the module can be *demonstrated* rather than described: a plant
 * register, service intervals with real checklists, and a work-order queue
 * spread across the whole pipeline — including the two states that are easy to
 * forget, a cancelled job and a completed one, so the closed-forever behaviour is
 * visible rather than theoretical.
 *
 * References are allocated sequentially per organization, the same scheme the
 * service uses, because the seeded rows are what makes the next reference
 * `WO-2026-0007` instead of `WO-2026-0001`.
 */
async function generateMaintenanceData(
  prisma: PrismaClient,
  organizationId: string,
) {
  const technician = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.TECHNICIAN },
    select: { id: true },
  });
  const maintenanceManager = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.MAINTENANCE_MANAGER },
    select: { id: true },
  });
  const assignee = technician?.id ?? maintenanceManager?.id;

  const properties = await prisma.property.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    take: 4,
    select: {
      id: true,
      name: true,
      units: {
        where: { status: UnitStatus.OCCUPIED },
        take: 2,
        select: {
          id: true,
          name: true,
          rentalAgreements: {
            where: { status: AgreementStatus.ACTIVE },
            take: 1,
            select: { tenant: { select: { id: true, code: true } } },
          },
        },
      },
    },
  });
  if (properties.length === 0) return;

  const day = 86_400_000;
  const now = Date.now();
  let reference = 1;
  const nextReference = () =>
    `WO-${new Date().getFullYear()}-${String(reference++).padStart(4, '0')}`;

  // ── the plant register ────────────────────────────────────────────────
  const plantPlan: {
    type: AssetType;
    name: string;
    assetTag: string;
    location: string;
    capacity?: string;
    manufacturer?: string;
  }[] = [
    {
      type: AssetType.GENERATOR,
      name: 'Diesel standby generator',
      assetTag: 'GEN-01',
      location: 'Basement plant room',
      capacity: '80 kVA',
      manufacturer: 'Cummins',
    },
    {
      type: AssetType.WATER_PUMP,
      name: 'Booster pump set',
      assetTag: 'PUMP-01',
      location: 'Roof tank house',
      capacity: '15 m³/h',
    },
    {
      type: AssetType.ELEVATOR,
      name: 'Passenger lift',
      assetTag: 'LIFT-01',
      location: 'Main core',
      capacity: '8 persons',
    },
    {
      type: AssetType.CCTV,
      name: 'Perimeter camera ring',
      assetTag: 'CCTV-01',
      location: 'Perimeter and lobby',
    },
    {
      type: AssetType.HVAC,
      name: 'Rooftop chiller',
      assetTag: 'HVAC-01',
      location: 'Roof plant deck',
      capacity: '120 kW',
    },
  ];

  const assets: {
    id: string;
    name: string;
    assetTag: string | null;
    type: AssetType;
    propertyId: string;
    propertyName: string;
  }[] = [];

  for (const [index, property] of properties.entries()) {
    const forProperty = plantPlan.slice(index % 3, (index % 3) + 2);
    for (const [offset, item] of forProperty.entries()) {
      const asset = await prisma.asset.create({
        data: {
          organizationId,
          propertyId: property.id,
          type: item.type,
          name: item.name,
          // Tagged per property so two buildings never share an asset tag.
          assetTag: `${item.assetTag}-${String.fromCharCode(65 + index)}`,
          location: item.location,
          manufacturer: item.manufacturer ?? null,
          capacity: item.capacity ?? null,
          installedAt: new Date(now - (400 + offset * 120) * day),
          warrantyExpiresAt: new Date(now + 200 * day),
          status: AssetStatus.OPERATIONAL,
        },
        select: {
          id: true,
          name: true,
          assetTag: true,
          type: true,
          propertyId: true,
          property: { select: { name: true } },
        },
      });
      assets.push({ ...asset, propertyName: property.name });
    }
  }

  // ── preventive maintenance intervals ──────────────────────────────────
  // Keyed by the *kind* of plant rather than by position, so "quarterly lift
  // inspection" really is attached to a lift rather than to whatever happened to
  // be created third.
  const schedulePlan: {
    assetType: AssetType;
    title: string;
    frequencyDays: number;
    leadTimeDays: number;
    nextDueInDays: number;
    checklist: string[];
    description: string;
  }[] = [
    {
      assetType: AssetType.GENERATOR,
      title: 'Monthly generator service',
      frequencyDays: 30,
      leadTimeDays: 5,
      nextDueInDays: 4,
      description:
        'Oil and filter change, belt tension, battery terminals, and a 10-minute load test.',
      checklist: [
        'Check oil level and top up',
        'Change engine oil and oil filter',
        'Inspect and tension drive belts',
        'Check battery terminals and electrolyte',
        'Inspect fuel lines for leaks',
        'Run under load for 10 minutes and record readings',
      ],
    },
    {
      assetType: AssetType.WATER_PUMP,
      title: 'Weekly booster pump check',
      frequencyDays: 7,
      leadTimeDays: 1,
      nextDueInDays: 1,
      description: 'Weekly check of the roof-tank booster set.',
      checklist: [
        'Run pump for 5 minutes and listen for cavitation',
        'Check for leaks at joints and seals',
        'Confirm the pressure switch cuts in and out',
      ],
    },
    {
      assetType: AssetType.ELEVATOR,
      title: 'Quarterly lift inspection',
      frequencyDays: 90,
      leadTimeDays: 14,
      nextDueInDays: -6,
      description:
        'Quarterly statutory service. The car was serviced nine weeks ago and is already overdue — which is the point: the register should show it.',
      checklist: [
        'Test the emergency alarm and two-way communication',
        'Inspect door closers and interlocks',
        'Check brake and traction wear',
        'Verify the pit stop and roof access trip',
        'Certificate the car',
      ],
    },
    {
      assetType: AssetType.CCTV,
      title: 'Monthly camera ring check',
      frequencyDays: 30,
      leadTimeDays: 3,
      nextDueInDays: 11,
      description: 'Walk every camera in the ring and confirm the recording.',
      checklist: [
        'Confirm each camera records and the timestamp is right',
        'Clean lenses',
        'Check the DVR storage is not full',
      ],
    },
  ];

  const schedules: { id: string; title: string }[] = [];
  for (const plan of schedulePlan) {
    const asset = assets.find((candidate) => candidate.type === plan.assetType);
    if (!asset) continue;

    const schedule = await prisma.preventiveMaintenanceSchedule.create({
      data: {
        organizationId,
        assetId: asset.id,
        title: plan.title,
        description: plan.description,
        frequencyDays: plan.frequencyDays,
        leadTimeDays: plan.leadTimeDays,
        checklist: plan.checklist,
        ...(assignee ? { assignedTechnicianId: assignee } : {}),
        active: true,
        nextDueAt: new Date(now + plan.nextDueInDays * day),
      },
      select: { id: true, title: true },
    });
    schedules.push(schedule);
  }

  // ── the queue, spread across the whole pipeline ───────────────────────
  const occupied = properties.flatMap((property) =>
    property.units.map((unit) => ({
      propertyId: property.id,
      propertyName: property.name,
      unitId: unit.id,
      unitName: unit.name,
      tenantId: unit.rentalAgreements[0]?.tenant.id ?? null,
    })),
  );
  const first = occupied[0];
  const second = occupied[1] ?? first;
  if (!first) return;

  const asset = assets[0];

  await prisma.workOrder.create({
    data: {
      organizationId,
      reference: nextReference(),
      title: 'Water leaking from the shower mixer',
      description:
        'The hot shower drips constantly and there is water staining on the bathroom ceiling below.',
      category: MaintenanceCategory.PLUMBING,
      priority: WorkOrderPriority.HIGH,
      status: WorkOrderStatus.IN_PROGRESS,
      source: WorkOrderSource.TENANT_PORTAL,
      reportedAt: new Date(now - 3 * day),
      startedAt: new Date(now - day),
      inspectionNote: 'Cartridge worn; the whole mixer is due for replacement.',
      propertyId: first.propertyId,
      unitId: first.unitId,
      ...(first.tenantId ? { tenantId: first.tenantId } : {}),
      ...(assignee ? { assignedTechnicianId: assignee } : {}),
      accessInstructions: 'Key box by the main gate, code given at reception.',
      estimatedCost: 6500,
      tasks: {
        create: [
          {
            organizationId,
            description: 'Isolate the water supply to the bathroom',
            sortOrder: 0,
            isDone: true,
            completedAt: new Date(now - day),
            ...(assignee ? { completedById: assignee } : {}),
          },
          {
            organizationId,
            description: 'Replace the cartridge and re-seat the handle',
            sortOrder: 1,
            isDone: false,
          },
          {
            organizationId,
            description: 'Check the seal and test for 10 minutes',
            sortOrder: 2,
            isDone: false,
          },
        ],
      },
    },
  });

  await prisma.workOrder.create({
    data: {
      organizationId,
      reference: nextReference(),
      title: 'Bedroom socket not working',
      description:
        'The socket beside the bed has no power. The one in the hallway is fine.',
      category: MaintenanceCategory.ELECTRICAL,
      priority: WorkOrderPriority.NORMAL,
      status: WorkOrderStatus.ASSIGNED,
      source: WorkOrderSource.STAFF,
      reportedAt: new Date(now - 2 * day),
      scheduledFor: new Date(now + day),
      inspectionNote:
        'Likely a failed socket; will replace if the circuit is sound.',
      propertyId: second.propertyId,
      unitId: second.unitId,
      ...(second.tenantId ? { tenantId: second.tenantId } : {}),
      ...(assignee ? { assignedTechnicianId: assignee } : {}),
      estimatedCost: 1800,
    },
  });

  await prisma.workOrder.create({
    data: {
      organizationId,
      reference: nextReference(),
      title: 'Gate lamp flickering at night',
      description:
        'The lamp above the main gate flickers for the first ten minutes after dark.',
      category: MaintenanceCategory.ELECTRICAL,
      priority: WorkOrderPriority.LOW,
      status: WorkOrderStatus.INSPECTION,
      source: WorkOrderSource.STAFF,
      reportedAt: new Date(now - 9 * day),
      inspectionNote:
        'Failing driver rather than the lamp itself. Needs an electrician.',
      propertyId: first.propertyId,
      estimatedCost: 4200,
    },
  });

  await prisma.workOrder.create({
    data: {
      organizationId,
      reference: nextReference(),
      title: 'Burst pipe in the storeroom',
      description:
        'Water is coming through the ceiling of the ground-floor storeroom. Seems to be the water tank feed.',
      category: MaintenanceCategory.PLUMBING,
      priority: WorkOrderPriority.EMERGENCY,
      status: WorkOrderStatus.REQUESTED,
      source: WorkOrderSource.STAFF,
      reportedAt: new Date(now - 6 * 3_600_000),
      propertyId: first.propertyId,
      accessInstructions:
        'Storeroom key is with the caretaker; gate code 4417.',
    },
  });

  await prisma.workOrder.create({
    data: {
      organizationId,
      reference: nextReference(),
      title: 'Window handle broken in the lounge',
      description: 'The lounge window will not latch shut.',
      category: MaintenanceCategory.OTHER,
      priority: WorkOrderPriority.NORMAL,
      status: WorkOrderStatus.COMPLETED,
      source: WorkOrderSource.TENANT_PORTAL,
      reportedAt: new Date(now - 12 * day),
      startedAt: new Date(now - 10 * day),
      completedAt: new Date(now - 9 * day),
      inspectionNote: 'Handle mechanism broken; the frame is fine.',
      resolutionNote:
        'Replaced the handle mechanism and latched the sash. Tested closed.',
      propertyId: second.propertyId,
      unitId: second.unitId,
      ...(second.tenantId ? { tenantId: second.tenantId } : {}),
      ...(assignee ? { assignedTechnicianId: assignee } : {}),
      estimatedCost: 2400,
      actualCost: 1800,
    },
  });

  await prisma.workOrder.create({
    data: {
      organizationId,
      reference: nextReference(),
      title: 'Repaint the stairwell landing',
      description: 'Requested after the last water incident.',
      category: MaintenanceCategory.PAINTING,
      priority: WorkOrderPriority.LOW,
      status: WorkOrderStatus.CANCELLED,
      source: WorkOrderSource.STAFF,
      reportedAt: new Date(now - 20 * day),
      cancelledAt: new Date(now - 15 * day),
      cancellationReason:
        'Duplicated by the refurbishment work already booked with the contractor.',
    },
  });

  // One completed preventive service, so the asset's service history has
  // something in it before the sweep has ever run.
  const completedSchedule = schedules[0];
  if (completedSchedule && asset) {
    const servedOn = new Date(now - 26 * day);
    await prisma.workOrder.create({
      data: {
        organizationId,
        reference: nextReference(),
        title: `${completedSchedule.title} — ${asset.name}`,
        description:
          'Scheduled preventive maintenance carried out by the site technician.',
        category: MaintenanceCategory.ELECTRICAL,
        priority: WorkOrderPriority.NORMAL,
        status: WorkOrderStatus.CLOSED,
        source: WorkOrderSource.PREVENTIVE,
        reportedAt: servedOn,
        startedAt: servedOn,
        completedAt: servedOn,
        closedAt: servedOn,
        inspectionNote: 'Routine service as scheduled.',
        resolutionNote:
          'Oil and filters changed, belts and battery checked, load test passed.',
        propertyId: asset.propertyId,
        assetId: asset.id,
        ...(assignee ? { assignedTechnicianId: assignee } : {}),
        actualCost: 9500,
        pmScheduleId: completedSchedule.id,
        pmDueOn: new Date(
          Date.UTC(
            servedOn.getUTCFullYear(),
            servedOn.getUTCMonth(),
            servedOn.getUTCDate(),
          ),
        ),
      },
    });

    await prisma.preventiveMaintenanceSchedule.update({
      where: { id: completedSchedule.id },
      data: { lastRunAt: servedOn },
    });
  }

  // A record that the sweep ran, so the schedule page shows a history rather
  // than an empty state on a fresh database.
  await prisma.preventiveMaintenanceRun.create({
    data: {
      organizationId,
      runOn: new Date(now - 26 * day),
      status: 'COMPLETED',
      schedulesConsidered: 4,
      workOrdersCreated: 1,
      schedulesSkipped: 3,
      schedulesFailed: 0,
      details: {
        [completedSchedule?.id ?? 'pm-1']: 'raised WO-2026-0007',
      },
      triggeredBy: 'scheduled',
      startedAt: new Date(now - 26 * day),
      finishedAt: new Date(now - 26 * day),
    },
  });

  console.log(
    `  Maintenance: ${assets.length} assets, ${schedules.length} schedules, ${reference - 1} work orders`,
  );
}

/**
 * Module 10 — the purchase cycle, seeded end to end.
 *
 * The point of this is that the demo shows the *whole* pipeline rather than four
 * empty list pages: an approved request, an RFQ with three quotations waiting,
 * one awarded round with an order part-delivered, and a completed order whose
 * bill has not been raised yet (which is a legitimate state and the one
 * `awaitingBill` counts).
 *
 * Suppliers are created with `PrismaService`-shaped writes rather than through
 * `PayablesService`, because the seed runs outside Nest and the bill for a
 * purchase order is deliberately *not* created here: posting a ledger entry
 * from a seed would produce a bill with no journal entry behind it, which is
 * worse than no bill.
 */
async function generateProcurementData(
  prisma: PrismaClient,
  organizationId: string,
) {
  const procurementOfficer = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.PROCUREMENT_OFFICER },
    select: { id: true },
  });
  const maintenanceManager = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.MAINTENANCE_MANAGER },
    select: { id: true },
  });
  const requester = procurementOfficer?.id ?? maintenanceManager?.id;
  if (!requester) return;

  // `Supplier.code` is globally unique, not unique per organization, so the
  // sequence is allocated across every supplier in the database and skips any
  // code already taken. Counting only this organization's rows — the way
  // `PayablesService.nextSupplierCode` does — collides the moment a second
  // tenant has suppliers, which is exactly what the two-org demo does.
  const existingCodes = new Set(
    (await prisma.supplier.findMany({ select: { code: true } })).map(
      (row) => row.code,
    ),
  );
  let code = 1;
  const nextCode = () => {
    let candidate = `SUP-${String(code).padStart(4, '0')}`;
    while (existingCodes.has(candidate)) {
      code += 1;
      candidate = `SUP-${String(code).padStart(4, '0')}`;
    }
    code += 1;
    existingCodes.add(candidate);
    return candidate;
  };

  const supplierPlan: {
    name: string;
    category: SupplierCategory;
    email: string;
    phone: string;
    paymentTermsDays: number;
    rating?: number;
    underContract?: boolean;
  }[] = [
    {
      name: 'Nairobi Lift Services Ltd',
      category: SupplierCategory.MECHANICAL,
      email: 'orders@nairobilift.example',
      phone: '+254700200001',
      paymentTermsDays: 30,
      rating: 5,
      underContract: true,
    },
    {
      name: 'Hoist Kenya Engineering',
      category: SupplierCategory.MECHANICAL,
      email: 'quotes@hoistkenya.example',
      phone: '+254700200002',
      paymentTermsDays: 14,
    },
    {
      name: 'Tamarind Plumbing Supplies',
      category: SupplierCategory.PLUMBING,
      email: 'sales@tamarindplumbing.example',
      phone: '+254700200003',
      paymentTermsDays: 7,
      rating: 4,
      underContract: true,
    },
    {
      name: 'Eastleigh Electricals',
      category: SupplierCategory.ELECTRICAL,
      email: 'info@eastleighelectricals.example',
      phone: '+254700200004',
      paymentTermsDays: 30,
    },
    {
      name: 'Acacia Office Furniture',
      category: SupplierCategory.FURNITURE,
      email: 'trade@acaciafurniture.example',
      phone: '+254700200005',
      paymentTermsDays: 45,
    },
    {
      name: 'Cleanpro Services',
      category: SupplierCategory.CLEANING,
      email: 'hello@cleanpro.example',
      phone: '+254700200006',
      paymentTermsDays: 21,
      rating: 3,
    },
  ];

  const suppliers: { id: string; name: string }[] = [];
  const day = 86_400_000;
  const now = Date.now();

  for (const plan of supplierPlan) {
    const supplier = await prisma.supplier.create({
      data: {
        organizationId,
        code: nextCode(),
        name: plan.name,
        status: SupplierStatus.ACTIVE,
        email: plan.email,
        phone: plan.phone,
        city: 'Nairobi',
        country: 'Kenya',
        category: plan.category,
        paymentTermsDays: plan.paymentTermsDays,
        vatRegistered: true,
        ...(plan.rating !== undefined ? { rating: plan.rating } : {}),
        ...(plan.underContract
          ? {
              contractStartDate: new Date(now - 200 * day),
              contractEndDate: new Date(now + 160 * day),
              contractReference: `SVC-${new Date().getFullYear()}-${String(
                supplierPlan.indexOf(plan) + 1,
              ).padStart(2, '0')}`,
            }
          : {}),
      },
      select: { id: true, name: true },
    });
    suppliers.push(supplier);
  }

  const [lifts, hoist, plumbing, electrical, furniture, cleaning] = suppliers;

  // ── 1. An approved request, quoted for, awarded, ordered part-delivered ──
  const approvedRequest = await prisma.purchaseRequest.create({
    data: {
      organizationId,
      reference: `PR-${new Date().getFullYear()}-0001`,
      title: 'Lift ropes and seals for Tamarind Court',
      description:
        'The lift at Tamarind Court is within its service interval and the ropes show wire fatigue. Two sets, six metre, plus a seal kit.',
      category: PurchaseCategory.MAINTENANCE_PARTS,
      priority: PurchasePriority.HIGH,
      status: PurchaseRequestStatus.APPROVED,
      department: 'Maintenance',
      neededBy: new Date(now + 45 * day),
      estimatedAmount: 210000,
      currency: 'KES',
      approvalRequestedAt: new Date(now - 40 * day),
      decidedAt: new Date(now - 39 * day),
      decidedById: requester,
      decisionNote: 'Agreed — the service report recommends it this quarter.',
      requestedById: requester,
      createdAt: new Date(now - 41 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Lift ropes, 6m, 8mm',
            specification: 'Certified to the manufacturer’s specification.',
            quantity: 2,
            unitPrice: 90000,
            estimatedAmount: 180000,
            sortOrder: 0,
          },
          {
            organizationId,
            description: 'Seal kit for the lift door rollers',
            quantity: 1,
            unitPrice: 30000,
            estimatedAmount: 30000,
            sortOrder: 1,
          },
        ],
      },
    },
    include: { lines: true },
  });

  const awardedRfq = await prisma.rfq.create({
    data: {
      organizationId,
      reference: `RFQ-${new Date().getFullYear()}-0001`,
      title: 'Lift ropes and door roller seals',
      notes: 'Delivery to site; installation quoted separately.',
      status: RfqStatus.AWARDED,
      currency: 'KES',
      quotesDueAt: new Date(now - 32 * day),
      issuedAt: new Date(now - 38 * day),
      closedAt: new Date(now - 30 * day),
      awardedAt: new Date(now - 30 * day),
      purchaseRequestId: approvedRequest.id,
      raisedById: requester,
      createdAt: new Date(now - 39 * day),
    },
  });

  for (const supplier of [lifts, hoist, plumbing]) {
    await prisma.rfqInvitation.create({
      data: {
        organizationId,
        rfqId: awardedRfq.id,
        supplierId: supplier.id,
        status: 'QUOTED',
        invitedAt: new Date(now - 38 * day),
        respondedAt: new Date(now - 34 * day),
      },
    });
  }

  // Cheapest, but not the fastest — which is exactly the case the comparison
  // view refuses to recommend, so the demo shows a judgement call rather than
  // the module always pointing at a winner.
  const winningQuote = await prisma.rfqQuote.create({
    data: {
      organizationId,
      rfqId: awardedRfq.id,
      supplierId: hoist.id,
      status: QuoteStatus.AWARDED,
      totalAmount: 196000,
      currency: 'KES',
      leadTimeDays: 10,
      validUntil: new Date(now + 30 * day),
      notes: 'Includes delivery; ropes certified.',
      submittedAt: new Date(now - 33 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Lift ropes and door roller seals, delivered',
            quantity: 1,
            unitPrice: 196000,
            amount: 196000,
            purchaseRequestLineId: approvedRequest.lines[0].id,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.rfqQuote.create({
    data: {
      organizationId,
      rfqId: awardedRfq.id,
      supplierId: lifts.id,
      status: QuoteStatus.REJECTED,
      totalAmount: 188000,
      currency: 'KES',
      leadTimeDays: 35,
      validUntil: new Date(now + 20 * day),
      submittedAt: new Date(now - 34 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Lift ropes and door roller seals, delivered',
            quantity: 1,
            unitPrice: 188000,
            amount: 188000,
            purchaseRequestLineId: approvedRequest.lines[0].id,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // A declined invitation, so the supplier's view shows why they were dropped
  // rather than silently vanishing from the round.
  await prisma.rfqInvitation.update({
    where: {
      rfqId_supplierId: { rfqId: awardedRfq.id, supplierId: plumbing.id },
    },
    data: {
      status: 'DECLINED',
      respondedAt: new Date(now - 34 * day),
      declineReason:
        'Ropes are not something we stock; try the lift specialists.',
    },
  });

  await prisma.rfq.update({
    where: { id: awardedRfq.id },
    data: { awardedQuoteId: winningQuote.id },
  });

  const partDeliveredOrder = await prisma.purchaseOrder.create({
    data: {
      organizationId,
      reference: `PO-${new Date().getFullYear()}-0001`,
      supplierId: hoist.id,
      status: PurchaseOrderStatus.PARTIALLY_RECEIVED,
      category: PurchaseCategory.MAINTENANCE_PARTS,
      currency: 'KES',
      subtotal: 196000,
      taxAmount: 0,
      totalAmount: 196000,
      orderDate: new Date(now - 29 * day),
      expectedDelivery: new Date(now - 9 * day),
      deliveryAddress: 'Tamarind Court, Nairobi',
      terms: '30 days from invoice.',
      rfqId: awardedRfq.id,
      quoteId: winningQuote.id,
      purchaseRequestId: approvedRequest.id,
      raisedById: requester,
      sentAt: new Date(now - 29 * day),
      acceptedAt: new Date(now - 28 * day),
      createdAt: new Date(now - 29 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Lift ropes and door roller seals, delivered',
            quantity: 1,
            unitPrice: 196000,
            amount: 196000,
            // Half arrived. Deliberately not "received": the demo needs a
            // part-delivered order so `awaitingBill` and the outstanding
            // figures have something real in them.
            receivedQuantity: 0.5,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { lines: true },
  });

  await prisma.goodsReceipt.create({
    data: {
      organizationId,
      purchaseOrderId: partDeliveredOrder.id,
      receivedAt: new Date(now - 9 * day),
      deliveryNote: 'DN-44821',
      conditionNote: 'One crate and one loose roller assembly.',
      receivedById: maintenanceManager?.id ?? requester,
      lines: {
        create: [
          {
            organizationId,
            purchaseOrderLineId: partDeliveredOrder.lines[0].id,
            quantity: 0.5,
          },
        ],
      },
    },
  });

  // ── 2. A completed order whose bill has not been raised yet ──────────────
  const secondRequest = await prisma.purchaseRequest.create({
    data: {
      organizationId,
      reference: `PR-${new Date().getFullYear()}-0002`,
      title: 'Reception chairs for Westgate',
      description: 'Two of the four reception chairs have failed.',
      category: PurchaseCategory.FURNITURE,
      priority: PurchasePriority.NORMAL,
      status: PurchaseRequestStatus.APPROVED,
      department: 'Front Office',
      currency: 'KES',
      estimatedAmount: 60000,
      decidedAt: new Date(now - 60 * day),
      decidedById: requester,
      requestedById: requester,
      createdAt: new Date(now - 61 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Reception chair, contract grade',
            quantity: 4,
            unitPrice: 15000,
            estimatedAmount: 60000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const deliveredOrder = await prisma.purchaseOrder.create({
    data: {
      organizationId,
      reference: `PO-${new Date().getFullYear()}-0002`,
      supplierId: furniture.id,
      status: PurchaseOrderStatus.RECEIVED,
      category: PurchaseCategory.FURNITURE,
      currency: 'KES',
      subtotal: 58000,
      taxAmount: 0,
      totalAmount: 58000,
      orderDate: new Date(now - 55 * day),
      expectedDelivery: new Date(now - 40 * day),
      deliveryAddress: 'Westgate offices, Nairobi',
      purchaseRequestId: secondRequest.id,
      raisedById: requester,
      sentAt: new Date(now - 55 * day),
      acceptedAt: new Date(now - 54 * day),
      receivedAt: new Date(now - 42 * day),
      createdAt: new Date(now - 55 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Reception chair, contract grade',
            quantity: 4,
            unitPrice: 14500,
            amount: 58000,
            receivedQuantity: 4,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { lines: true },
  });

  await prisma.goodsReceipt.create({
    data: {
      organizationId,
      purchaseOrderId: deliveredOrder.id,
      receivedAt: new Date(now - 42 * day),
      deliveryNote: 'DN-51002',
      receivedById: maintenanceManager?.id ?? requester,
      lines: {
        create: [
          {
            organizationId,
            purchaseOrderLineId: deliveredOrder.lines[0].id,
            quantity: 4,
          },
        ],
      },
    },
  });

  // ── 3. An RFQ still collecting answers, including a decline ──────────────
  const thirdRequest = await prisma.purchaseRequest.create({
    data: {
      organizationId,
      reference: `PR-${new Date().getFullYear()}-0003`,
      title: 'Quarterly deep clean, all common areas',
      description:
        'Twice-quarterly contract clean for the common areas of the managed buildings.',
      category: PurchaseCategory.CLEANING,
      priority: PurchasePriority.LOW,
      status: PurchaseRequestStatus.APPROVED,
      department: 'Operations',
      currency: 'KES',
      estimatedAmount: 240000,
      decidedAt: new Date(now - 12 * day),
      decidedById: requester,
      requestedById: requester,
      createdAt: new Date(now - 13 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Quarterly deep clean, per building',
            quantity: 12,
            unitPrice: 20000,
            estimatedAmount: 240000,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { lines: true },
  });

  const openRfq = await prisma.rfq.create({
    data: {
      organizationId,
      reference: `RFQ-${new Date().getFullYear()}-0002`,
      title: 'Quarterly deep clean, 12 buildings',
      notes: 'Quotes to include chemicals and a supervisor.',
      status: RfqStatus.QUOTES_RECEIVED,
      currency: 'KES',
      quotesDueAt: new Date(now + 7 * day),
      issuedAt: new Date(now - 10 * day),
      purchaseRequestId: thirdRequest.id,
      raisedById: requester,
      createdAt: new Date(now - 11 * day),
    },
  });

  for (const supplier of [cleaning, electrical]) {
    await prisma.rfqInvitation.create({
      data: {
        organizationId,
        rfqId: openRfq.id,
        supplierId: supplier.id,
        status: 'INVITED',
        invitedAt: new Date(now - 10 * day),
      },
    });
  }

  await prisma.rfqQuote.create({
    data: {
      organizationId,
      rfqId: openRfq.id,
      supplierId: cleaning.id,
      status: QuoteStatus.SUBMITTED,
      totalAmount: 228000,
      currency: 'KES',
      leadTimeDays: 14,
      validUntil: new Date(now + 45 * day),
      submittedAt: new Date(now - 4 * day),
      lines: {
        create: [
          {
            organizationId,
            description:
              'Quarterly deep clean, 12 buildings, chemicals included',
            quantity: 1,
            unitPrice: 228000,
            amount: 228000,
            purchaseRequestLineId: thirdRequest.lines[0].id,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  // ── 4. The unhappy states, so the queues are not empty ───────────────────
  await prisma.purchaseRequest.create({
    data: {
      organizationId,
      reference: `PR-${new Date().getFullYear()}-0004`,
      title: 'Borehole pump replacement parts',
      description: 'Awaiting the contractor’s report before pricing.',
      category: PurchaseCategory.MAINTENANCE_PARTS,
      priority: PurchasePriority.URGENT,
      status: PurchaseRequestStatus.PENDING,
      department: 'Maintenance',
      neededBy: new Date(now + 14 * day),
      requestedById: maintenanceManager?.id ?? requester,
      createdAt: new Date(now - 2 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Borehole pump seal and bearing kit',
            quantity: 1,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.purchaseRequest.create({
    data: {
      organizationId,
      reference: `PR-${new Date().getFullYear()}-0005`,
      title: 'Air conditioners for the guard houses',
      description: 'Two units, one per guard house.',
      category: PurchaseCategory.EQUIPMENT,
      priority: PurchasePriority.NORMAL,
      status: PurchaseRequestStatus.REJECTED,
      department: 'Maintenance',
      currency: 'KES',
      estimatedAmount: 180000,
      rejectionReason:
        'Deferred to next financial year — the guard houses have fans for now.',
      decisionNote:
        'Deferred to next financial year — the guard houses have fans for now.',
      decidedAt: new Date(now - 20 * day),
      decidedById: requester,
      requestedById: maintenanceManager?.id ?? requester,
      createdAt: new Date(now - 22 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Split unit, 12000 BTU',
            quantity: 2,
            unitPrice: 90000,
            estimatedAmount: 180000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  await prisma.purchaseRequest.create({
    data: {
      organizationId,
      reference: `PR-${new Date().getFullYear()}-0006`,
      title: 'Bulk stationery order (draft)',
      description:
        'Started and not finished; the figures still need confirming.',
      category: PurchaseCategory.STATIONERY,
      priority: PurchasePriority.LOW,
      status: PurchaseRequestStatus.DRAFT,
      department: 'Administration',
      currency: 'KES',
      requestedById: requester,
      createdAt: new Date(now - 1 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'A4 paper, carton',
            quantity: 20,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const sentOrder = await prisma.purchaseOrder.create({
    data: {
      organizationId,
      reference: `PO-${new Date().getFullYear()}-0003`,
      supplierId: electrical.id,
      status: PurchaseOrderStatus.SENT,
      category: PurchaseCategory.MAINTENANCE_PARTS,
      currency: 'KES',
      subtotal: 42000,
      taxAmount: 0,
      totalAmount: 42000,
      orderDate: new Date(now - 6 * day),
      expectedDelivery: new Date(now + 4 * day),
      deliveryAddress: 'Tamarind Court, Nairobi',
      raisedById: requester,
      sentAt: new Date(now - 6 * day),
      createdAt: new Date(now - 6 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Gate lamp fittings and drivers',
            quantity: 6,
            unitPrice: 7000,
            amount: 42000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  const overdueOrder = await prisma.purchaseOrder.create({
    data: {
      organizationId,
      reference: `PO-${new Date().getFullYear()}-0004`,
      supplierId: plumbing.id,
      status: PurchaseOrderStatus.ACCEPTED,
      category: PurchaseCategory.MAINTENANCE_PARTS,
      currency: 'KES',
      subtotal: 78000,
      taxAmount: 0,
      totalAmount: 78000,
      orderDate: new Date(now - 40 * day),
      // Promised three weeks ago and still nothing: the `overdue` figure the
      // list derives from the date rather than stores.
      expectedDelivery: new Date(now - 21 * day),
      deliveryAddress: 'Tamarind Court, Nairobi',
      raisedById: requester,
      sentAt: new Date(now - 40 * day),
      acceptedAt: new Date(now - 39 * day),
      createdAt: new Date(now - 40 * day),
      lines: {
        create: [
          {
            organizationId,
            description: 'Replacement booster pump set',
            quantity: 1,
            unitPrice: 78000,
            amount: 78000,
            sortOrder: 0,
          },
        ],
      },
    },
  });

  void sentOrder;
  void overdueOrder;

  console.log(
    `  Procurement: ${suppliers.length} suppliers, 6 purchase requests, 2 RFQs, 4 purchase orders`,
  );
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
    await prisma.workflowEvent.deleteMany();
    await prisma.workflowStep.deleteMany();
    await prisma.workflowInstance.deleteMany();
    await prisma.workflowDelegation.deleteMany();
    // Platform defaults (organizationId = null) survive, exactly like system roles.
    await prisma.workflowDefinition.deleteMany({
      where: { organizationId: { not: null } },
    });
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
    // Module 10: procurement runs request → RFQ → quote → order → receipt, and
    // every one of those tables points at the one before it, so they are cleared
    // child-first. Suppliers themselves survive (nothing above clears them), which
    // is why their codes keep counting up rather than restarting at SUP-0001.
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
    // Module 9: work orders point at properties, units, tenants, assets and users,
    // and preventive schedules point at assets, so all of it is cleared before the
    // tables they hang off. The order here is the only thing keeping this seed
    // from tripping a foreign key on the second run.
    await prisma.workOrderTask.deleteMany();
    await prisma.workOrder.deleteMany();
    await prisma.preventiveMaintenanceRun.deleteMany();
    await prisma.preventiveMaintenanceSchedule.deleteMany();
    await prisma.asset.deleteMany();
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

    // The two roles a two-level approval needs on the Rohi side (Module 18).
    //
    // Rohi previously had a single staff account, which made a multi-level
    // approval impossible to demonstrate — there was nobody to hold the second
    // role. Both also get explicit `RoleAssignment` rows, because role *names*
    // are still not mapped onto the `UserRole` enum (master doc issue 51) and
    // the workflow engine matches on the name.
    await prisma.user.create({
      data: {
        email: 'finance@rohi.co.ke',
        firstName: 'Ruhi',
        lastName: 'Finance',
        phone: '+254700000006',
        passwordHash,
        role: UserRole.ACCOUNTANT,
        organizationId: rohiOrg.id,
      },
    });

    await prisma.user.create({
      data: {
        email: 'manager@rohi.co.ke',
        firstName: 'Rohi',
        lastName: 'Operations',
        phone: '+254700000007',
        passwordHash,
        role: UserRole.PROPERTY_MANAGER,
        organizationId: rohiOrg.id,
      },
    });

    // Maintenance staff (Module 9). Until these existed there was nobody a work
    // order could be assigned to — the seeded Maintenance Manager and Technician
    // roles had permissions nobody held, which is the same hole Module 5 found
    // for the leasing role (master doc issues 51/54).
    const maintenanceStaff = [
      {
        email: 'maintenance@rohi.co.ke',
        firstName: 'Mercy',
        lastName: 'Achieng',
        phone: '+254700000008',
        role: UserRole.MAINTENANCE_MANAGER,
        organizationId: rohiOrg.id,
      },
      {
        email: 'technician@rohi.co.ke',
        firstName: 'Daniel',
        lastName: 'Mutua',
        phone: '+254700000009',
        role: UserRole.TECHNICIAN,
        organizationId: rohiOrg.id,
      },
      {
        email: 'maintenance@westhill.co.ke',
        firstName: 'Grace',
        lastName: 'Njeri',
        phone: '+254700000010',
        role: UserRole.MAINTENANCE_MANAGER,
        organizationId: defaultOrg.id,
      },
      {
        email: 'technician@westhill.co.ke',
        firstName: 'Peter',
        lastName: 'Kariuki',
        phone: '+254700000011',
        role: UserRole.TECHNICIAN,
        organizationId: defaultOrg.id,
      },
      // Procurement officers (Module 10). Same hole as above: the seeded
      // Procurement Officer role had permissions nobody could hold, so there was
      // no login that could raise an RFQ or award a quotation. Both organizations
      // get one, because the RFQ supplier picker is tenant-scoped and a
      // single-tenant demo cannot demonstrate a cross-tenant refusal.
      {
        email: 'procurement@rohi.co.ke',
        firstName: 'Nia',
        lastName: 'Wanjiru',
        phone: '+254700000012',
        role: UserRole.PROCUREMENT_OFFICER,
        organizationId: rohiOrg.id,
      },
      {
        email: 'procurement@westhill.co.ke',
        firstName: 'Samuel',
        lastName: 'Otieno',
        phone: '+254700000013',
        role: UserRole.PROCUREMENT_OFFICER,
        organizationId: defaultOrg.id,
      },
    ];
    for (const staff of maintenanceStaff) {
      await prisma.user.create({ data: { passwordHash, ...staff } });
    }

    // Structured role assignments for every staff login, so the role matrix is
    // real in the demo rather than only implied by the legacy enum.
    const systemRoles = await prisma.role.findMany({
      where: { organizationId: null },
      select: { id: true, name: true },
    });
    const staffRoleAssignments: {
      email: string;
      roleName: string;
    }[] = [
      { email: 'admin@westhill.co.ke', roleName: 'Company Admin' },
      { email: 'manager@westhill.co.ke', roleName: 'Property Manager' },
      { email: 'accountant@westhill.co.ke', roleName: 'Accountant' },
      { email: 'admin@rohi.co.ke', roleName: 'Company Admin' },
      { email: 'manager@rohi.co.ke', roleName: 'Property Manager' },
      { email: 'finance@rohi.co.ke', roleName: 'Accountant' },
      { email: 'maintenance@rohi.co.ke', roleName: 'Maintenance Manager' },
      { email: 'technician@rohi.co.ke', roleName: 'Technician' },
      { email: 'maintenance@westhill.co.ke', roleName: 'Maintenance Manager' },
      { email: 'technician@westhill.co.ke', roleName: 'Technician' },
      { email: 'procurement@rohi.co.ke', roleName: 'Procurement Officer' },
      { email: 'procurement@westhill.co.ke', roleName: 'Procurement Officer' },
    ];
    for (const assignment of staffRoleAssignments) {
      const user = await prisma.user.findUnique({
        where: { email: assignment.email },
        select: { id: true },
      });
      const role = systemRoles.find(
        (candidate) => candidate.name === assignment.roleName,
      );
      if (!user || !role) continue;
      await prisma.roleAssignment.create({
        data: { userId: user.id, roleId: role.id },
      });
    }

    // Generate demo data for Rohi Estate Management
    await generateDemoData(prisma, rohiOrg.id);

    // Plant register, service intervals and a work-order queue (Module 9).
    await generateMaintenanceData(prisma, rohiOrg.id);

    // Suppliers, purchase requests, quotation rounds and purchase orders
    // (Module 10). After maintenance, because the seeded requests are raised by
    // the maintenance team — the usual case for the parts purchases.
    await generateProcurementData(prisma, rohiOrg.id);

    // Approval policies and sample requests (Module 18). After the data, so a
    // real payment exists for the refund requests to point at.
    await generateWorkflowData(prisma, rohiOrg.id);

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
