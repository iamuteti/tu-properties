import { PrismaClient, UnitStatus, LeaseStatus, InvoiceStatus, PaymentMethod, ReceiptType, ReceiptCategory, PaymentType, ReceiptTo, DRTOrDRF, Landlord, Property, Unit, Tenant, Lease, Invoice } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import { PROPERTY_CATEGORIES, PROPERTY_TYPES, UNIT_TYPES } from '@/common/contants';

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
  'John', 'Mary', 'Peter', 'Sarah', 'David', 'Jane', 'Michael', 'Emma', 'James', 'Lisa',
  'Daniel', 'Grace', 'Joseph', 'Ruth', 'Samuel', 'Elizabeth', 'Paul', 'Martha', 'Andrew', 'Hannah',
  'William', 'Rebecca', 'Thomas', 'Rachel', 'Charles', 'Esther', 'Robert', 'Deborah', 'George', 'Miriam',
  'Edward', 'Sarah', 'Henry', 'Naomi', 'Walter', 'Abigail', 'Arthur', 'Lydia', 'Harold', 'Anna',
  'Mwangi', 'Wanjiku', 'Kamau', 'Nyambura', 'Njoroge', 'Wambui', 'Kariuki', 'Njeri', 'Gichuki', 'Wangari',
  'Ochieng', 'Akinyi', 'Omondi', 'Adhiambo', 'Otieno', 'Anyango', 'Odinga', 'Atieno', 'Ouma', 'Awuor'
];

const kenyanLastNames = [
  'Smith', 'Brown', 'Johnson', 'Williams', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Mwangi', 'Kamau', 'Njoroge', 'Kariuki', 'Gichuki', 'Wainaina', 'Ngugi', 'Mugo', 'Kibet', 'Kipchoge',
  'Ochieng', 'Omondi', 'Otieno', 'Odinga', 'Ouma', 'Owino', 'Okoth', 'Onyango', 'Odhiambo', 'Oloo',
  'Kimani', 'Ndungu', 'Gatheru', 'Macharia', 'Maina', 'Ndegwa', 'Gichuhi', 'Muriuki', 'Mutiso', 'Musyoka'
];

// Generate random name
const randomName = (): string => {
  return `${kenyanFirstNames[Math.floor(Math.random() * kenyanFirstNames.length)]} ${kenyanLastNames[Math.floor(Math.random() * kenyanLastNames.length)]}`;
};

// Generate random address
const randomAddress = (): string => {
  const streets = ['Main St', 'First Ave', 'Park Rd', 'High St', 'Oak St', 'Kenyatta Ave', 'Moi Ave', 'Uhuru Hwy'];
  const cities = ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret', 'Thika', 'Malindi', 'Kitale'];
  return `${Math.floor(Math.random() * 1000) + 1} ${streets[Math.floor(Math.random() * streets.length)]}, ${cities[Math.floor(Math.random() * cities.length)]}`;
};

// Property names for more realistic data
const propertyPrefixes = [
  'Riverside', 'Westlands', 'Kilimani', 'Lavington', 'Karen', 'Langata', 'Kileleshwa', 'Parklands',
  'Spring Valley', 'Muthaiga', 'Runda', 'Gigiri', 'Rosslyn', 'Loresho', 'Mountain View', 'Embakasi',
  'South B', 'South C', 'Eastleigh', 'Westlands', 'Industrial Area', 'CBD', 'Upper Hill', 'Nairobi West'
];

const propertySuffixes = [
  'Heights', 'Plaza', 'Gardens', 'Towers', 'Mall', 'Complex', 'Court', 'Terrace', 'Villas', 'Apartments',
  'Suites', 'Residence', 'House', 'Mansion', 'Estate', 'Village', 'Cottage', 'Manor', 'Lodge', 'Studio'
];

// Generate random property name
const randomPropertyName = (index: number): string => {
  const prefix = propertyPrefixes[Math.floor(Math.random() * propertyPrefixes.length)];
  const suffix = propertySuffixes[Math.floor(Math.random() * propertySuffixes.length)];
  return `${prefix} ${suffix} ${index}`;
};

// Generate demo data for Rohi Estate Management
export async function generateDemoData(prisma: PrismaClient, organizationId: string) {
  console.log('Generating demo data for Rohi Estate Management...');

  // ========== Landlords (120 landlords) ==========
  console.log('Generating landlords...');
  const landlords: Landlord[] = [];
  for (let i = 1; i <= 120; i++) {
    const name = randomName();
    const landlord = await prisma.landlord.create({
      data: {
        code: `LL${String(i).padStart(3, '0')}`,
        name,
        email: randomEmail(name),
        phone: randomPhone(),
        address: randomAddress(),
        bankName: ['Equity Bank', 'KCB Bank', 'Co-op Bank', 'Absa Bank', 'Standard Chartered', 'NCBA Bank', 'I&M Bank', 'Stanbic Bank'][Math.floor(Math.random() * 8)],
        bankBranch: ['Nairobi CBD', 'Westlands', 'Kilimani', 'Mombasa Rd', 'Thika Rd', 'Junction', 'Sarit Centre'][Math.floor(Math.random() * 7)],
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
      ? PROPERTY_CATEGORIES.find(c => c.value === 'residential')!
      : PROPERTY_CATEGORIES[Math.floor(Math.random() * 4) + 1]; // Commercial, Industrial, Retail, Office
    
    // Select property type based on category
    let propertyType;
    if (isResidential) {
      // Residential: Apartment, House, Condo, Townhouse, Studio
      const residentialTypes = PROPERTY_TYPES.filter(t => ['apartment', 'house', 'condo', 'townhouse', 'studio'].includes(t.value));
      propertyType = residentialTypes[Math.floor(Math.random() * residentialTypes.length)];
    } else {
      // Commercial: Warehouse, Factory, Storefront, Office Space, Retail Space
      const commercialTypes = PROPERTY_TYPES.filter(t => ['warehouse', 'factory', 'storefront', 'office-space', 'retail-space'].includes(t.value));
      propertyType = commercialTypes[Math.floor(Math.random() * commercialTypes.length)];
    }
    
    const property = await prisma.property.create({
      data: {
        code: `PROP-${String(i).padStart(3, '0')}`,
        name: randomPropertyName(i),
        estateArea: propertyPrefixes[Math.floor(Math.random() * propertyPrefixes.length)],
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
        const residentialTypes = UNIT_TYPES.filter(t => ['two-bedroom', 'one-bedroom', 'studio', 'executive-suite'].includes(t.value));
        unitType = residentialTypes[Math.floor(Math.random() * residentialTypes.length)];
        
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
        const commercialTypes = UNIT_TYPES.filter(t => ['commercial-space', 'warehouse', 'office', 'retail'].includes(t.value));
        unitType = commercialTypes[Math.floor(Math.random() * commercialTypes.length)];
        
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
          status: Math.random() > 0.25 ? UnitStatus.OCCUPIED : UnitStatus.VACANT,
        },
      });
      units.push(unit);
    }
  }
  console.log(`Generated ${units.length} units`);

  // ========== Tenants (one per occupied unit, no leases for 99.9% residential) ==========
  console.log('Generating tenants...');
  const tenants: Tenant[] = [];
  const occupiedUnits = units.filter(unit => unit.status === UnitStatus.OCCUPIED);
  
  for (let i = 1; i <= occupiedUnits.length; i++) {
    const name = randomName();
    const tenant = await prisma.tenant.create({
      data: {
        accountNumber: `TEN-${String(i).padStart(4, '0')}`,
        code: `T${String(i).padStart(4, '0')}`,
        surname: name.split(' ')[1],
        otherNames: name.split(' ')[0],
        email: randomEmail(name),
        phone: randomPhone(),
        town: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Eldoret'][Math.floor(Math.random() * 5)],
        organizationId,
      },
    });
    tenants.push(tenant);
  }
  console.log(`Generated ${tenants.length} tenants`);

  // ========== Leases (only 20% of commercial, almost none for residential) ==========
  console.log('Generating leases...');
  const leases: (Lease & { tenant: Tenant; unit: Unit })[] = [];
  let leaseIndex = 0;
  
  for (let i = 0; i < occupiedUnits.length; i++) {
    const unit = occupiedUnits[i];
    const property = properties.find(p => p.id === unit.propertyId)!;
    
    // Determine if we should create a lease based on property category
    let leaseProbability: number;
    if (property.category === 'residential') {
      leaseProbability = 0.001; // Only 0.1% of residential units have formal leases
    } else {
      leaseProbability = 0.20; // 20% of commercial units have formal leases
    }
    
    if (Math.random() < leaseProbability) {
      const tenant = tenants[i]; // Use the tenant at the same index as the unit
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 365));
      
      const endDate = new Date(startDate);
      endDate.setFullYear(endDate.getFullYear() + 1); // 1 year lease
      
      // 90% of tenancies have security deposits
      const hasSecurityDeposit = Math.random() < 0.90;
      const securityDeposit = hasSecurityDeposit ? Number(unit.baseRent) * 2 : null; // Typically 2 months rent
      
      const lease = await prisma.lease.create({
        data: {
          code: `L-${String(leaseIndex + 1).padStart(4, '0')}`,
          unitId: unit.id,
          tenantId: tenant.id,
          startDate,
          endDate,
          rentAmount: Number(unit.baseRent),
          securityDeposit,
          status: LeaseStatus.ACTIVE,
          organizationId,
        },
      });
      leases.push({ ...lease, tenant, unit });
      leaseIndex++;
    }
  }
  console.log(`Generated ${leases.length} leases`);

  // ========== Invoices, Payments, and Receipts (for all occupied units) ==========
  console.log('Generating invoices, payments, and receipts...');
  const months = 9; // 9 months of data
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - months * 30);
  
  let invoiceCount = 0;
  let paymentCount = 0;
  let receiptCount = 0;

  // Create invoices for all occupied units (tenants with or without formal leases)
  for (let i = 0; i < occupiedUnits.length; i++) {
    const unit = occupiedUnits[i];
    const property = properties.find(p => p.id === unit.propertyId)!;
    const tenant = tenants[i]; // Each occupied unit has a corresponding tenant
    
    // Find if there's a lease for this unit
    const lease = leases.find(l => l.unit.id === unit.id);
    const leaseId = lease ? lease.id : null;

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
      
      const paidAmount = isPaid ? Number(unit.baseRent) : (isPartial ? Math.floor(Number(unit.baseRent) * Math.random() * 0.8) : 0);
      const balanceAmount = Number(unit.baseRent) - paidAmount;
      
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: `INV-${invoiceDate.getFullYear()}${String(invoiceDate.getMonth() + 1).padStart(2, '0')}-${invoiceCount}${randomString(4)}`,
          leaseId,
          issueDate: invoiceDate,
          dueDate,
          amount: Number(unit.baseRent),
          totalAmount: Number(unit.baseRent),
          balanceAmount,
          paidAmount,
          status: isPaid ? InvoiceStatus.PAID : (isPartial ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.PENDING),
          organizationId,
        },
      });
      invoiceCount++;

      // Create payment if invoice is paid or partially paid
      if (paidAmount > 0) {
        const paymentDate = new Date(invoiceDate);
        paymentDate.setDate(paymentDate.getDate() + Math.floor(Math.random() * 10) + 1); // Payment 1-10 days after invoice
        
        const paymentMethod = Object.values(PaymentMethod)[Math.floor(Math.random() * Object.values(PaymentMethod).length)];
        
        const payment = await prisma.payment.create({
          data: {
            leaseId,
            invoiceId: invoice.id,
            paymentDate,
            amount: paidAmount,
            currency: 'KES',
            paymentMethod,
            paymentReference: paymentMethod === PaymentMethod.MPESA ? randomString(10) : `REF-${randomString(8)}`,
            payee: `${tenant.surname} ${tenant.otherNames}`,
            paidFrom: paymentMethod === PaymentMethod.MPESA ? 'M-PESA' : 'Bank Transfer',
            paidTo: 'Operating Account',
            paymentType: PaymentType.ApplyToBill,
            recordedBy: ['MASHABAZI GIDEON', 'John Smith', 'Mary Johnson', 'Admin User'][Math.floor(Math.random() * 4)],
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
            recordedBy: ['MASHABAZI GIDEON', 'John Smith', 'Mary Johnson', 'Admin User'][Math.floor(Math.random() * 4)],
            payments: { connect: { id: payment.id } },
            organizationId,
          },
        });
        receiptCount++;
      }
    }
  }

  console.log(`Generated ${invoiceCount} invoices, ${paymentCount} payments, and ${receiptCount} receipts`);
  console.log('Demo data generation completed!');
  
  return {
    landlords: landlords.length,
    properties: properties.length,
    units: units.length,
    tenants: tenants.length,
    leases: leases.length,
    invoices: invoiceCount,
    payments: paymentCount,
    receipts: receiptCount,
  };
}

// Main function to run demo data generation standalone
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // Clean existing demo data
    console.log('Cleaning existing demo data...');
    await prisma.receiptLine.deleteMany();
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

    // Check if Rohi Estate Management organization exists, or create it
    let organization = await prisma.organization.findFirst({
      where: { slug: 'rohi-estate-management' },
    });

    if (!organization) {
      organization = await prisma.organization.create({
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
      console.log(`Created organization: ${organization.name}`);
    } else {
      console.log(`Using existing organization: ${organization.name}`);
    }

    // Generate demo data
    await generateDemoData(prisma, organization.id);
    console.log('Demo data generation completed successfully!');
  } catch (error) {
    console.error('Error generating demo data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
