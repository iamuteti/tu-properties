export interface FeatureItem {
  id: string;
  number: string;
  title: string;
  tagline: string;
  proofPoint: string;
  category: string;
  iconName: string;
  details: {
    label: string;
    value: string;
  }[];
  architectureBadge: string;
}

export const FEATURES: FeatureItem[] = [
  {
    id: 'property-units',
    number: '01',
    title: 'Property & Units',
    tagline: 'Multi-branch portfolio hierarchy with live lease synchronization',
    proofPoint: '100+ properties, occupancy tracking synced live from leases, CSV import with dry-run preview.',
    category: 'Asset Management',
    iconName: 'Building2',
    architectureBadge: 'Live Lease State Machine',
    details: [
      { label: 'Scale Capacity', value: '100+ properties per organization with branch grouping' },
      { label: 'Occupancy Sync', value: 'Derived automatically from active leases; zero manual toggle lag' },
      { label: 'Data Onboarding', value: 'CSV import engine with dry-run preview and per-row error isolation' }
    ]
  },
  {
    id: 'leasing-portal',
    number: '02',
    title: 'Leasing & Tenant Portal',
    tagline: 'Digital lifecycle management from application to move-out settlement',
    proofPoint: 'Digital lease lifecycle (activate, renew, extend, terminate), deposit settlement derived from deductions, tenants get their own portal.',
    category: 'Lease Operations',
    iconName: 'FileCheck2',
    architectureBadge: 'Lifecycle Guards',
    details: [
      { label: 'Lifecycle States', value: 'Strict transitions: Draft → Pending Approval → Active → Renewed/Extended → Terminated' },
      { label: 'Deposit Settlement', value: 'Deductions derived directly from logged inspection damage and outstanding utilities' },
      { label: 'Tenant Self-Service', value: 'Dedicated web portal for payment history, invoice download, and maintenance tickets' }
    ]
  },
  {
    id: 'owner-statements',
    number: '03',
    title: 'Owner Statements & Payouts',
    tagline: 'Audit-grade landlord accounting without manual spreadsheets',
    proofPoint: 'Owner income derived from real payment rows (never typed in), management fees, payouts with transfer references. Owners get statements by email/SMS.',
    category: 'Owner Relations',
    iconName: 'ReceiptText',
    architectureBadge: 'Payment-Row Derived Ledger',
    details: [
      { label: 'Income Derivation', value: 'Calculated strictly from matched tenant payments; never manually typed or estimated' },
      { label: 'Fee Deduction', value: 'Configurable management fee percentages deducted before net disbursement' },
      { label: 'Multi-Channel Dispatch', value: 'Automated monthly statements dispatched via PDF email and SMS summary link' }
    ]
  },
  {
    id: 'finance-accounting',
    number: '04',
    title: 'Finance & Accounting',
    tagline: 'Double-entry general ledger with tax rules configured as data',
    proofPoint: 'Real general ledger, multi-country tax engine (VAT, withholding tax as configuration, not code), supplier bills.',
    category: 'Core Accounting',
    iconName: 'Scale',
    architectureBadge: 'Double-Entry General Ledger',
    details: [
      { label: 'Ledger Engine', value: 'Balanced debits and credits posted on every financial event with immutability' },
      { label: 'Tax Configuration', value: 'VAT & withholding tax (WHT) defined via JSON rulesets per jurisdiction' },
      { label: 'Accounts Payable', value: 'Supplier bill ingestion, three-way matching against work orders, and aging reports' }
    ]
  },
  {
    id: 'payments-allocation',
    number: '05',
    title: 'Payments & Smart Allocation',
    tagline: 'Mobile money collection, card gateways, and mathematical settlement',
    proofPoint: 'M-Pesa STK push for mobile collection, card payments via Stripe, smart allocation (overpayments become spendable credit, oldest invoice settled first), multi-currency support, receipt PDFs, credit notes, approval-gated refunds.',
    category: 'Payment Infrastructure',
    iconName: 'CreditCard',
    architectureBadge: 'FIFO Waterfall Allocation',
    details: [
      { label: 'African Mobile Money', value: 'Native M-Pesa STK push with instant C2B/B2C webhook reconciliation' },
      { label: 'Smart Waterfall', value: 'Oldest outstanding invoice knocked off first; surplus converts to spendable credit' },
      { label: 'Refund Security', value: 'Approval-gated refund workflow with audit trail and automated credit notes' }
    ]
  },
  {
    id: 'maintenance-engine',
    number: '06',
    title: 'Maintenance',
    tagline: 'From tenant request to vendor payout with SLA response tracking',
    proofPoint: 'Work orders from request to close with an emergency fast-track, preventive schedules, response-time tracking.',
    category: 'Operations',
    iconName: 'Wrench',
    architectureBadge: 'SLA Escalation Engine',
    details: [
      { label: 'Emergency Fast-Track', value: 'Bypasses standard triage for immediate plumber/electrician dispatch with SMS alerts' },
      { label: 'Preventive Schedules', value: 'Automated recurring servicing for elevators, generators, water pumps, and HVAC' },
      { label: 'SLA Metrics', value: 'Response-time tracking with vendor completion certificates and tenant sign-off' }
    ]
  },
  {
    id: 'utilities-engine',
    number: '07',
    title: 'Utilities & Metering',
    tagline: 'Guaranteed billing integrity with bulk-to-submeter apportionment',
    proofPoint: 'Meter readings, tariffs with validity windows, apportionment (incl. bulk meters), one bill per meter per month guaranteed.',
    category: 'Utility Billing',
    iconName: 'Zap',
    architectureBadge: 'Single-Bill Monthly Guard',
    details: [
      { label: 'Tariff Engines', value: 'Time-windowed rate tiers with support for seasonal and regulatory adjustments' },
      { label: 'Apportionment Logic', value: 'Bulk inlet meters reconciled against submeters with common-area distribution' },
      { label: 'Zero Double-Billing', value: 'Database constraint guarantees exactly one bill per physical meter per calendar month' }
    ]
  },
  {
    id: 'hr-payroll',
    number: '08',
    title: 'HR & Statutory Payroll',
    tagline: 'Jurisdiction-specific statutory deductions calculated out of the box',
    proofPoint: 'Statutory payroll out of the box (PAYE, NSSF, SHIF, housing levy where applicable, configurable per country), leave management.',
    category: 'Workforce',
    iconName: 'Users2',
    architectureBadge: 'Tax & Labor Config Engine',
    details: [
      { label: 'Statutory Presets', value: 'Pre-configured for Kenya (PAYE, NSSF, SHIF, Housing Levy 1.5%), customizable for other regions' },
      { label: 'Leave Management', value: 'Annual, sick, and compassionate leave accruals with caretaker coverage handovers' },
      { label: 'Property Allocation', value: 'Caretaker and security guard payroll costs allocated directly to property P&Ls' }
    ]
  },
  {
    id: 'reports-analytics',
    number: '09',
    title: 'Reports & Landlord ROI',
    tagline: 'Real-time operational business intelligence with instant CSV extraction',
    proofPoint: 'Occupancy, financial, sales, maintenance, landlord ROI; every report exports to CSV.',
    category: 'Business Intelligence',
    iconName: 'BarChart3',
    architectureBadge: 'Zero-Lag Query Aggregators',
    details: [
      { label: 'Core Metrics', value: 'Occupancy velocity, arrears aging buckets, vendor expenditure, and gross rental yield' },
      { label: 'Landlord ROI', value: 'Capital invested vs net yield factoring management fees, repairs, and vacancy rates' },
      { label: 'Audit Extraction', value: 'One-click export to CSV across every single report view with zero row truncation' }
    ]
  },
  {
    id: 'approvals-governance',
    number: '10',
    title: 'Approvals & Governance',
    tagline: 'Entity-agnostic dual control with complete non-repudiation audit trails',
    proofPoint: 'Entity-agnostic workflow engine: nobody approves their own request, delegation, full audit trail.',
    category: 'Governance & Security',
    iconName: 'ShieldCheck',
    architectureBadge: 'Dual-Control Segregation',
    details: [
      { label: 'Self-Approval Block', value: 'Hard cryptographic rule preventing any user from approving their own financial request' },
      { label: 'Delegation Rules', value: 'Time-bound delegation windows during officer leave with fallback escalation' },
      { label: 'Complete Audit Log', value: 'Full immutable timeline tracking timestamp, actor ID, IP address, and previous state' }
    ]
  }
];

export const TRUST_POINTS = [
  {
    title: 'Computed From Existing Records',
    description: 'Every balance, statement, and tax figure is derived strictly from verified transactional records. Numbers are computed on the fly, never typed in or overwritten by hand.',
    badge: 'Derived Math Only'
  },
  {
    title: 'Immutable Audit Logging',
    description: 'Every lease modification, payment allocation, invoice discount, and refund is committed with a non-repudiation log containing actor ID, timestamp, and field deltas.',
    badge: 'Append-Only Logs'
  },
  {
    title: '12 Admin-Defined Roles',
    description: 'Fine-grained permissions prevent cross-boundary actions. Finance officers cannot alter leases; letting agents cannot override tax formulas; caretakers only access assigned properties.',
    badge: 'Strict RBAC'
  },
  {
    title: 'Tenant-Level Data Isolation',
    description: 'Organizations operate in strictly partitioned database tenants. Your leases, banking references, and tenant directories are never co-mingled with other companies.',
    badge: 'Isolated Tenants'
  }
];

export const ADMIN_ROLES = [
  'Super Admin',
  'Branch Manager',
  'Finance Director',
  'Letting Agent',
  'Property Caretaker',
  'Maintenance Lead',
  'Utility Auditor',
  'Payroll Officer',
  'Compliance Auditor',
  'Legal Officer',
  'Front Desk',
  'Auditor (Read-Only)'
];

export const NOTIFICATION_SCHEDULE = [
  { days: '60 Days', trigger: 'First Lease Expiry Reminder', channel: 'Tenant Portal + Email', target: 'Tenant & Letting Agent' },
  { days: '30 Days', trigger: 'Formal Renewal Offer Prompt', channel: 'Tenant Portal + Email + SMS', target: 'Tenant & Letting Agent' },
  { days: '14 Days', trigger: 'Intent Notice Deadline', channel: 'SMS + Push Alert', target: 'Letting Agent & Branch Manager' },
  { days: '7 Days', trigger: 'Move-Out Inspection Scheduling', channel: 'Automated Calendar Dispatch', target: 'Caretaker & Tenant' },
  { days: 'Day 1 of Month', trigger: 'Rent Due Notification', channel: 'M-Pesa STK Link + Email Invoice', target: 'Active Tenant' },
  { days: 'Day 5 of Month', trigger: 'Overdue Arrears Escalation', channel: 'Escalation Notice to Property Lead', target: 'Finance & Tenant' }
];

export const METRICS = {
  units: '2,500+',
  tenancies: '1,900+',
  invoices: '1,600+',
  caption: 'Demo data for illustration'
};

export const TESTIMONIALS = [
  {
    quote: 'Before TU Properties, reconciling monthly rent across 420 units in Kilimani and Westlands meant matching paper bank slips and M-Pesa statements for days. Now every payment auto-settles against the oldest invoice and owners receive verified statements without a single manual calculation.',
    author: 'Wanjiru Kamau',
    role: 'Principal Managing Partner',
    company: 'Apex Crest Realty Partners',
    city: 'Nairobi, Kenya',
    unitsManaged: '420 Residential & Commercial Units',
    mandatoryLabel: 'Illustrative example'
  },
  {
    quote: 'Handling multi-branch property portfolios in Victoria Island and Ikeja requires uncompromising accounting. TU Properties gives us double-entry ledgers where withholding tax and VAT are clean configuration rows, not Excel guesswork. Our landlords trust the numbers implicitly.',
    author: 'Babatunde Adeleke',
    role: 'Director of Asset Management',
    company: 'Lekki Metropolitan Letting Agency',
    city: 'Lagos, Nigeria',
    unitsManaged: '680 Managed Units',
    mandatoryLabel: 'Illustrative example'
  }
];

export const PRICING_PLANS = [
  {
    name: 'Starter',
    badge: 'Independent Landlords & Small Firms',
    description: 'For private landlords and emerging letting agents managing up to 50 units across a single branch.',
    pricing: {
      USD: { monthly: 49, annual: 39 },
      KES: { monthly: 6500, annual: 5200 },
      NGN: { monthly: 75000, annual: 60000 },
      ZAR: { monthly: 900, annual: 720 }
    },
    features: [
      'Up to 50 active units across 1 branch',
      'Digital lease lifecycle with renewal guards',
      'Tenant self-service portal (invoices & tickets)',
      'M-Pesa & Stripe automated payment logging',
      'Derived owner statements & CSV exports',
      'Statutory utility billing (1 bill per meter/mo)',
      'Email & in-app support'
    ],
    highlighted: false,
    cta: 'Start 14-Day Free Trial'
  },
  {
    name: 'Professional',
    badge: 'Growing Property Management Companies',
    description: 'Complete multi-tenant operations for established agencies running multiple buildings and dedicated staff.',
    pricing: {
      USD: { monthly: 129, annual: 99 },
      KES: { monthly: 17000, annual: 13000 },
      NGN: { monthly: 195000, annual: 150000 },
      ZAR: { monthly: 2400, annual: 1850 }
    },
    features: [
      'Up to 300 active units across 5 branches',
      'All Starter features included',
      'FIFO smart payment waterfall & credit wallet',
      'Entity-agnostic approval workflows (dual control)',
      'Multi-country tax engine (configurable VAT/WHT)',
      'Statutory HR & Payroll module out of the box',
      'Preventive maintenance scheduler & emergency fast-track',
      '12 admin-defined role permissions matrix',
      'Priority WhatsApp & phone escalation'
    ],
    highlighted: true,
    cta: 'Start 14-Day Free Trial'
  },
  {
    name: 'Enterprise',
    badge: 'Institutional Portfolios & Multi-Country Firms',
    description: 'Bespoke infrastructure for large-scale property management corporations operating across several African borders.',
    pricing: {
      USD: { monthly: 299, annual: 249 },
      KES: { monthly: 39000, annual: 32000 },
      NGN: { monthly: 450000, annual: 375000 },
      ZAR: { monthly: 5500, annual: 4600 }
    },
    features: [
      'Unlimited units & unlimited branches',
      'All Professional features included',
      'Custom statutory payroll adapters (pan-African)',
      'Dedicated organization tenant database partitioning',
      'Direct ERP / General ledger webhook streaming',
      'Custom SLA guarantees with 99.95% uptime',
      'Dedicated account manager & migration engineer',
      'Quarterly security audit certificates'
    ],
    highlighted: false,
    cta: 'Start 14-Day Free Trial'
  }
];

export const FAQS = [
  {
    question: 'Do my figures reconcile?',
    answer: 'Yes — completely and deterministically. Every figure in TU Properties is derived directly from verified transactional records, never typed in or manually amended. Our double-entry general ledger enforces strict balancing rules with overlapping-period guards that prevent duplicate billing, split dates, or ghost revenue entries. If a payment is logged, owner statements, tenant balances, and tax withholdings update automatically.'
  },
  {
    question: 'Can tenants and owners log in?',
    answer: 'Tenants get their own dedicated self-service web portal today where they can review active leases, settle rent via M-Pesa STK push or card, view past invoice receipts, download tax statements, and submit maintenance tickets with photos. The Owner Portal is currently in active private preview and coming shortly — in the meantime, property owners receive automated, verified income statements and payout receipts with bank transfer references directly via email PDF and SMS summary.'
  },
  {
    question: 'Does it handle my country\'s taxes?',
    answer: 'Yes. TU Properties treats tax rules and statutory payroll deductions as modular configuration rows rather than hardcoded logic. Kenya ships completely out of the box with KRA-compliant 16% VAT, 10% Withholding Tax (WHT), PAYE, NSSF, SHIF, and the Affordable Housing Levy (1.5%). You can configure or tweak rates for Nigeria (FIRS VAT & WHT), South Africa (SARS), Ghana (GRA), Rwanda, or any target tax regime through simple admin configuration panels without touching a line of code.'
  },
  {
    question: 'Can I import my existing data?',
    answer: 'Yes. We provide robust CSV import templates for properties, physical units, tenant contacts, and opening lease balances. Every import runs through an automated dry-run validation preview before anything touches the database. You receive an immediate per-row validation report highlighting any format anomalies or lease date overlaps so you can fix errors before committing.'
  }
];
