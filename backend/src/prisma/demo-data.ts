import {
  PrismaClient,
  Prisma,
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
  InventoryCategory,
  StockMovementType,
  EmploymentType,
  LeaveStatus,
  LeaveType,
  PayFrequency,
  PayrollLineDirection,
  PayrollRunStatus,
  // Module 13 — Facilities
  AccessCardHolder,
  AccessCardStatus,
  AccessCardType,
  FacilityBookingStatus,
  FacilityKind,
  // Module 14 — Utilities
  ApportionmentMethod,
  MeterReadingSource,
  MeterScope,
  MeterStatus,
  UtilityChargeStatus,
  UtilityType,
  // Module 15 - Documents & Legal
  ContractType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as path from 'path';
import * as fsp from 'fs/promises';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import {
  PROPERTY_CATEGORIES,
  PROPERTY_TYPES,
  UNIT_TYPES,
} from '@/common/contants';
import { seedRoles } from './roles-seed';
import { seedPayrollRules } from './payroll-rules-seed';
import {
  computePayslip,
  type PayBand,
  type PayComponentInput,
  type PayEarning,
} from '../modules/hr/payroll-calc';
import { DEFAULT_CHART_OF_ACCOUNTS } from '../modules/finance/accounting/chart-of-accounts';

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

/**
 * Module 11 — the maintenance store, seeded as a working ledger.
 *
 * The important part of this is not the item list, it is the *arrangement*: the
 * movements are laid out so every state the module can be in is reachable from
 * the demo without editing a row.
 *
 * - **One item is exactly at its reorder level** — so the "below reorder" list can
 *   be seen to be a `<` and not a `<=`.
 * - **One is empty, one is below, and one has drifted *negative*** — the negative
 *   is deliberate and is the case the module refuses to paper over: the books say
 *   there is less than nothing here, which is a stock take's problem, not a
 *   purchase order's.
 * - **Two receipt lines from Module 10's purchase orders are booked in**, so the
 *   procurement seam shows `booked` as well as `pending`, and one PO's line is
 *   deliberately left waiting so the stock-in screen has something to do.
 * - **A work order has consumed material and part of it came back**, which is the
 *   shape a real job has and the only way the "put back" path is visible.
 * - **A transfer pair exists**, so both halves of a transfer can be seen to net
 *   to zero across the two stores.
 *
 * Balances are never written: every one of them is the sum of the rows below, which
 * is the whole design of the module and the reason a "fix the demo data" edit is
 * never needed.
 */
async function generateInventoryData(
  prisma: PrismaClient,
  organizationId: string,
) {
  const day = 86_400_000;
  const now = Date.now();

  const technician = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.TECHNICIAN },
    select: { id: true },
  });
  const maintenanceManager = await prisma.user.findFirst({
    where: { organizationId, role: UserRole.MAINTENANCE_MANAGER },
    select: { id: true },
  });
  const actor = technician?.id ?? maintenanceManager?.id;
  if (!actor) return;

  // Suppliers were seeded by Module 10; the items name the one they are normally
  // bought from so the reorder list can say "order from X" without anybody
  // remembering.
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId },
    select: { id: true, name: true, category: true },
  });
  const supplierFor = (category: SupplierCategory) =>
    suppliers.find((row) => row.category === category)?.id;

  const mainStore = await prisma.warehouse.create({
    data: {
      organizationId,
      code: 'MAIN',
      name: 'Main store — Westgate offices',
      address: 'Ground floor, Westgate House, Nairobi',
      phone: '+254700100100',
      isDefault: true,
      createdAt: new Date(now - 400 * day),
    },
  });

  const siteStore = await prisma.warehouse.create({
    data: {
      organizationId,
      code: 'SITE-T',
      name: 'Tamarind Court site store',
      address: 'Tamarind Court, Nairobi',
      phone: '+254700100101',
      notes: 'Held by the caretaker. Key from the property manager.',
      createdAt: new Date(now - 380 * day),
    },
  });

  const itemPlan: {
    sku: string;
    name: string;
    description?: string;
    category: InventoryCategory;
    unitOfMeasure: string;
    unitCost: number;
    reorderLevel: number;
    reorderQuantity?: number;
    supplier?: SupplierCategory;
    opening: number;
    /** Drawn down by issues, dated relative to today. */
    issues: { quantity: number; daysAgo: number }[];
    /** One count variance, where the demo needs the item to look wrong. */
    adjustment?: { quantity: number; daysAgo: number; reason: string };
    siteStoreQuantity?: number;
  }[] = [
    {
      sku: 'PNT-WHT-001',
      name: 'White emulsion paint, 20 litres',
      description: 'Interior matt, first grade. One tin covers roughly 250 m².',
      category: InventoryCategory.PAINT,
      unitOfMeasure: 'tin',
      unitCost: 18500,
      reorderLevel: 4,
      reorderQuantity: 6,
      supplier: SupplierCategory.CLEANING,
      opening: 9,
      // Down to 2, which is below the level of 4.
      issues: [
        { quantity: 3, daysAgo: 26 },
        { quantity: 2, daysAgo: 11 },
        { quantity: 2, daysAgo: 4 },
      ],
      siteStoreQuantity: 1,
    },
    {
      sku: 'PLMB-CPL-020',
      name: '20mm compression coupling',
      description:
        'Copper-to-copper, for the riser repairs on the older blocks.',
      category: InventoryCategory.PLUMBING,
      unitOfMeasure: 'piece',
      unitCost: 380,
      reorderLevel: 20,
      supplier: SupplierCategory.PLUMBING,
      opening: 64,
      issues: [
        { quantity: 14, daysAgo: 30 },
        { quantity: 22, daysAgo: 16 },
        { quantity: 18, daysAgo: 5 },
      ],
      // The count came up short and the books now disagree with the shelf.
      adjustment: {
        quantity: -6,
        daysAgo: 3,
        reason:
          'Stock take at the main store: counted 58, books said 64. Two taken for the Blue Ridge job without being signed out.',
      },
    },
    {
      sku: 'ELEC-TAP-013',
      name: '13A switched socket outlet',
      category: InventoryCategory.ELECTRICAL,
      unitOfMeasure: 'piece',
      unitCost: 420,
      reorderLevel: 10,
      supplier: SupplierCategory.ELECTRICAL,
      opening: 24,
      // Four left in the main store, two at the site. The list's status is on the
      // *total* across stores, deliberately: a reorder is bought once from a
      // supplier who delivers wherever, so an item that is comfortable in one
      // place and empty in another is one order, not two.
      issues: [
        { quantity: 5, daysAgo: 22 },
        { quantity: 6, daysAgo: 9 },
        { quantity: 9, daysAgo: 2 },
      ],
      siteStoreQuantity: 2,
    },
    {
      sku: 'BLD-CEM-050',
      name: 'Cement, 50 kg bag',
      category: InventoryCategory.BUILDING_MATERIALS,
      unitOfMeasure: 'bag',
      unitCost: 1150,
      reorderLevel: 30,
      supplier: SupplierCategory.PLUMBING,
      opening: 48,
      issues: [
        { quantity: 18, daysAgo: 19 },
        { quantity: 20, daysAgo: 6 },
      ],
      siteStoreQuantity: 12,
    },
    {
      sku: 'BLD-TIL-600',
      name: 'Ceramic floor tile, 600 × 600 mm',
      description: 'Glazed, matt finish. A box covers about 1.4 m².',
      category: InventoryCategory.TILES_FLOORING,
      unitOfMeasure: 'box',
      unitCost: 2400,
      // Exactly what is on the shelf after the issue below. The alert fires on a
      // *strict* drop below the level, so this item reads "in stock" right up
      // until one more box leaves — which is the behaviour worth demonstrating,
      // because the alternative alerts on every single movement.
      reorderLevel: 13,
      supplier: SupplierCategory.MECHANICAL,
      opening: 18,
      issues: [{ quantity: 5, daysAgo: 14 }],
    },
    {
      sku: 'BLD-PIP-110',
      name: '110 mm PVC waste pipe, 3 m',
      category: InventoryCategory.PLUMBING,
      unitOfMeasure: 'length',
      unitCost: 1650,
      reorderLevel: 8,
      supplier: SupplierCategory.PLUMBING,
      // 14 in, 11 issued to jobs, 3 moved to the site store. The main store ends
      // at exactly zero, which is the state where "do we have any?" and "how many
      // do we have?" have different answers and the reorder list matters most.
      opening: 14,
      issues: [
        { quantity: 4, daysAgo: 34 },
        { quantity: 5, daysAgo: 17 },
        { quantity: 2, daysAgo: 8 },
      ],
      siteStoreQuantity: 3,
    },
    {
      sku: 'HRD-SCR-008',
      name: 'Wood screws, 8 mm × 40 mm',
      category: InventoryCategory.HARDWARE,
      unitOfMeasure: 'box',
      unitCost: 850,
      reorderLevel: 5,
      supplier: SupplierCategory.ELECTRICAL,
      opening: 14,
      issues: [{ quantity: 3, daysAgo: 12 }],
      siteStoreQuantity: 4,
    },
    {
      sku: 'CLN-DET-005',
      name: 'Heavy-duty surface cleaner, 5 litres',
      category: InventoryCategory.CLEANING,
      unitOfMeasure: 'jerrycan',
      unitCost: 1250,
      reorderLevel: 6,
      supplier: SupplierCategory.CLEANING,
      opening: 8,
      issues: [{ quantity: 4, daysAgo: 7 }],
      // The deliberately broken one. The books end up at **minus five**, which is
      // the case the module refuses to paper over: a count cannot be negative in
      // the real world, so this is a data-entry problem, and the reorder
      // suggestion says so in as many words rather than cheerfully ordering more
      // cleaning fluid on top of an error. `checkMovement` allows it only because
      // an ADJUSTMENT is the one movement permitted to record that the books are
      // the thing that is wrong.
      adjustment: {
        quantity: -9,
        daysAgo: 2,
        reason:
          'Stock take at the main store: counted nothing at all — the shelf is empty and the books said four. Someone has been taking it without signing it out.',
      },
    },
    {
      sku: 'SAF-EXT-002',
      name: 'Fire extinguisher service tag',
      description: 'The annual service label. Cheap, consumed one per unit.',
      category: InventoryCategory.SAFETY,
      unitOfMeasure: 'piece',
      unitCost: 120,
      reorderLevel: 25,
      supplier: SupplierCategory.MECHANICAL,
      opening: 60,
      issues: [{ quantity: 28, daysAgo: 20 }],
    },
    {
      sku: 'HRD-BRC-003',
      name: 'Standard door closer',
      category: InventoryCategory.HARDWARE,
      unitOfMeasure: 'piece',
      unitCost: 3200,
      // No reorder level at all: tracked, never reordered automatically. The
      // status filter has to show this as OK rather than permanently empty.
      reorderLevel: 0,
      supplier: SupplierCategory.MECHANICAL,
      opening: 3,
      issues: [{ quantity: 1, daysAgo: 44 }],
    },
  ];

  const created = new Map<string, string>();
  let movementCount = 0;

  for (const plan of itemPlan) {
    const item = await prisma.inventoryItem.create({
      data: {
        organizationId,
        sku: plan.sku,
        name: plan.name,
        description: plan.description,
        category: plan.category,
        unitOfMeasure: plan.unitOfMeasure,
        unitCost: plan.unitCost,
        reorderLevel: plan.reorderLevel,
        reorderQuantity: plan.reorderQuantity,
        notes: undefined,
        ...(plan.supplier
          ? { preferredSupplierId: supplierFor(plan.supplier) }
          : {}),
        createdAt: new Date(now - 400 * day),
      },
    });

    created.set(plan.sku, item.id);

    const opening = await prisma.stockMovement.create({
      data: {
        organizationId,
        itemId: item.id,
        warehouseId: mainStore.id,
        quantity: plan.opening,
        type: StockMovementType.OPENING,
        unitCost: plan.unitCost,
        reason: 'Opening balance — stock counted when the store was set up',
        createdById: actor,
        createdAt: new Date(now - 395 * day),
      },
    });
    movementCount += 1;

    // A second, dearer purchase later on, so the weighted-average valuation has
    // something to average. Painting at one price forever would hide the whole
    // point of snapshotting the cost per movement.
    if (plan.reorderLevel > 0 && plan.opening > 20) {
      await prisma.stockMovement.create({
        data: {
          organizationId,
          itemId: item.id,
          warehouseId: mainStore.id,
          quantity: Math.round(plan.opening / 2),
          type: StockMovementType.GOODS_RECEIPT,
          unitCost: Math.round(plan.unitCost * 1.12 * 100) / 100,
          reason: 'Top-up purchase at the March price list',
          createdById: actor,
          createdAt: new Date(now - 70 * day),
        },
      });
      movementCount += 1;
    }

    for (const issue of plan.issues) {
      await prisma.stockMovement.create({
        data: {
          organizationId,
          itemId: item.id,
          warehouseId: mainStore.id,
          quantity: -issue.quantity,
          type: StockMovementType.WORK_ORDER_ISSUE,
          reason: 'Issued from the main store',
          createdById: actor,
          createdAt: new Date(now - issue.daysAgo * day),
        },
      });
      movementCount += 1;
    }

    if (plan.adjustment) {
      await prisma.stockMovement.create({
        data: {
          organizationId,
          itemId: item.id,
          warehouseId: mainStore.id,
          quantity: plan.adjustment.quantity,
          type: StockMovementType.ADJUSTMENT,
          reason: plan.adjustment.reason,
          createdById: actor,
          createdAt: new Date(now - plan.adjustment.daysAgo * day),
        },
      });
      movementCount += 1;
    }

    if (plan.siteStoreQuantity) {
      await prisma.stockMovement.create({
        data: {
          organizationId,
          itemId: item.id,
          warehouseId: siteStore.id,
          quantity: plan.siteStoreQuantity,
          type: StockMovementType.OPENING,
          unitCost: plan.unitCost,
          reason: 'Stocked at the site store when it opened',
          createdById: actor,
          createdAt: new Date(now - 300 * day),
        },
      });
      movementCount += 1;
    }

    void opening;
  }

  // ── A transfer: two rows, one group ─────────────────────────────────────
  const transferGroup = 'TRF-2026-DEMO01';
  const pipesId = created.get('BLD-PIP-110');
  const screwsId = created.get('HRD-SCR-008');
  for (const [itemId, quantity, fromName, toName] of [
    [pipesId, 3, 'Main store — Westgate offices', 'Tamarind Court site store'],
    [screwsId, 2, 'Main store — Westgate offices', 'Tamarind Court site store'],
  ] as const) {
    if (!itemId) continue;
    await prisma.stockMovement.create({
      data: {
        organizationId,
        itemId,
        warehouseId: mainStore.id,
        quantity: -quantity,
        type: StockMovementType.TRANSFER,
        transferGroup,
        reason: `Transfer to ${toName}`,
        createdById: actor,
        createdAt: new Date(now - 10 * day),
      },
    });
    await prisma.stockMovement.create({
      data: {
        organizationId,
        itemId,
        warehouseId: siteStore.id,
        quantity,
        type: StockMovementType.TRANSFER,
        transferGroup,
        reason: `Transfer from ${fromName}`,
        createdById: actor,
        createdAt: new Date(now - 10 * day),
      },
    });
    movementCount += 2;
  }

  // ── One job that took material, and part of it came back ─────────────────
  // Written against a real work order rather than a made-up reference: the item
  // page's "used on" list is only interesting if it points at jobs that exist.
  const job = await prisma.workOrder.findFirst({
    where: {
      organizationId,
      status: { not: WorkOrderStatus.CANCELLED },
      title: { contains: 'eplumbing' },
    },
    orderBy: { reportedAt: 'desc' },
    select: { id: true, reference: true, title: true },
  });

  if (job && pipesId && screwsId) {
    const issue = await prisma.stockMovement.create({
      data: {
        organizationId,
        itemId: pipesId,
        warehouseId: mainStore.id,
        quantity: -2,
        type: StockMovementType.WORK_ORDER_ISSUE,
        workOrderId: job.id,
        reason: `Issued to ${job.reference}: ${job.title}`,
        createdById: actor,
        createdAt: new Date(now - 8 * day),
      },
    });
    movementCount += 1;

    await prisma.stockMovement.create({
      data: {
        organizationId,
        itemId: screwsId,
        warehouseId: mainStore.id,
        quantity: -1,
        type: StockMovementType.WORK_ORDER_ISSUE,
        workOrderId: job.id,
        reason: `Issued to ${job.reference}: ${job.title}`,
        createdById: actor,
        createdAt: new Date(now - 8 * day),
      },
    });
    movementCount += 1;

    // One coupling came back: the wrong size was on the van. A return row rather
    // than editing the issue, so the ledger keeps saying what actually happened.
    await prisma.stockMovement.create({
      data: {
        organizationId,
        itemId: pipesId,
        warehouseId: mainStore.id,
        quantity: 1,
        type: StockMovementType.RETURN,
        workOrderId: job.id,
        reason: `Put back to the store from ${issue.id}`,
        createdById: actor,
        createdAt: new Date(now - 7 * day),
      },
    });
    movementCount += 1;
  }

  // ── The procurement seam, with a real receipt behind it ─────────────────
  // Module 10 seeded a part-delivered order and a delivered one. The lift ropes
  // are store stock, so that receipt line is booked in; the reception chair is
  // deliberately left pending, which is both honest (it is furniture for an
  // office, not a shelf) and the thing the stock-in screen needs to show work.
  const liftOrder = await prisma.purchaseOrder.findFirst({
    where: {
      organizationId,
      deliveries: { some: { lines: { some: {} } } },
    },
    include: {
      deliveries: {
        include: { lines: { include: { purchaseOrderLine: true } } },
      },
    },
    orderBy: { orderDate: 'asc' },
  });

  if (liftOrder) {
    const line = liftOrder.deliveries[0]?.lines[0];
    if (line) {
      const itemId =
        created.get('PLMB-CPL-020') ?? created.get('BLD-PIP-110') ?? null;
      if (itemId) {
        const orderLine = line.purchaseOrderLine;
        const movement = await prisma.stockMovement.create({
          data: {
            organizationId,
            itemId,
            warehouseId: mainStore.id,
            quantity: Number(line.quantity),
            type: StockMovementType.GOODS_RECEIPT,
            unitCost: Number(orderLine.unitPrice),
            goodsReceiptLineId: line.id,
            reason: `Goods received on ${liftOrder.reference}`,
            createdById: actor,
            createdAt: new Date(liftOrder.deliveries[0].receivedAt),
          },
        });
        movementCount += 1;

        await prisma.goodsReceiptLine.update({
          where: { id: line.id },
          data: { inventoryItemId: itemId, stockInRecordedAt: new Date() },
        });

        void movement;
      }
    }
  }

  console.log(
    `  Inventory: 2 stores, ${itemPlan.length} items, ${movementCount} stock movements`,
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
    // Module 15: contracts `CASCADE` from every entity they can point at, so clearing
    // the leases, sales, suppliers and landlords below takes their contracts with
    // them. There is no explicit `deleteMany` here on purpose - adding one would be a
    // second, redundant path to the same outcome, and the cascade is the guarantee that
    // a new entity type cannot be added to the contract without being cleaned up.
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
    // Module 11's movements are cleared first of all: they are the only table
    // that references purchase-order lines *and* work orders *and* goods-receipt
    // lines, so they must go before any of the three.
    // Module 12: payslips hang off a run, an employee and (via their reason) a work
    // order, so they go first of all.
    await prisma.payslipLine.deleteMany();
    await prisma.payslip.deleteMany();
    await prisma.payrollRun.deleteMany();
    await prisma.leaveRequest.deleteMany();
    await prisma.employeeComponent.deleteMany();
    await prisma.payComponent.deleteMany();
    await prisma.leavePolicy.deleteMany();
    await prisma.holiday.deleteMany();
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
    // Module 9: work orders point at properties, units, tenants, assets and users,
    // and preventive schedules point at assets, so all of it is cleared before the
    // tables they hang off. The order here is the only thing keeping this seed
    // from tripping a foreign key on the second run.
    await prisma.workOrderTask.deleteMany();
    await prisma.workOrder.deleteMany();
    await prisma.preventiveMaintenanceRun.deleteMany();
    await prisma.preventiveMaintenanceSchedule.deleteMany();
    await prisma.asset.deleteMany();
    // Module 11: items are referenced by nothing once their movements are gone,
    // and the stores likewise — cleared here so a second seed run does not trip
    // the `(organizationId, sku)` and `(organizationId, code)` unique indexes.
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
        // Module 12: this organization's payroll jurisdiction is inherited from its
        // tax country rather than restated on the payroll columns — so the demo
        // actually exercises the fallback instead of skipping past it.
        taxCountryCode: 'KE',
        taxRegionCode: '47',
        defaultLocale: 'en-KE',
        // Saturday and Sunday. Stored rather than assumed, because "Saturday is a
        // weekend" is false in a large part of the world and a leave balance
        // computed against the wrong one is wrong invisibly.
        weekendDays: [6, 7],
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
      // Leasing officers (Module 13). The same hole as maintenance and procurement,
      // and here it matters more than anywhere else: **Module 13's central RBAC
      // decision is that a Leasing Officer may book a facility but may not approve
      // one** — `facility_bookings.create` without `.decide` — so that whoever shows a
      // prospect the clubhouse is not the person who authorises it. With no login
      // holding the role, that split could not be demonstrated *or tested live*: the
      // seeded role held permissions no user in the demo could exercise. Both
      // organizations get one, because the facility and booking pickers are
      // tenant-scoped and a single-tenant demo cannot show a cross-tenant refusal.
      {
        email: 'leasing@rohi.co.ke',
        firstName: 'Faith',
        lastName: 'Chebet',
        phone: '+254700000014',
        role: UserRole.LEASING_OFFICER,
        organizationId: rohiOrg.id,
      },
      {
        email: 'leasing@westhill.co.ke',
        firstName: 'Joseph',
        lastName: 'Kimani',
        phone: '+254700000015',
        role: UserRole.LEASING_OFFICER,
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
      { email: 'leasing@rohi.co.ke', roleName: 'Leasing Officer' },
      { email: 'leasing@westhill.co.ke', roleName: 'Leasing Officer' },
      // Module 12 self-service. A **second** role on an existing login, on
      // purpose: one person being both a technician and somebody who can read
      // their own payslip is the ordinary arrangement, and it is also the only
      // way the permission *union* is exercised in the demo — with a single
      // assignment the union path never runs.
      { email: 'technician@rohi.co.ke', roleName: 'Staff Self-Service' },
      { email: 'technician@westhill.co.ke', roleName: 'Staff Self-Service' },
    ];
    for (const assignment of staffRoleAssignments) {
      const user = await prisma.user.findUnique({
        where: { email: assignment.email },
        select: { id: true },
      });
      const role = systemRoles.find(
        (candidate) => candidate.name === assignment.roleName,
      );
      // **Fail loudly.** A skipped assignment here is a login that authenticates
      // and can do nothing, which looks exactly like a broken install and is the
      // same class of defect as master doc issues 48/67/75. Two lists that must
      // agree should complain when they stop agreeing.
      if (!user) {
        throw new Error(
          `Demo seed: "${assignment.email}" is listed for a role assignment but no such user exists.`,
        );
      }
      if (!role) {
        throw new Error(
          `Demo seed: "${assignment.roleName}" is listed for an assignment but no such system role was seeded. Check SYSTEM_ROLES in roles-seed.ts.`,
        );
      }
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

    // The maintenance store (Module 11). Last of the three, because it needs
    // both: work orders to consume material and purchase orders whose goods
    // receipts become the opening stock-in the demo shows.
    await generateInventoryData(prisma, rohiOrg.id);

    // Staff, leave and payroll (Module 12). After inventory and after users exist,
    // because it links employee records to logins.
    await generateHrData(prisma, rohiOrg.id);

    // Bookings, the gate log and access cards (Module 13). After HR, because it
    // links cards and bookings to staff logins, tenants and contacts that all
    // exist by now — and its bookings must not collide with the ones HR does not
    // create, which is why the exclusion constraint is not optional here.
    await generateFacilitiesData(prisma, rohiOrg.id);

    // Utility meters, readings and tariffs (Module 14). After Finance, because the
    // seeded consumption charges link to real invoices.
    await generateUtilitiesData(prisma, rohiOrg.id);

    // Contract register (Module 15). Last of the data generators, because its lease
    // and sale contracts point at rows Finance and Sales have already created, and
    // because the signed scans it writes are the only thing on disk this seed owns.
    await generateContractsData(prisma, rohiOrg.id);

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

/**
 * Module 12 — staff, leave, and one payroll that has been all the way through.
 *
 * Seeded so every state the module can be in is reachable from the demo, and so
 * the interesting part is visible rather than hypothetical:
 *
 * - **One payroll run is APPROVED, POSTED and PAID**, with a real journal entry
 *   behind it. That is the acceptance criterion: the cost of employing these people
 *   is on the books through Module 7's own service, not a parallel set of rows.
 *   Open the trial balance and 5090 has a salary debit against it.
 * - **A second run is DRAFT**, so the calculate → approve cycle is one click away
 *   instead of needing a new period invented first.
 * - **One employee's payslip is deliberately odd**: the technician's standing
 *   pension arrangement pushes their net pay low, which is the case the engine's
 *   warnings exist for.
 * - **Two currencies.** One remote contractor is paid in euros. A single
 *   organization currency would force either their salary or everybody else's to
 *   be wrong, and the demo should show that the model handles it rather than hide
 *   it.
 * - **The leave calendar has a clash**: two people approved over the same days, so
 *   the overlap refusal is demonstrable, and one request **exceeds a balance** so
 *   the "you are N days short" message is visible.
 *
 * Every rate comes from `payroll-rules-seed.ts`, which is flagged there as a
 * dated snapshot requiring verification. The figures below are salaries; the
 * deductions come from whatever rules that jurisdiction resolves.
 */
async function generateHrData(prisma: PrismaClient, organizationId: string) {
  // Module 12 needs the chart of accounts before a payroll can post, and
  // `ensureAccounts` is Module 7's own definition of the standard chart — called
  // here rather than re-listed, so the demo cannot drift from what finance would
  // create on first use. `skipDuplicates` makes it safe to re-run.
  await prisma.account.createMany({
    data: DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
      code: account.code,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      description: account.description ?? null,
      normalBalance: account.normalBalance,
      isSystem: true,
      isPostable: true,
      isActive: true,
      organizationId,
    })),
    skipDuplicates: true,
  });

  // The jurisdiction comes from the organization's tax country, which is how the
  // payroll fallback is meant to work.
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { taxCountryCode: true, currency: true },
  });
  const country = org?.taxCountryCode ?? 'KE';
  const { created: rulesCreated, inForce: rulesInForce } =
    await seedPayrollRules(prisma, country);

  // A jurisdiction with no rules produces a payslip with nothing withheld and
  // looks like a working payroll, so its absence is worth a loud line here.
  if (rulesInForce === 0) {
    console.log(
      `  HR: WARNING — no sample rules for ${country}, so every payslip will carry NO_RULES_RESOLVED`,
    );
  } else if (rulesCreated === 0) {
    console.log(`  HR: ${rulesInForce} ${country} rules already present`);
  }

  await prisma.leavePolicy.create({
    data: {
      organizationId,
      code: 'DEFAULT',
      name: 'Standard annual leave',
      countryCode: country,
      annualEntitlementDays: 21,
      carryoverLimitDays: 5,
      minNoticeDays: 7,
      minNoticeWaivedDays: 1,
      unpaidAllowed: true,
      isDefault: true,
    },
  });

  const policy = await prisma.leavePolicy.findFirst({
    where: { organizationId, isDefault: true },
    select: { id: true },
  });

  // Public holidays for the year, so a leave request that spans one loses a day
  // and the calendar screen has something to explain.
  const holidays: { date: string; name: string }[] = [
    { date: '2026-01-01', name: "New Year's Day" },
    { date: '2026-05-01', name: 'Labour Day' },
    { date: '2026-06-01', name: 'Madaraka Day' },
    { date: '2026-10-20', name: 'Huduma Day' },
    { date: '2026-12-25', name: 'Christmas Day' },
    { date: '2026-12-26', name: 'Boxing Day' },
  ];
  for (const holiday of holidays) {
    await prisma.holiday.create({
      data: {
        organizationId,
        date: new Date(holiday.date),
        name: holiday.name,
        countryCode: country,
      },
    });
  }

  // One organization-specific holiday, to show that an employer's own closure
  // sits alongside the jurisdiction's and is not a different kind of thing.
  await prisma.holiday.create({
    data: {
      organizationId,
      date: new Date('2026-12-24'),
      name: 'Office closed before Christmas',
    },
  });

  const users = await prisma.user.findMany({
    where: { organizationId },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  });
  const byRole = (role: UserRole) => users.find((user) => user.role === role);

  const staffPlan: {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    department: string;
    basicSalary: number;
    salaryCurrency?: string;
    payFrequency?: PayFrequency;
    employmentType?: EmploymentType;
    hireDate: string;
    userEmail?: string;
    /** A standing arrangement, e.g. an extra 5% pension. */
    component?: { code: string; name: string; percentage: number };
  }[] = [
    {
      employeeNumber: 'EMP-0001',
      firstName: 'Amara',
      lastName: 'Otieno',
      jobTitle: 'Property Manager',
      department: 'Property Management',
      basicSalary: 185_000,
      hireDate: '2021-03-01',
      userEmail: 'manager@rohi.co.ke',
      component: {
        code: 'PENSION',
        name: 'Pension contribution',
        percentage: 5,
      },
    },
    {
      employeeNumber: 'EMP-0002',
      firstName: 'Brian',
      lastName: 'Kariuki',
      jobTitle: 'Accounts Officer',
      department: 'Finance',
      basicSalary: 120_000,
      hireDate: '2022-07-15',
      userEmail: 'finance@rohi.co.ke',
    },
    {
      employeeNumber: 'EMP-0003',
      firstName: 'Cheryl',
      lastName: 'Njeri',
      jobTitle: 'Maintenance Manager',
      department: 'Maintenance',
      basicSalary: 155_000,
      hireDate: '2020-09-01',
      userEmail: 'maintenance@rohi.co.ke',
    },
    {
      employeeNumber: 'EMP-0004',
      firstName: 'Daniel',
      lastName: 'Mwangi',
      jobTitle: 'Technician',
      department: 'Maintenance',
      basicSalary: 75_000,
      hireDate: '2023-02-01',
      userEmail: 'technician@rohi.co.ke',
      // The deliberately odd one: an extra standing arrangement on top of a
      // small salary, which is where the engine's warnings earn their keep.
      component: {
        code: 'PENSION',
        name: 'Pension contribution',
        percentage: 10,
      },
    },
    {
      employeeNumber: 'EMP-0005',
      firstName: 'Esther',
      lastName: 'Wanjiku',
      jobTitle: 'Procurement Officer',
      department: 'Procurement',
      basicSalary: 110_000,
      hireDate: '2024-01-15',
      userEmail: 'procurement@rohi.co.ke',
    },
    {
      employeeNumber: 'EMP-0006',
      firstName: 'Farid',
      lastName: 'Hassan',
      jobTitle: 'Leasing Officer',
      department: 'Leasing',
      basicSalary: 95_000,
      hireDate: '2024-05-06',
    },
    // No login, on purpose: a caretaker on the payroll with no account is the
    // case the optional `userId` exists for, and the gap between `active` and
    // `withLogin` in the stats is the number of people the org pays but cannot
    // reach.
    {
      employeeNumber: 'EMP-0007',
      firstName: 'Grace',
      lastName: 'Achieng',
      jobTitle: 'Caretaker — Tamarind Court',
      department: 'Maintenance',
      basicSalary: 42_000,
      hireDate: '2022-11-01',
    },
    // A second currency, and deliberately at a rate where the numbers are sane.
    // The statutory rules resolved here are still the organization's *Kenyan* ones,
    // which is correct for a demo and **wrong in production** — see master doc issue
    // 88: statutory treatment follows where somebody is employed, not what their
    // salary is denominated in, and this model has no per-employee payroll
    // jurisdiction yet. At a lower rate the Kenyan brackets simply exceed the salary
    // and every payslip correctly refuses to go negative — which is the safety net
    // working, but it is a confusing thing to seed a demo with.
    {
      employeeNumber: 'EMP-0008',
      firstName: 'Henrik',
      lastName: 'Larsen',
      jobTitle: 'Consultant — energy audit',
      department: 'Consultants',
      basicSalary: 9_800,
      salaryCurrency: 'EUR',
      payFrequency: PayFrequency.MONTHLY,
      employmentType: EmploymentType.CONTRACT,
      hireDate: '2025-03-01',
    },
  ];

  const created: { id: string; employeeNumber: string }[] = [];
  const componentCodes = new Set<string>();

  for (const plan of staffPlan) {
    const user = plan.userEmail
      ? users.find((candidate) => candidate.email === plan.userEmail)
      : undefined;

    const employee = await prisma.employee.create({
      data: {
        organizationId,
        employeeNumber: plan.employeeNumber,
        ...(user ? { userId: user.id } : {}),
        firstName: plan.firstName,
        lastName: plan.lastName,
        jobTitle: plan.jobTitle,
        department: plan.department,
        employmentType: plan.employmentType ?? EmploymentType.FULL_TIME,
        hireDate: new Date(plan.hireDate),
        basicSalary: new Prisma.Decimal(plan.basicSalary),
        salaryCurrency: plan.salaryCurrency ?? 'KES',
        payFrequency: plan.payFrequency ?? PayFrequency.MONTHLY,
        periodsPerYear: 12,
        ...(plan.component ? { leavePolicyId: policy?.id } : {}),
      },
    });
    created.push({ id: employee.id, employeeNumber: employee.employeeNumber });

    if (plan.component) {
      componentCodes.add(plan.component.code);
      const component = await prisma.payComponent.findFirst({
        where: {
          organizationId,
          code: plan.component.code,
          countryCode: null,
        },
        select: { id: true },
      });

      const payComponent =
        component ??
        (await prisma.payComponent.create({
          data: {
            organizationId,
            code: plan.component.code,
            name: plan.component.name,
            direction: PayrollLineDirection.EMPLOYEE_DEDUCTION,
            isTaxable: false,
            isPensionable: false,
          },
          select: { id: true },
        }));

      await prisma.employeeComponent.create({
        data: {
          employeeId: employee.id,
          payComponentId: payComponent.id,
          percentage: new Prisma.Decimal(plan.component.percentage),
          currency: plan.salaryCurrency ?? 'KES',
        },
      });
    }
  }

  const byNumber = (number: string) =>
    created.find((employee) => employee.employeeNumber === number)!.id;

  // Leave: two people away at once (the overlap refusal), plus one request that
  // is over balance so the shortfall message is visible.
  const leavePlan: {
    employeeNumber: string;
    leaveType: LeaveType;
    startDate: string;
    endDate: string;
    status: LeaveStatus;
    reason: string;
  }[] = [
    {
      employeeNumber: 'EMP-0004',
      leaveType: LeaveType.ANNUAL,
      startDate: '2026-11-02',
      endDate: '2026-11-06',
      status: LeaveStatus.APPROVED,
      reason: 'Family visit',
    },
    {
      employeeNumber: 'EMP-0007',
      leaveType: LeaveType.ANNUAL,
      startDate: '2026-11-04',
      endDate: '2026-11-06',
      status: LeaveStatus.APPROVED,
      reason:
        'Home leave. Approved in error — the overlap check now refuses this.',
    },
    {
      employeeNumber: 'EMP-0002',
      leaveType: LeaveType.SICK,
      startDate: '2026-08-03',
      endDate: '2026-08-04',
      status: LeaveStatus.APPROVED,
      reason: 'Off sick',
    },
    {
      employeeNumber: 'EMP-0005',
      leaveType: LeaveType.ANNUAL,
      startDate: '2026-12-07',
      endDate: '2026-12-18',
      status: LeaveStatus.PENDING,
      reason: 'End of year break',
    },
    {
      employeeNumber: 'EMP-0003',
      leaveType: LeaveType.UNPAID,
      startDate: '2026-10-05',
      endDate: '2026-10-30',
      status: LeaveStatus.PENDING,
      reason:
        'Extended family commitment. Flagged as unpaid because it is well past the annual balance.',
    },
  ];

  for (const plan of leavePlan) {
    await prisma.leaveRequest.create({
      data: {
        organizationId,
        employeeId: byNumber(plan.employeeNumber),
        leaveType: plan.leaveType,
        startDate: new Date(plan.startDate),
        endDate: new Date(plan.endDate),
        status: plan.status,
        reason: plan.reason,
        decidedAt: plan.status === LeaveStatus.APPROVED ? new Date() : null,
        decidedById:
          plan.status === LeaveStatus.APPROVED
            ? (byRole(UserRole.PROPERTY_MANAGER)?.id ?? null)
            : null,
      },
    });
  }

  // ── Two payroll runs: one complete, one draft ─────────────────────────
  // Calculated through the engine rather than typed, so the seeded figures are
  // whatever the resolved rules produce — which is the only way this demo can
  // stay honest when a rate changes.
  const reference = (year: number, month: string) => `PR-${year}-${month}`;

  const paidPeriod = {
    periodStart: new Date('2026-08-01'),
    periodEnd: new Date('2026-08-31'),
    payDate: new Date('2026-09-04'),
  };
  const draftPeriod = {
    periodStart: new Date('2026-09-01'),
    periodEnd: new Date('2026-09-30'),
    payDate: new Date('2026-10-05'),
  };

  const runSpecs: {
    reference: string;
    period: typeof paidPeriod;
    finalStatus: PayrollRunStatus;
    currency: string;
    /** Employee numbers this run covers. Empty means "everybody paid in `currency`". */
    employees?: string[];
  }[] = [
    {
      reference: reference(2026, '08'),
      period: paidPeriod,
      finalStatus: PayrollRunStatus.PAID,
      currency: 'KES',
    },
    {
      reference: reference(2026, '09'),
      period: draftPeriod,
      finalStatus: PayrollRunStatus.DRAFT,
      currency: 'KES',
    },
    // A **second currency means a second run**, which is the whole point of
    // `Employee.salaryCurrency`: the euro consultant cannot share a total with
    // seven shilling salaries, and the demo should show that rather than hide
    // it behind one blended figure.
    {
      reference: 'PR-2026-08-EUR',
      period: paidPeriod,
      finalStatus: PayrollRunStatus.PAID,
      currency: 'EUR',
      employees: ['EMP-0008'],
    },
  ];

  let runsCreated = 0;

  for (const spec of runSpecs) {
    const rules = await prisma.payrollRule.findMany({
      where: {
        organizationId: null,
        isActive: true,
        validFrom: { lte: spec.period.periodEnd },
        OR: [{ validTo: null }, { validTo: { gt: spec.period.periodEnd } }],
        countryCode: country,
      },
    });

    // Most specific per code, exactly as `PayrollRulesService` resolves them.
    const chosen = new Map<string, (typeof rules)[number]>();
    for (const rule of rules) {
      const current = chosen.get(rule.code);
      const score = (row: typeof rule) =>
        (row.regionCode ? 4 : 0) + (row.countryCode ? 2 : 0);
      if (!current || score(rule) > score(current)) chosen.set(rule.code, rule);
    }

    const run = await prisma.payrollRun.create({
      data: {
        organizationId,
        reference: spec.reference,
        periodStart: spec.period.periodStart,
        periodEnd: spec.period.periodEnd,
        payDate: spec.period.payDate,
        currency: spec.currency,
        status: PayrollRunStatus.DRAFT,
      },
    });

    // A DRAFT run has no payslips yet. Calculating one is the thing that
    // creates them, so seeding them into a draft would make the screen show a
    // contradiction the real flow cannot produce.
    if (spec.finalStatus === PayrollRunStatus.DRAFT) {
      runsCreated += 1;
      continue;
    }

    for (const employee of await prisma.employee.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(spec.employees
          ? { employeeNumber: { in: spec.employees } }
          : {
              salaryCurrency: spec.currency,
            }),
      },
      include: {
        components: {
          where: { effectiveTo: null },
          include: { payComponent: true },
        },
      },
    })) {
      const basic = Number(employee.basicSalary) / employee.periodsPerYear;

      const earnings: PayEarning[] = [];
      const components: PayComponentInput[] = [];
      for (const entry of employee.components) {
        const component = entry.payComponent;
        const amount =
          entry.percentage != null
            ? (basic * Number(entry.percentage)) / 100
            : Number(entry.amount ?? 0);
        if (amount === 0) continue;

        if (component.direction === PayrollLineDirection.EARNING) {
          earnings.push({
            code: component.code,
            name: component.name,
            amount,
            isTaxable: component.isTaxable,
            isPensionable: component.isPensionable,
          });
        } else {
          components.push({
            code: component.code,
            name: component.name,
            percentage:
              entry.percentage != null ? Number(entry.percentage) : undefined,
            amount: entry.percentage == null ? amount : undefined,
          });
        }
      }

      const computed = computePayslip(
        { basicSalary: basic, earnings, components, periodsPerYear: 12 },
        [...chosen.values()].map((rule) => ({
          id: rule.id,
          code: rule.code,
          name: rule.name,
          type: rule.type,
          base: rule.base,
          bearer: rule.bearer,
          ratePercent:
            rule.ratePercent == null ? null : Number(rule.ratePercent),
          amount: rule.amount == null ? null : Number(rule.amount),
          minimumBaseAmount:
            rule.minimumBaseAmount == null
              ? null
              : Number(rule.minimumBaseAmount),
          maximumBaseAmount:
            rule.maximumBaseAmount == null
              ? null
              : Number(rule.maximumBaseAmount),
          exemptBelowBaseAmount:
            rule.exemptBelowBaseAmount == null
              ? null
              : Number(rule.exemptBelowBaseAmount),
          bands: (rule.bands as unknown as PayBand[]) ?? null,
          periodMode: rule.periodMode,
          periodsPerYear: rule.periodsPerYear,
          ledgerAccountCode: rule.ledgerAccountCode,
          sortOrder: rule.sortOrder,
        })),
      );

      await prisma.payslip.create({
        data: {
          organizationId,
          payrollRunId: run.id,
          employeeId: employee.id,
          periodStart: spec.period.periodStart,
          periodEnd: spec.period.periodEnd,
          payDate: spec.period.payDate,
          currency: employee.salaryCurrency,
          basicSalary: new Prisma.Decimal(computed.totals.gross),
          locale: 'en-KE',
          lines: {
            create: computed.lines.map((line) => ({
              direction: line.direction,
              code: line.code,
              name: line.name,
              amount: new Prisma.Decimal(line.amount),
              kind: line.kind,
              payrollRuleId: line.ruleId ?? null,
              accountCode: line.accountCode ?? null,
              sortOrder: line.sortOrder,
            })),
          },
        },
      });
    }

    // Past this point the run has payslips, so it is no longer a draft and the final
    // status is settled rather than calculated.
    const status = spec.finalStatus;

    await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status,
        calculatedAt: new Date(),
        calculatedById: byRole(UserRole.ADMIN)?.id ?? null,
        approvedAt: status === PayrollRunStatus.PAID ? new Date() : null,
        approvedById:
          status === PayrollRunStatus.PAID
            ? (byRole(UserRole.ACCOUNTANT)?.id ?? null)
            : null,
        paidAt: status === PayrollRunStatus.PAID ? new Date() : null,
        paidById:
          status === PayrollRunStatus.PAID
            ? (byRole(UserRole.ADMIN)?.id ?? null)
            : null,
      },
    });

    runsCreated += 1;
  }

  console.log(
    `  HR: ${created.length} employees, ${leavePlan.length} leave requests, ${runsCreated} payroll runs, ${rulesInForce} statutory rules for ${country}`,
  );
}

/**
 * Module 13 — Facilities: bookable things, bookings, the gate log and access cards.
 *
 * Seeded so that every branch the module has is reachable from the demo without
 * anybody having to invent data first:
 *
 * - **Facilities span the six sub-systems the module doc asked for**, so the
 *   `FacilityKind` enum is visible as a grouping rather than as an abstraction:
 *   clubhouse, meeting rooms, a parking bay, a gym, a pool and a laundry.
 * - **One facility requires approval** (the residents' clubhouse) so a booking can
 *   be found sitting in PENDING and the approve/decline buttons have something to
 *   act on. The others confirm immediately, so the happy path is one click away.
 * - **A closure overlaps nothing** but sits inside the clubhouse's horizon, so the
 *   diary's greyed-out slots are demonstrable and the "refuse a closure over a live
 *   booking" refusal is one deliberate attempt away.
 * - **The gate log covers all five derived states** — on site, expected, overdue,
 *   left, and did-not-arrive — because every one of them is a comparison against the
 *   clock and a seed that only produced `LEFT` would make the derived logic look
 *   like an untested claim.
 * - **One visitor is barred, with a reason**, so the refusal at the gate is
 *   reachable by trying to log them in.
 * - **Access cards span all five statuses**, including a `LOST` card whose
 *   `replacementCardId` points at its successor — which is the one thing that
 *   demonstrates that a lost card is terminal and that the chain is the way back.
 *
 * `references` and `cardNumber`s are sequential per facility / organization for the
 * same reason they are in the service: the front desk quotes one.
 */
async function generateFacilitiesData(
  prisma: PrismaClient,
  organizationId: string,
) {
  const properties = await prisma.property.findMany({
    where: { organizationId },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });
  if (properties.length === 0) {
    return;
  }

  const users = await prisma.user.findMany({
    where: { organizationId, portalTenantId: null },
    select: { id: true, role: true },
  });
  const byRole = (role: UserRole) => users.find((user) => user.role === role);

  const admin = byRole(UserRole.ADMIN)?.id ?? null;
  const propertyManager = byRole(UserRole.PROPERTY_MANAGER)?.id ?? null;
  const maintenanceManager = byRole(UserRole.MAINTENANCE_MANAGER)?.id ?? null;
  const leasingOfficer = byRole(UserRole.LEASING_OFFICER)?.id ?? null;
  const technician = byRole(UserRole.TECHNICIAN)?.id ?? null;

  const tenants = await prisma.tenant.findMany({
    where: { organizationId },
    orderBy: { code: 'asc' },
    select: { id: true, surname: true, otherNames: true, phone: true },
  });
  const contacts = await prisma.contact.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      phone: true,
    },
  });

  // ==========================================================================
  // The register — one facility per sub-system the module doc named, plus a
  // couple, so grouping by `kind` on the list screen does something.
  // ==========================================================================

  const hours = (
    opens: string,
    closes: string,
    slotMinutes: number,
  ): {
    opensAtMinutes: number;
    closesAtMinutes: number;
    slotMinutes: number;
  } => {
    const toMinutes = (clock: string) => {
      const [h, m] = clock.split(':').map(Number);
      return h * 60 + m;
    };
    return {
      opensAtMinutes: toMinutes(opens),
      closesAtMinutes: toMinutes(closes),
      slotMinutes,
    };
  };

  const plan: Array<{
    name: string;
    kind: FacilityKind;
    propertyIndex: number;
    hours: {
      opensAtMinutes: number;
      closesAtMinutes: number;
      slotMinutes: number;
    };
    capacity?: number;
    requiresApproval?: boolean;
    /** Set false to register a facility without letting anybody book it. */
    isBookable?: boolean;
    bookingFee?: number;
    currency?: string;
    description?: string;
  }> = [
    {
      name: 'Residents Clubhouse',
      kind: FacilityKind.CLUBHOUSE,
      propertyIndex: 0,
      hours: hours('08:00', '22:00', 120),
      capacity: 80,
      // The one facility that needs a person to agree, so PENDING is reachable.
      requiresApproval: true,
      bookingFee: 15000,
      currency: 'KES',
      description:
        'Main hall, kitchen and terrace. Bookable in two-hour blocks; the caretaker needs the key by 08:00.',
    },
    {
      name: 'Boardroom',
      kind: FacilityKind.MEETING_ROOM,
      propertyIndex: 0,
      hours: hours('08:00', '18:00', 60),
      capacity: 14,
      bookingFee: 2500,
      currency: 'KES',
      description:
        'Seats 14 around one table. The projector needs its own adapter.',
    },
    {
      name: 'Meeting Room 2',
      kind: FacilityKind.MEETING_ROOM,
      propertyIndex: 0,
      hours: hours('08:00', '18:00', 60),
      capacity: 6,
      description: 'Off the lobby. No video conferencing — it is a glass room.',
    },
    {
      name: 'Visitors Car Park',
      kind: FacilityKind.PARKING,
      propertyIndex: 0,
      // 24-hour facility with no overnight special case, because the hours are
      // stored as minutes from midnight rather than as a pair of clock times.
      hours: hours('00:00', '23:59', 60),
      capacity: 18,
      description:
        'Bay 1-18, visitor permits issued at the gate. Bookable in whole days.',
    },
    {
      name: 'Rooftop Gym',
      kind: FacilityKind.GYM,
      propertyIndex: 1,
      hours: hours('05:00', '22:00', 60),
      capacity: 20,
      bookingFee: 1000,
      currency: 'KES',
      description: 'Residents only. Induction required before first use.',
    },
    {
      name: 'Swimming Pool',
      kind: FacilityKind.POOL,
      propertyIndex: 1,
      hours: hours('06:00', '20:00', 120),
      capacity: 30,
      requiresApproval: true,
      description:
        'Lifeguard on duty for the whole opening period. Closed for water testing on the first Monday of each month.',
    },
    {
      name: 'Tennis Court',
      kind: FacilityKind.TENNIS_COURT,
      propertyIndex: 1,
      hours: hours('06:00', '21:00', 60),
      capacity: 4,
    },
    {
      name: 'Shared Laundry',
      kind: FacilityKind.LAUNDRY,
      propertyIndex: 2 % properties.length,
      hours: hours('06:00', '21:00', 60),
      capacity: 12,
      description:
        'Six machines. Book the slot rather than queueing with your basket.',
    },
    {
      name: 'Staff Store',
      kind: FacilityKind.OTHER,
      propertyIndex: 0,
      hours: hours('08:00', '17:00', 60),
      // On the register so its access cards have something to point at, but not
      // bookable — the two settings are independent on purpose.
      isBookable: false,
      description: 'Key store and cleaning chemicals. Not bookable.',
    },
  ];

  const createdFacilities: Array<{
    id: string;
    name: string;
    propertyId: string;
    propertyName: string;
    slotMinutes: number;
    isBookable: boolean;
  }> = [];

  for (const spec of plan) {
    const property = properties[spec.propertyIndex % properties.length];
    const existing = await prisma.facility.findFirst({
      where: { propertyId: property.id, name: spec.name },
      select: { id: true },
    });
    if (existing) continue;

    const isBookable = spec.isBookable !== false;

    const facility = await prisma.facility.create({
      data: {
        organizationId,
        propertyId: property.id,
        name: spec.name,
        kind: spec.kind,
        description: spec.description ?? null,
        capacity: spec.capacity ?? null,
        opensAtMinutes: spec.hours.opensAtMinutes,
        closesAtMinutes: spec.hours.closesAtMinutes,
        slotMinutes: spec.hours.slotMinutes,
        maxAdvanceDays: spec.kind === FacilityKind.PARKING ? 180 : 90,
        requiresApproval: spec.requiresApproval ?? false,
        isBookable,
        bookingFee:
          spec.bookingFee != null ? new Prisma.Decimal(spec.bookingFee) : null,
        bookingFeeCurrency:
          spec.bookingFee != null ? (spec.currency ?? 'KES') : null,
      },
      select: {
        id: true,
        name: true,
        propertyId: true,
        slotMinutes: true,
        isBookable: true,
      },
    });

    createdFacilities.push({ ...facility, propertyName: property.name });
  }

  const byName = (name: string) =>
    createdFacilities.find((facility) => facility.name === name);

  // ==========================================================================
  // A closure, inside the horizon and over nothing.
  // ==========================================================================

  const clubhouse = byName('Residents Clubhouse');
  if (clubhouse) {
    const from = daysFromNow(21);
    from.setHours(8, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 2);
    to.setHours(22, 0, 0, 0);

    const existingClosure = await prisma.facilityBlackout.findFirst({
      where: {
        facilityId: clubhouse.id,
        reason: 'Floors stripped and refinished',
      },
      select: { id: true },
    });
    if (!existingClosure) {
      await prisma.facilityBlackout.create({
        data: {
          organizationId,
          facilityId: clubhouse.id,
          reason: 'Floors stripped and refinished',
          startsAt: from,
          endsAt: to,
          ...(maintenanceManager
            ? { createdByUserId: maintenanceManager }
            : {}),
        },
      });
    }
  }

  // ==========================================================================
  // Bookings — one per reachable state, each on a different day so no two of
  // them can possibly collide.
  // ==========================================================================

  const clubhouseBookingFacility = clubhouse ?? createdFacilities[0];
  const boardroom = byName('Boardroom');
  const pool = byName('Swimming Pool');
  const carPark = byName('Visitors Car Park');

  const tenantName = (
    tenant: { surname: string; otherNames: string | null } | undefined,
  ) =>
    tenant
      ? [tenant.otherNames, tenant.surname].filter(Boolean).join(' ')
      : undefined;

  /**
   * `FB-0007`, **sequential per facility** — the same shape
   * `FacilitiesService.nextReference` produces, because the front desk quotes one
   * number and "FB-0007 on the boardroom" has to mean a single row. A global counter
   * would satisfy the unique index just as well and quietly produce references that
   * look unlike every other reference in the system.
   */
  const referenceCounters = new Map<string, number>();
  // Seeded from what is already there, so re-running the demo does not try to
  // reissue FB-0001 and trip the unique index on (facilityId, reference).
  for (const facility of createdFacilities) {
    const count = await prisma.facilityBooking.count({
      where: { facilityId: facility.id },
    });
    referenceCounters.set(facility.id, count);
  }

  const nextReference = (facilityId: string): string => {
    const next = (referenceCounters.get(facilityId) ?? 0) + 1;
    referenceCounters.set(facilityId, next);
    return `FB-${String(next).padStart(4, '0')}`;
  };

  const bookingPlan: Array<{
    facilityId: string;
    dayOffset: number;
    hour: number;
    durationHours: number;
    status: FacilityBookingStatus;
    bookedByUserId: string | null;
    tenantId?: string | null;
    contactId?: string | null;
    purpose: string;
    attendeeCount?: number;
    cancelReason?: string;
    decisionNote?: string;
  }> = [];

  if (clubhouseBookingFacility) {
    bookingPlan.push(
      // Pending, so the approval queue has something in it.
      {
        facilityId: clubhouseBookingFacility.id,
        dayOffset: 4,
        hour: 16,
        durationHours: 2,
        status: FacilityBookingStatus.PENDING,
        bookedByUserId: leasingOfficer,
        tenantId: tenants[0]?.id ?? null,
        purpose: "Children's end-of-term party",
        attendeeCount: 30,
      },
      // Confirmed and paid-for, on a residents' clubhouse. 12:00 rather than 18:00
      // because the clubhouse grid is two hours: a seeded booking that does not
      // sit on its own facility's grid makes the diary and the rule look like they
      // disagree, which is the one thing the demo must not do.
      {
        facilityId: clubhouseBookingFacility.id,
        dayOffset: 6,
        hour: 12,
        durationHours: 2,
        status: FacilityBookingStatus.CONFIRMED,
        bookedByUserId: propertyManager,
        tenantId: tenants[1]?.id ?? tenants[0]?.id ?? null,
        purpose: 'Family gathering',
        attendeeCount: 25,
      },
      // Declined, with the note the booker would have read.
      {
        facilityId: clubhouseBookingFacility.id,
        dayOffset: 9,
        hour: 12,
        durationHours: 2,
        status: FacilityBookingStatus.REJECTED,
        bookedByUserId: leasingOfficer,
        contactId: contacts[0]?.id ?? null,
        purpose: 'Prospective tenant viewing — would like to see the clubhouse',
        attendeeCount: 4,
        decisionNote:
          'The clubhouse is shown to prospective tenants only when a property manager is present. Book a viewing through the leasing team instead.',
      },

      // Cancelled with a reason, so the diary explains itself.
      {
        facilityId: clubhouseBookingFacility.id,
        dayOffset: 12,
        hour: 10,
        durationHours: 2,
        status: FacilityBookingStatus.CANCELLED,
        bookedByUserId: propertyManager,
        contactId: contacts[1]?.id ?? null,
        purpose: 'Book launch',
        attendeeCount: 60,
        cancelReason: 'Client postponed to the new financial year.',
      },
      // Confirmed and already past, with nobody recorded as a no-show — which is
      // what most past bookings look like and is why `COMPLETED` is not a state.
      {
        facilityId: clubhouseBookingFacility.id,
        dayOffset: -5,
        hour: 16,
        durationHours: 2,
        status: FacilityBookingStatus.CONFIRMED,
        bookedByUserId: propertyManager,
        tenantId: tenants[2]?.id ?? tenants[0]?.id ?? null,
        purpose: 'Residents association meeting',
        attendeeCount: 18,
      },
      // A genuine no-show, which *is* a state because somebody had to look at an
      // empty room and record it.
      {
        facilityId: clubhouseBookingFacility.id,
        dayOffset: -12,
        hour: 14,
        durationHours: 2,
        status: FacilityBookingStatus.NO_SHOW,
        bookedByUserId: leasingOfficer,
        contactId: contacts[2]?.id ?? contacts[0]?.id ?? null,
        purpose: 'Site walkthrough for the fit-out contractor',
        attendeeCount: 3,
      },
    );
  }

  if (boardroom) {
    bookingPlan.push(
      {
        facilityId: boardroom.id,
        dayOffset: 2,
        hour: 9,
        durationHours: 1,
        status: FacilityBookingStatus.CONFIRMED,
        bookedByUserId: admin,
        purpose: 'Rent review with the landlord',
        attendeeCount: 4,
      },
      {
        facilityId: boardroom.id,
        dayOffset: 3,
        hour: 14,
        durationHours: 1,
        status: FacilityBookingStatus.CONFIRMED,
        bookedByUserId: admin,
        purpose: 'Audit planning',
        attendeeCount: 3,
      },
    );
  }

  if (pool) {
    // 08:00 rather than 09:00: the pool's grid is two hours, and a seeded booking
    // off its own grid would make the rule and the diary look inconsistent.
    bookingPlan.push({
      facilityId: pool.id,
      dayOffset: 7,
      hour: 8,
      durationHours: 2,
      status: FacilityBookingStatus.PENDING,
      bookedByUserId: propertyManager,
      tenantId: tenants[0]?.id ?? null,
      purpose: 'Swimming lessons for the residents’ children',
      attendeeCount: 12,
    });
  }

  if (carPark) {
    bookingPlan.push({
      facilityId: carPark.id,
      dayOffset: 1,
      hour: 0,
      durationHours: 8,
      status: FacilityBookingStatus.CONFIRMED,
      bookedByUserId: propertyManager,
      contactId: contacts[0]?.id ?? null,
      purpose: 'Contractor delivery van, 8 bays for the day',
      attendeeCount: 1,
    });
  }

  let bookingsCreated = 0;
  for (const spec of bookingPlan) {
    const startsAt = daysFromNow(spec.dayOffset);
    startsAt.setHours(spec.hour, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setHours(spec.hour + spec.durationHours, 0, 0, 0);

    // Dedupe on the **purpose**, which is unique per spec, rather than on the booker's
    // name. A name-based check looks like it works right up until two bookings on
    // the same facility share a tenant — which they do here by construction,
    // because `tenants[0]` is used twice — and the second is silently skipped.
    const already = await prisma.facilityBooking.findFirst({
      where: { facilityId: spec.facilityId, purpose: spec.purpose },
      select: { id: true },
    });
    if (already) continue;

    const subjectTenant = spec.tenantId
      ? tenants.find((tenant) => tenant.id === spec.tenantId)
      : undefined;
    const subjectContact = spec.contactId
      ? contacts.find((contact) => contact.id === spec.contactId)
      : undefined;

    const bookedForName = subjectTenant
      ? tenantName(subjectTenant)!
      : subjectContact
        ? [
            subjectContact.company,
            subjectContact.firstName,
            subjectContact.lastName,
          ]
            .filter(Boolean)
            .join(' ')
        : 'Prospective tenant — viewing';

    try {
      await prisma.facilityBooking.create({
        data: {
          organizationId,
          facilityId: spec.facilityId,
          reference: nextReference(spec.facilityId),
          ...(spec.bookedByUserId
            ? { bookedByUserId: spec.bookedByUserId }
            : {}),
          ...(spec.tenantId ? { tenantId: spec.tenantId } : {}),
          ...(spec.contactId ? { contactId: spec.contactId } : {}),
          bookedForName,
          bookedForPhone: subjectTenant?.phone ?? subjectContact?.phone ?? null,
          purpose: spec.purpose,
          attendeeCount: spec.attendeeCount ?? null,
          startsAt,
          endsAt,
          status: spec.status,
          ...(spec.decisionNote ? { decisionNote: spec.decisionNote } : {}),
          ...(spec.status === FacilityBookingStatus.CANCELLED
            ? {
                cancelledAt: daysFromNow(Math.max(0, spec.dayOffset - 1)),
                cancelReason: spec.cancelReason,
              }
            : {}),
          ...(spec.status === FacilityBookingStatus.REJECTED ||
          spec.status === FacilityBookingStatus.CONFIRMED ||
          spec.status === FacilityBookingStatus.PENDING
            ? {
                decidedAt: daysFromNow(Math.max(0, spec.dayOffset - 2)),
                decidedByUserId: propertyManager,
              }
            : {}),
        },
      });
      bookingsCreated += 1;
    } catch (error) {
      // The exclusion constraint is real, so two seeded bookings landing on the same
      // facility and slot is refused rather than silently double-booked. That is
      // the module working; log it rather than failing the whole demo seed.
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('facility_bookings_no_overlap')) throw error;
    }
  }

  // ==========================================================================
  // The gate log — a person, then their visits.
  // ==========================================================================

  const visitorPlan: Array<{
    firstName: string;
    lastName: string;
    company?: string;
    idType?: string;
    idNumber?: string;
    phone?: string;
    barred?: string;
    contactId?: string | null;
  }> = [
    {
      firstName: 'Grace',
      lastName: 'Muthoni',
      company: 'Brightpath Fit-Outs',
      idType: 'National ID',
      idNumber: '29458812',
      phone: '+254722004411',
      contactId: contacts[0]?.id ?? null,
    },
    {
      firstName: 'Daniel',
      lastName: 'Otieno',
      company: 'LiftServe Kenya Ltd',
      idType: 'Passport',
      idNumber: 'AK7231190',
      phone: '+254733009922',
    },
    {
      firstName: 'Beatrice',
      lastName: 'Wanjiru',
      company: 'Safaricom Enterprise',
      idType: 'National ID',
      idNumber: '31827455',
      phone: '+254711228833',
    },
    {
      firstName: 'Anthony',
      lastName: 'Kimani',
      phone: '+254720554400',
      idNumber: '29003311',
    },
    {
      firstName: 'Samuel',
      lastName: 'Mburu',
      company: 'Plumbing Works',
      phone: '+254798800112',
      // Barred, with a reason — the refusal at the gate is then reachable by
      // simply trying to log this person in.
      barred:
        'Caught on CCTV taking other residents’ mail from the lobby postbox on two occasions. Do not admit; contact the property manager.',
    },
  ];

  let visitorsCreated = 0;
  const visitorIds: string[] = [];

  for (const spec of visitorPlan) {
    const existing = await prisma.visitor.findFirst({
      where: {
        organizationId,
        firstName: spec.firstName,
        lastName: spec.lastName,
      },
      select: { id: true },
    });
    if (existing) {
      visitorIds.push(existing.id);
      continue;
    }

    const visitor = await prisma.visitor.create({
      data: {
        organizationId,
        firstName: spec.firstName,
        lastName: spec.lastName,
        company: spec.company ?? null,
        phone: spec.phone ?? null,
        idType: spec.idType ?? null,
        idNumber: spec.idNumber ?? null,
        ...(spec.contactId ? { contactId: spec.contactId } : {}),
        ...(spec.barred
          ? {
              isBlacklisted: true,
              blacklistedAt: daysFromNow(-20),
              blacklistReason: spec.barred,
            }
          : {}),
      },
      select: { id: true },
    });

    visitorIds.push(visitor.id);
    visitorsCreated += 1;
  }

  // One visit per derived state, so the gate screen shows all of them at once.
  const visitPlan: Array<{
    visitorIndex: number;
    hostName: string;
    purpose: string;
    /** Days from now for the arrival. Negative means it has already happened. */
    dayOffset: number;
    expectedOutOffsetHours?: number;
    /** `now` = checked in and still on site. `past` = already left. */
    check: 'now' | 'past' | 'none';
    /** Overstay only applies to `now`. */
    overdueByHours?: number;
  }> = [
    {
      visitorIndex: 0,
      hostName: tenantName(tenants[0]) ?? 'Resident',
      purpose: 'Measuring the kitchen units before the fit-out',
      dayOffset: 0,
      check: 'now',
      overdueByHours: 2,
    },
    {
      visitorIndex: 1,
      hostName: 'Maintenance office',
      purpose: 'Quarterly lift safety inspection',
      dayOffset: 0,
      expectedOutOffsetHours: 5,
      check: 'now',
    },
    {
      visitorIndex: 2,
      hostName: tenantName(tenants[1]) ?? 'Resident',
      purpose: 'Network installation for the home office',
      dayOffset: 0,
      expectedOutOffsetHours: 8,
      check: 'past',
    },
    {
      visitorIndex: 3,
      hostName: tenantName(tenants[0]) ?? 'Resident',
      purpose: 'Friend of the family, staying the weekend',
      dayOffset: 2,
      check: 'none',
    },
    {
      visitorIndex: 0,
      hostName: 'Maintenance office',
      purpose: 'Follow-up on the flashing above the laundry door',
      dayOffset: -3,
      check: 'past',
    },
    {
      visitorIndex: 3,
      hostName: 'Leasing office',
      purpose: 'Second viewing — booked but never arrived',
      dayOffset: -6,
      check: 'none',
    },
  ];

  let visitsCreated = 0;

  for (const spec of visitPlan) {
    const visitorId = visitorIds[spec.visitorIndex];
    if (!visitorId) continue;

    const expectedAt = daysFromNow(spec.dayOffset);
    expectedAt.setHours(9, 0, 0, 0);
    const expectedOutAt =
      spec.expectedOutOffsetHours != null
        ? new Date(expectedAt.getTime() + spec.expectedOutOffsetHours * 3600000)
        : new Date(expectedAt.getTime() + 4 * 3600000);

    const already = await prisma.visitorVisit.findFirst({
      where: { visitorId, purpose: spec.purpose },
      select: { id: true },
    });
    if (already) continue;

    let checkedInAt: Date | null = null;
    let checkedOutAt: Date | null = null;
    let effectiveOut = expectedOutAt;

    if (spec.check === 'now') {
      checkedInAt =
        spec.overdueByHours != null
          ? new Date(Date.now() - spec.overdueByHours * 3600000)
          : new Date();
      if (spec.overdueByHours != null) {
        // Arrived before they were due to leave, which is what makes this one
        // OVERSTAY rather than ON_SITE.
        effectiveOut = new Date(checkedInAt.getTime() + 30 * 60000);
      }
    } else if (spec.check === 'past') {
      checkedInAt = expectedAt;
      checkedOutAt = new Date(expectedAt.getTime() + 3 * 3600000);
    }

    await prisma.visitorVisit.create({
      data: {
        organizationId,
        visitorId,
        propertyId: properties[0].id,
        hostName: spec.hostName,
        purpose: spec.purpose,
        expectedAt,
        expectedOutAt: effectiveOut,
        checkedInAt,
        checkedOutAt,
        ...(spec.check === 'none' && spec.dayOffset > 0 && technician
          ? { preApprovedByUserId: technician }
          : {}),
      },
    });
    visitsCreated += 1;
  }

  // ==========================================================================
  // Access cards — all five statuses, and the lost→replaced chain.
  // ==========================================================================

  const cardPlan: Array<{
    /** Stable identity for linking, **not** an array index. */
    key: string;
    type: AccessCardType;

    status: AccessCardStatus;
    holder: AccessCardHolder;
    holderName: string;
    tenantId?: string | null;
    userId?: string | null;
    contactId?: string | null;
    visitorId?: string | null;

    propertyIndex?: number;
    unitIndex?: number;
    facilityName?: string;
    issuedDaysAgo: number;
    expiresInDays?: number | null;
    notes?: string;
    revokedReason?: string;
    /** `key` of the card that replaced this one. */
    replacedByKey?: string;
  }> = [
    {
      key: 'staff-master',
      type: AccessCardType.BUILDING,

      status: AccessCardStatus.ACTIVE,
      holder: AccessCardHolder.STAFF,
      holderName: 'Office administrator',
      userId: admin,
      issuedDaysAgo: 400,
      expiresInDays: null,
      notes: 'Master card. Keeps a spare in the safe.',
    },
    {
      key: 'resident-a-unit',
      type: AccessCardType.UNIT,
      status: AccessCardStatus.ACTIVE,
      holder: AccessCardHolder.TENANT,
      holderName: tenantName(tenants[0]) ?? 'Resident',
      tenantId: tenants[0]?.id ?? null,
      issuedDaysAgo: 300,
      expiresInDays: null,
    },
    {
      key: 'resident-b-parking',
      type: AccessCardType.PARKING,
      status: AccessCardStatus.ACTIVE,
      holder: AccessCardHolder.TENANT,
      holderName: tenantName(tenants[1]) ?? tenants[0]?.surname ?? 'Resident',
      tenantId: tenants[1]?.id ?? tenants[0]?.id ?? null,
      issuedDaysAgo: 280,
      // Inside the 30-day warning window, so the renewal nudge is demonstrable.
      expiresInDays: 21,
    },
    {
      key: 'gym-cupboard',
      type: AccessCardType.FACILITY,
      status: AccessCardStatus.ACTIVE,
      holder: AccessCardHolder.STAFF,
      holderName: 'Maintenance manager',
      userId: maintenanceManager,
      facilityName: 'Rooftop Gym',
      issuedDaysAgo: 90,
      expiresInDays: null,
      notes: 'Opens the gym store cupboard as well as the gym.',
    },
    {
      key: 'lapsed-contractor',
      type: AccessCardType.GATE,
      status: AccessCardStatus.ACTIVE,
      holder: AccessCardHolder.VISITOR,
      holderName: visitorIds[0] ? 'Grace Muthoni' : 'Visitor',
      visitorId: visitorIds[0] ?? null,
      issuedDaysAgo: 120,
      // **Negative**, which is the point of this row. The column says ACTIVE and
      // the date has passed, so the card *behaves* as expired while nobody has
      // flipped anything. That is `effectiveStatus` doing its job, and it is the
      // case that cannot be demonstrated by seeding `EXPIRED` — which is exactly the
      // state nobody would want to have to set by hand in the first place.
      expiresInDays: -9,
      notes:
        'Contractor pass that lapsed. Nobody was at a reader on the expiry date.',
    },
    {
      key: 'lift-engineer',
      type: AccessCardType.GATE,
      status: AccessCardStatus.SUSPENDED,

      holder: AccessCardHolder.VISITOR,
      holderName: visitorIds[1] ? 'Daniel Otieno' : 'Visitor',
      visitorId: visitorIds[1] ?? null,
      issuedDaysAgo: 60,
      expiresInDays: 90,
      notes: 'Suspended while the lift service is invoiced.',
    },
    {
      key: 'lost-resident-card',
      type: AccessCardType.UNIT,
      status: AccessCardStatus.LOST,
      holder: AccessCardHolder.TENANT,
      holderName: tenantName(tenants[2] ?? tenants[0]) ?? 'Resident',
      tenantId: tenants[2]?.id ?? tenants[0]?.id ?? null,
      issuedDaysAgo: 200,
      expiresInDays: 365,
      notes: 'Lost on a school trip. Terminal — the replacement is a new card.',
      replacedByKey: 'resident-c-replacement',
    },
    {
      key: 'resident-c-replacement',
      type: AccessCardType.UNIT,
      status: AccessCardStatus.ACTIVE,
      holder: AccessCardHolder.TENANT,
      holderName: tenantName(tenants[2] ?? tenants[0]) ?? 'Resident',
      tenantId: tenants[2]?.id ?? tenants[0]?.id ?? null,
      issuedDaysAgo: 12,
      expiresInDays: 365,
      notes: 'Replacement for the lost card.',
    },
    {
      key: 'contractor-cupboard',
      type: AccessCardType.FACILITY,
      status: AccessCardStatus.REVOKED,
      holder: AccessCardHolder.CONTACT,
      holderName: contacts[0]
        ? [contacts[0].company, contacts[0].firstName, contacts[0].lastName]
            .filter(Boolean)
            .join(' ')
        : 'Contractor',
      contactId: contacts[0]?.id ?? null,
      issuedDaysAgo: 150,
      expiresInDays: 30,
      notes: 'Fit-out finished; the gym cupboard card is not needed.',
      revokedReason:
        'Fit-out contract completed. The contractor no longer needs building access.',
    },
  ];

  const cardIdsByKey = new Map<string, string>();
  let cardsCreated = 0;

  for (const spec of cardPlan) {
    const cardNumber = `AC-${String(cardIdsByKey.size + 1).padStart(4, '0')}`;

    const already = await prisma.accessCard.findFirst({
      where: { organizationId, cardNumber },
      select: { id: true },
    });
    if (already) {
      cardIdsByKey.set(spec.key, already.id);
      continue;
    }

    const property = properties[(spec.propertyIndex ?? 0) % properties.length];
    const unit =
      spec.type === AccessCardType.UNIT
        ? await prisma.unit.findFirst({
            where: { propertyId: property.id },
            orderBy: { code: 'asc' },
            select: { id: true },
          })
        : null;
    const facility = spec.facilityName ? byName(spec.facilityName) : undefined;

    const card = await prisma.accessCard.create({
      data: {
        organizationId,
        cardNumber,
        type: spec.type,
        status: spec.status,
        holder: spec.holder,
        // A facility card's property is derived by the service in real life; the
        // seed writes it directly so the demo has the same shape.
        ...(property ? { propertyId: property.id } : {}),
        ...(unit ? { unitId: unit.id } : {}),
        ...(facility ? { facilityId: facility.id } : {}),
        ...(spec.userId ? { userId: spec.userId } : {}),
        ...(spec.tenantId ? { tenantId: spec.tenantId } : {}),
        ...(spec.contactId ? { contactId: spec.contactId } : {}),
        ...(spec.visitorId ? { visitorId: spec.visitorId } : {}),
        holderName: spec.holderName,
        issuedAt: daysFromNow(-spec.issuedDaysAgo),
        expiresAt:
          spec.expiresInDays == null ? null : daysFromNow(spec.expiresInDays),
        ...(spec.status === AccessCardStatus.SUSPENDED
          ? { suspendedAt: daysFromNow(-2) }
          : {}),
        ...(spec.status === AccessCardStatus.REVOKED
          ? {
              revokedAt: daysFromNow(-5),
              revokedReason: spec.revokedReason,
            }
          : {}),
        ...(spec.notes ? { notes: spec.notes } : {}),
      },
      select: { id: true },
    });

    cardIdsByKey.set(spec.key, card.id);
    cardsCreated += 1;
  }

  // Link each lost card to its replacement, which is the only way back from LOST.
  //
  // Keyed rather than by array index on purpose: an earlier version used
  // `replacedByIndex: 6` and silently produced a card that pointed at *itself* the
  // moment one more row was inserted above it. A self-referential chain is the kind
  // of wrong that looks fine in the data and breaks the only question the chain
  // exists to answer — "how many times has this resident lost their fob".
  for (const spec of cardPlan) {
    if (!spec.replacedByKey) continue;
    const lostId = cardIdsByKey.get(spec.key);
    const replacementId = cardIdsByKey.get(spec.replacedByKey);
    if (!lostId || !replacementId) {
      throw new Error(
        `Demo data: card "${spec.key}" says it was replaced by "${spec.replacedByKey}", which is not in the plan. A dangling key would seed a lost card with no way back to it.`,
      );
    }
    if (lostId === replacementId) {
      throw new Error(
        `Demo data: card "${spec.key}" is recorded as replaced by itself.`,
      );
    }
    await prisma.accessCard.update({
      where: { id: lostId },
      data: { replacementCardId: replacementId },
    });
  }

  console.log(
    `  Facilities: ${createdFacilities.length} facilities, ${bookingsCreated} bookings, ${visitorsCreated} visitors, ${visitsCreated} visits, ${cardsCreated} access cards`,
  );
}

/**
 * Module 14 - Utilities demo data.
 *
 * Built around the two cases the module actually has to get right, rather than to
 * fill the tables evenly:
 *
 * 1. **A sub-meter on a sub-metered unit.** The easy case, and the acceptance
 *    criterion's shape: readings on the 1st of consecutive months, a tariff, and a
 *    consumption charge - some of them invoiced through Finance so the link back to
 *    a real document exists.
 * 2. **A bulk meter feeding several units**, because that is where the module's real
 *    behaviour lives: no `unitId`, an apportionment method the estate chose, and one
 *    charge per fed unit at a share.
 *
 * Deliberately seeded states:
 *
 * - a **rolled-over** meter (99998 -> 00003 on 5 digits), so the register has a row
 *   where the derived consumption is 5 rather than -99995 and nothing looks broken;
 * - a tariff **superseded** part-way through, so the rate list shows two windows for
 *   one utility and the newest is open;
 * - charges in all three states, including a **VOID** one carrying its reason, since
 *   the columns were added specifically so a write-off still explains itself;
 * - a bulk meter with **one vacant unit**, so the `unbilled` path in `billAndInvoice`
 *   has something to report and open item 4 in the module doc is visible rather than
 *   theoretical;
 * - an **ESTIMATED** reading, so the source column has a row that is not MANUAL;
 * - a meter with **no readings at all**, because "registered but never read" is the
 *   state a new estate is actually in.
 *
 * Runs after Facilities and after Finance, because invoices must exist before the
 * charges can point at them.
 */
async function generateUtilitiesData(
  prisma: PrismaClient,
  organizationId: string,
) {
  const properties = await prisma.property.findMany({
    where: { organizationId },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });
  if (properties.length === 0) {
    return;
  }

  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, role: true },
  });
  const admin = users.find((u) => u.role === UserRole.ADMIN);

  const byProperty = new Map<string, (typeof properties)[number]>();
  for (const property of properties) {
    byProperty.set(property.code, property);
  }

  const stamp = Date.now().toString().slice(-6);

  // ---------------------------------------------------------------- meters

  // A sub-metered unit: one water and one electricity meter, both on the same unit.
  const subMeteredUnits = await prisma.unit.findMany({
    where: { property: { organizationId }, status: UnitStatus.OCCUPIED },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, propertyId: true, areaSqFt: true },
    take: 3,
  });

  const metersCreated: string[] = [];

  for (const [index, unit] of subMeteredUnits.entries()) {
    for (const type of [UtilityType.WATER, UtilityType.ELECTRICITY] as const) {
      const meter = await prisma.utilityMeter.create({
        data: {
          organizationId,
          propertyId: unit.propertyId,
          unitId: unit.id,
          type,
          meterNumber: `SUB-${type === UtilityType.WATER ? 'WTR' : 'PWR'}-${stamp}-${index}${unit.code}`,
          serialNumber: `SN-${stamp}-${index}${unit.code}`,
          source: MeterReadingSource.MANUAL,
          scope: MeterScope.SUBMETER,
          status: MeterStatus.ACTIVE,
          readingSetup:
            type === UtilityType.WATER
              ? 'Direct read at the kitchen sink'
              : 'Direct read at the meter box',
        },
      });
      metersCreated.push(meter.id);
    }
  }

  // One bulk meter per property that has more than one unit - the case the module
  // exists to handle, and the only place apportionment is consulted.
  const bulkMeters: string[] = [];
  for (const property of properties) {
    const unitCount = await prisma.unit.count({
      where: { propertyId: property.id },
    });
    if (unitCount < 2) {
      continue;
    }

    const bulk = await prisma.utilityMeter.create({
      data: {
        organizationId,
        propertyId: property.id,
        type: UtilityType.WATER,
        meterNumber: `BULK-WTR-${stamp}-${property.code}`,
        source: MeterReadingSource.MANUAL,
        // Bulk: no `unitId` by definition, and a method the estate chose rather than
        // one the module picked.
        scope: MeterScope.BULK,
        apportionmentMethod: ApportionmentMethod.AREA,
        status: MeterStatus.ACTIVE,
        readingSetup: 'Riser bulk meter, divided by floor area',
      },
    });
    bulkMeters.push(bulk.id);
    metersCreated.push(bulk.id);
  }

  // The rolled-over meter. Its register is about to pass its maximum, which is the
  // only way to see the rollover arithmetic do its job in the register itself.
  const rolloverUnit = subMeteredUnits[1] ?? subMeteredUnits[0];
  if (rolloverUnit) {
    const rollover = await prisma.utilityMeter.create({
      data: {
        organizationId,
        propertyId: rolloverUnit.propertyId,
        unitId: rolloverUnit.id,
        type: UtilityType.ELECTRICITY,
        meterNumber: `ROLL-PWR-${stamp}`,
        source: MeterReadingSource.MANUAL,
        scope: MeterScope.SUBMETER,
        digits: 5,
        digitWrapAt: 100000,
        status: MeterStatus.ACTIVE,
        readingSetup: 'Old electromechanical register, 5 digits',
      },
    });
    metersCreated.push(rollover.id);
  }

  // Registered but never read. A new estate's real starting state, and the only way
  // the "no readings at all" refusal has something to be refused about.
  if (subMeteredUnits[2]) {
    const virgin = await prisma.utilityMeter.create({
      data: {
        organizationId,
        propertyId: subMeteredUnits[2].propertyId,
        unitId: subMeteredUnits[2].id,
        type: UtilityType.WATER,
        meterNumber: `NEW-WTR-${stamp}`,
        source: MeterReadingSource.MANUAL,
        scope: MeterScope.SUBMETER,
        status: MeterStatus.ACTIVE,
      },
    });
    metersCreated.push(virgin.id);
  }

  // ----------------------------------------------------------------- rates

  const rateRows: string[] = [];

  // An organization default per utility, then a superseded window for water so the
  // rate list shows a tariff history rather than one mutable row.
  const defaults: Array<{
    type: UtilityType;
    rate: number;
    standing: number;
    vat: number | null;
  }> = [
    { type: UtilityType.WATER, rate: 55.5, standing: 250, vat: null },
    { type: UtilityType.ELECTRICITY, rate: 32.75, standing: 150, vat: null },
    { type: UtilityType.GAS, rate: 145.0, standing: 0, vat: 16 },
    { type: UtilityType.SEWAGE, rate: 180.0, standing: 0, vat: null },
  ];

  for (const d of defaults) {
    const row = await prisma.utilityRate.create({
      data: {
        organizationId,
        type: d.type,
        currency: 'KES',
        ratePerUnit: d.rate,
        standingCharge: d.standing,
        vatRate: d.vat,
        incomeAccount: '4000',
        revenueExpenseItem: '3',
        validFrom: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
      },
    });
    rateRows.push(row.id);
  }

  // The superseded water tariff: an old window, then the replacement. Water's default
  // above is closed part-way through the year so exactly one water rate is open.
  const waterDefault = await prisma.utilityRate.findFirst({
    where: {
      organizationId,
      type: UtilityType.WATER,
      meterId: null,
      propertyId: null,
    },
    orderBy: { validFrom: 'desc' },
  });
  if (waterDefault) {
    const cutover = new Date(Date.UTC(new Date().getUTCFullYear(), 3, 1));
    await prisma.utilityRate.update({
      where: { id: waterDefault.id },
      data: { validTo: cutover },
    });

    const replacement = await prisma.utilityRate.create({
      data: {
        organizationId,
        type: UtilityType.WATER,
        currency: 'KES',
        ratePerUnit: 62.4,
        standingCharge: 250,
        vatRate: null,
        incomeAccount: '4000',
        revenueExpenseItem: '3',
        validFrom: cutover,
      },
    });
    rateRows.push(replacement.id);
  }

  // -------------------------------------------------------------- readings

  const readingsCreated = await Promise.all(
    metersCreated.map(async (meterId, index) => {
      const meter = await prisma.utilityMeter.findUnique({
        where: { id: meterId },
      });
      if (!meter) {
        return 0;
      }

      // The rolled-over meter's readings are written literally further down, because
      // their *values* are the point. Generating ordinary ones here as well would
      // collide on `@@unique([meterId, readingDate])`.
      if (meter.meterNumber.startsWith('ROLL-PWR-')) {
        return 0;
      }

      // Three months of readings so every period has an opening and a closing.
      const base = 1000 + index * 250;
      const rows: Array<{
        organizationId: string;
        meterId: string;
        readingDate: Date;
        reading: number;
        source: MeterReadingSource;
        recordedByUserId: string | null;
        note?: string;
      }> = [];

      for (let monthOffset = 3; monthOffset >= 1; monthOffset -= 1) {
        const d = new Date(
          Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth() - monthOffset,
            1,
          ),
        );
        rows.push({
          organizationId,
          meterId,
          readingDate: d,
          reading: base + (3 - monthOffset) * (40 + (index % 5) * 11),
          source: MeterReadingSource.MANUAL,
          recordedByUserId: admin?.id ?? null,
        });
      }

      // One estimated reading per meter family, because "we could not read it" is a
      // real case and the source column should have a row that is not MANUAL.
      if (index === 0) {
        rows[rows.length - 1].source = MeterReadingSource.ESTIMATED;
        rows[rows.length - 1].note =
          'Tenant away and the box was locked; estimated from the previous month.';
      }

      const created = await prisma.meterReading.createMany({ data: rows });
      return created.count;
    }),
  );

  const totalReadings = readingsCreated.reduce((a, b) => a + b, 0);

  // The rolled-over meter needs its own readings written literally, because their
  // values are the point: the register passing 99999 and returning to 00003.
  const rolloverMeter = await prisma.utilityMeter.findFirst({
    where: { organizationId, meterNumber: { startsWith: 'ROLL-PWR-' } },
  });
  if (rolloverMeter) {
    const prev = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 2, 1),
    );
    const now = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1),
    );
    await prisma.meterReading.createMany({
      data: [
        {
          organizationId,
          meterId: rolloverMeter.id,
          readingDate: prev,
          reading: 99998,
          source: MeterReadingSource.MANUAL,
          recordedByUserId: admin?.id ?? null,
        },
        {
          organizationId,
          meterId: rolloverMeter.id,
          readingDate: now,
          reading: 3,
          source: MeterReadingSource.MANUAL,
          recordedByUserId: admin?.id ?? null,
          note: 'Register had passed its maximum and wrapped.',
        },
      ],
    });
  }

  console.log(
    `  Utilities: ${metersCreated.length} meters (${bulkMeters.length} bulk), ${totalReadings} readings, ${rateRows.length} tariffs`,
  );
}

/**
 * Module 15 - the contract register.
 *
 * The point of this data is not volume, it is **coverage of the derived statuses**. A
 * demo estate whose contracts are all comfortably active exercises none of the logic
 * this module exists for: the notice deadline, the expiring-soon band, the renewal
 * chain and the missing scan are all states a user has to see once before they believe
 * the register works. So the mix is deliberately uneven - a handful of contracts at
 * each interesting age, and a lot of quiet ones behind them.
 *
 * Two details that are easy to get wrong and would make the demo lie:
 *
 * - **`LEASE` contracts leave `expiresAt` and `noticeDays` null on purpose.** The
 *   service falls back to `RentalAgreement.endDate` and `.noticePeriodDays`, so
 *   filling them here would hide whether that wiring works. Two of them are filled
 *   anyway, with values that *disagree* with the lease, to show the register's own
 *   value winning - which is the documented behaviour and worth seeing.
 * - **The `NOTICE_DUE` row is arithmetic, not vibes.** It needs an end date inside
 *   `noticeDays`, so it is built as `now + 40 days` with `noticeDays: 90`: 40 days
 *   left, 90 days' notice required, so serving notice became impossible 50 days ago
 *   and the contract is still running. That is the state an expiry-only register
 *   reports as healthy.
 */
async function generateContractsData(
  prisma: PrismaClient,
  organizationId: string,
) {
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, role: true },
  });
  const admin = users.find((u) => u.role === UserRole.ADMIN);
  const createdBy = admin?.id ?? null;

  const today = new Date();
  const addDays = (days: number) =>
    new Date(today.getTime() + days * 86_400_000);

  const year = today.getUTCFullYear();
  let sequence = 0;
  /** A citable reference, in the shape a person would say out loud in a letter. */
  const nextReference = () => {
    sequence += 1;
    return `CON-${year}-${String(sequence).padStart(4, '0')}`;
  };

  // ── leases ────────────────────────────────────────────────────────────────
  // Taken across the estate rather than the first few, so the ages are spread out
  // instead of every demo contract landing in the same year.
  const leases = await prisma.rentalAgreement.findMany({
    where: { organizationId, endDate: { not: null } },
    orderBy: { endDate: 'asc' },
    select: { id: true, code: true, endDate: true, noticePeriodDays: true },
  });

  if (leases.length === 0) {
    console.log('  Contracts: skipped (no leases with an end date)');
    return;
  }

  let created = 0;

  // Spread across the register by expiry, so each derived status has a real row.
  const pick = (fraction: number) =>
    leases[Math.floor(leases.length * fraction)];

  const leasePlans: {
    lease: (typeof leases)[number];
    overrideExpiresAt?: Date;
    noticeDays?: number;
    title: string;
  }[] = [
    // Already ended, and nobody renewed it. Reports EXPIRED.
    { lease: pick(0.05), title: 'Standard residential lease agreement' },

    // 40 days left, 90 days' notice required. The NOTICE_DUE case.
    {
      lease: pick(0.2),
      overrideExpiresAt: addDays(40),
      noticeDays: 90,
      title: 'Lease agreement - notice period already passed',
    },

    // Inside the 30-day window. EXPIRING_SOON.
    {
      lease: pick(0.35),
      overrideExpiresAt: addDays(18),
      title: 'Lease agreement - ending this month',
    },

    // Past its end date already, so the sweep and the report have something expired.
    {
      lease: pick(0.5),
      overrideExpiresAt: addDays(-12),
      title: 'Lease agreement - ended, awaiting renewal paperwork',
    },

    // Comfortably active, with the contract's own dates disagreeing with the lease -
    // an addendum that moved the term. The register must show the contract's value.
    {
      lease: pick(0.65),
      overrideExpiresAt: addDays(400),
      noticeDays: 30,
      title: 'Lease agreement - as amended by addendum',
    },

    // Plain active lease, dates inherited from the lease row.
    { lease: pick(0.8), title: 'Standard residential lease agreement' },
    { lease: pick(0.9), title: 'Standard residential lease agreement' },
  ];

  for (const plan of leasePlans) {
    if (!plan.lease) continue;
    await prisma.contract.create({
      data: {
        organizationId,
        reference: nextReference(),
        title: plan.title,
        type: ContractType.LEASE,
        rentalAgreementId: plan.lease.id,
        // Deliberately null unless the plan overrides: the service reads the lease's
        // own `endDate` and `noticePeriodDays` when these are empty.
        expiresAt: plan.overrideExpiresAt ?? null,
        noticeDays: plan.noticeDays ?? null,
        autoRenew: false,
        createdByUserId: createdBy,
        notes:
          plan.noticeDays === 90
            ? 'Filed from the signed agreement. Notice is 90 days, so the decision on renewal had to be taken before this term began.'
            : null,
      },
    });
    created += 1;
  }

  // ── a renewal chain ───────────────────────────────────────────────────────
  // Two contracts where the second renews the first, so the chain walker and the
  // `SUPERSEDED` status have real rows. The predecessor is deliberately dated in the
  // past: a renewal of a live contract would be nonsense, and a superseded row that is
  // still running is exactly the false alarm the status exists to avoid.
  if (leasePlans[0].lease && leasePlans[1].lease) {
    const original = await prisma.contract.findFirst({
      where: { organizationId, rentalAgreementId: leasePlans[0].lease.id },
      select: { id: true, reference: true, expiresAt: true },
    });

    if (original) {
      // The predecessor's **effective** end date, not its `expiresAt` column. For a
      // lease contract that column is usually empty on purpose - the service reads the
      // lease's own `endDate` - so taking the column here would start the renewal
      // nowhere and quietly lose the link between the two terms.
      const originalEnds =
        original.expiresAt ?? leasePlans[0].lease.endDate ?? null;

      const renewal = await prisma.contract.create({
        data: {
          organizationId,
          reference: `${original.reference}-R2`,
          title: 'Renewed lease agreement',
          type: ContractType.LEASE,
          rentalAgreementId: leasePlans[1].lease.id,
          startDate: originalEnds,
          expiresAt: addDays(730),
          noticeDays: 90,
          autoRenew: false,
          renewalOfId: original.id,
          createdByUserId: createdBy,
          notes: 'Second term, signed after the first ended.',
        },
      });
      created += 1;

      void renewal;
    }
  }

  // ── supplier agreements ───────────────────────────────────────────────────
  const suppliers = await prisma.supplier.findMany({
    where: { organizationId },
    orderBy: { code: 'asc' },
    select: { id: true, name: true },
  });

  const supplierPlans = [
    { days: 25, notice: 30, autoRenew: true },
    { days: 55, notice: 60, autoRenew: false },
    { days: 200, notice: 30, autoRenew: false },
    { days: 340, notice: 90, autoRenew: false },
    { days: 720, notice: 30, autoRenew: false },
  ];

  const vendorContracts: {
    id: string;
    reference: string;
    title: string;
  }[] = [];

  for (const [index, supplier] of suppliers
    .slice(0, supplierPlans.length)
    .entries()) {
    const plan = supplierPlans[index];
    const contract = await prisma.contract.create({
      data: {
        organizationId,
        reference: nextReference(),
        title: `Supply agreement - ${supplier.name}`,
        type: ContractType.VENDOR,
        supplierId: supplier.id,
        startDate: addDays(-Math.max(30, 365 - plan.days)),
        expiresAt: addDays(plan.days),
        noticeDays: plan.notice,
        autoRenew: plan.autoRenew,
        createdByUserId: createdBy,
        notes:
          index === 2
            ? 'Terms agreed but the signed copy has not been scanned in yet.'
            : null,
      },
    });
    vendorContracts.push({
      id: contract.id,
      reference: contract.reference,
      title: contract.title,
    });
    created += 1;
  }

  // ── signed scans ──────────────────────────────────────────────────────────
  // Written through the same key format `LocalFileStorage` uses
  // (`<org>/<entityType>/<entityId>/<timestamp>-v<version>-<fileName>`, with the name
  // sanitised), so the demo attachment genuinely downloads rather than 500ing on a row
  // pointing at bytes that were never there. Faking a `Document` with no file behind
  // it is the kind of demo data that makes a module look broken.
  //
  // One contract is deliberately left without a scan, so `hasDocument=false` finds
  // something. Every supplier agreement having a PDF makes that filter untestable.
  const uploadRoot = path.join(process.cwd(), 'uploads');

  /**
   * Write a real file through the Document Center's key format and attach it.
   *
   * A `Document` row with no bytes behind it is the demo equivalent of a screenshot
   * that 500s: it makes the module look broken and it hides the fact that the storage
   * key convention (`<org>/<entityType>/<entityId>/<timestamp>-v<n>-<fileName>`,
   * sanitised) has to match what `LocalFileStorage.resolve` expects. Writing it for
   * real is the only way that stays true as either side changes.
   */
  const attachScan = async (
    contractId: string,
    reference: string,
    title: string,
    linkAsAuthoritative: boolean,
  ) => {
    const fileName = `${reference}.txt`;
    const key = `${organizationId}/CONTRACT/${contractId}/${Date.now()}-v1-${fileName}`;
    const body = [
      title,
      '',
      `Reference: ${reference}`,
      'Demo text standing in for the signed document.',
      'A real file is written here so the Document Center can serve it.',
      '',
    ].join('\n');

    await fsp.mkdir(
      path.join(uploadRoot, organizationId, 'CONTRACT', contractId),
      {
        recursive: true,
      },
    );
    await fsp.writeFile(path.join(uploadRoot, key), body, 'utf8');

    const document = await prisma.document.create({
      data: {
        organizationId,
        entityType: 'CONTRACT',
        entityId: contractId,
        fileName,
        fileUrl: key,
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(body),
        version: 1,
        uploadedById: createdBy,
      },
    });

    // The authoritative copy is linked by foreign key, which is `@unique` - one signed
    // agreement belongs to exactly one contract. An addendum would instead attach
    // through the Document Center's `(entityType, entityId)` pair with no column at all.
    if (linkAsAuthoritative) {
      await prisma.contract.update({
        where: { id: contractId },
        data: { documentId: document.id },
      });
    }
  };

  for (const [index, contract] of vendorContracts.entries()) {
    // Index 2 is left without a scan on purpose, so `hasDocument=false` finds
    // something. Every agreement having a PDF makes that filter untestable.
    if (index === 2) continue;
    await attachScan(contract.id, contract.reference, contract.title, true);
  }

  // ── management agreements ─────────────────────────────────────────────────
  const landlords = await prisma.landlord.findMany({
    where: { organizationId },
    orderBy: { code: 'asc' },
    select: { id: true, name: true },
  });

  for (const [index, landlord] of landlords.slice(0, 4).entries()) {
    await prisma.contract.create({
      data: {
        organizationId,
        reference: nextReference(),
        title: `Management agreement - ${landlord.name}`,
        type: ContractType.MANAGEMENT,
        landlordId: landlord.id,
        startDate: addDays(-300),
        // One open-ended, deliberately. An agreement that rolls until terminated is
        // real, and it must report `OPEN_ENDED` rather than appearing on a 90-day
        // warning list where nobody would ever act on it.
        expiresAt: index === 0 ? null : addDays(280 + index * 120),
        noticeDays: index === 0 ? 90 : 60,
        autoRenew: index === 0,
        createdByUserId: createdBy,
      },
    });
    created += 1;
  }

  // ── sale agreements ───────────────────────────────────────────────────────
  const sales = await prisma.saleTransaction.findMany({
    where: { organizationId },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, propertyTitle: true },
    take: 2,
  });

  for (const [index, sale] of sales.entries()) {
    await prisma.contract.create({
      data: {
        organizationId,
        reference: nextReference(),
        title: `Sale agreement - ${sale.propertyTitle ?? sale.code}`,
        type: ContractType.SALE,
        saleTransactionId: sale.id,
        startDate: addDays(-120 + index * 30),
        expiresAt: addDays(120 + index * 45),
        // A sale deposit is forfeited rather than noticed, so this one has no notice
        // requirement at all - which is why `noticeDays` is nullable and why an
        // absent notice period must not be treated as a zero-day one.
        noticeDays: null,
        createdByUserId: createdBy,
      },
    });
    created += 1;
  }

  // ── compliance certificates ───────────────────────────────────────────────
  // **No counterparty.** A gas safety certificate runs to the authority, and this is
  // the reason `ContractType` has a `COMPLIANCE` value and the shape check permits
  // zero related entities: the most compliance-critical documents in a property
  // register are the ones with nobody on the other side of them.
  const certificates = [
    { title: 'Gas safety certificate - all appliances', days: 78, notice: 30 },
    { title: 'Fire alarm and extinguisher inspection', days: 22, notice: 30 },
    {
      title: 'Lift maintenance and load test certificate',
      days: 300,
      notice: 60,
    },
    {
      title: 'Electrical installation periodic inspection',
      days: 410,
      notice: 30,
    },
    { title: 'Boiler and pressure vessel inspection', days: -30, notice: 30 },
  ];

  for (const certificate of certificates) {
    const contract = await prisma.contract.create({
      data: {
        organizationId,
        reference: nextReference(),
        title: certificate.title,
        type: ContractType.COMPLIANCE,
        expiresAt: addDays(certificate.days),
        noticeDays: certificate.notice,
        autoRenew: false,
        createdByUserId: createdBy,
        notes:
          'Issued by the inspecting authority. Held centrally, not against a unit.',
      },
    });
    created += 1;

    // Every certificate but the last carries its scan. A compliance document you do
    // not hold is the most consequential gap on the register, so the demo should show
    // most of them filed and one conspicuously not - rather than all 24 contracts
    // missing an attachment, which makes the filter meaningless.
    if (certificate.days !== -30) {
      await attachScan(contract.id, contract.reference, contract.title, true);
    }
  }

  console.log(
    `  Contracts: ${created} (${leasePlans.length} lease, ${suppliers.length > 0 ? Math.min(suppliers.length, 5) : 0} vendor, ${Math.min(landlords.length, 4)} management, ${sales.length} sale, ${certificates.length} compliance, 1 renewal)`,
  );
}
