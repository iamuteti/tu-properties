/** Module keys organized by sidebar group, for the per-org toggle UI.
 *  Keys match `NavItem.module` in `components/layout/sidebar.tsx` and
 *  `Subscription.enabledModules` on the backend. Always-on items
 *  (Dashboard, Settings, Support) and Platform (SUPER_ADMIN only) are
 *  intentionally absent — they are not togglable.
 */
export const MODULE_GROUPS = [
    {
        label: 'Maintenance',
        key: 'maintenance',
        children: [
            { key: 'maintenance/work-orders', label: 'Work orders' },
            { key: 'maintenance/work-orders/board', label: 'Board' },
            { key: 'maintenance/assets', label: 'Plant register' },
            { key: 'maintenance/schedules', label: 'Service schedule' },
        ],
    },
    {
        label: 'Procurement',
        key: 'procurement',
        children: [
            { key: 'procurement/purchase-requests', label: 'Purchase requests' },
            { key: 'procurement/rfqs', label: 'Quotations' },
            { key: 'procurement/purchase-orders', label: 'Purchase orders' },
            { key: 'procurement/suppliers', label: 'Suppliers' },
        ],
    },
    {
        label: 'Inventory',
        key: 'inventory',
        children: [
            { key: 'inventory/items', label: 'Items' },
            { key: 'inventory/warehouses', label: 'Stores' },
            { key: 'inventory/stock-movements', label: 'Stock ledger' },
        ],
    },
    {
        label: 'Landlords',
        key: 'landlords',
        children: [
            { key: 'landlords', label: 'Owners' },
            { key: 'landlords/statements', label: 'Owner statements' },
            { key: 'landlords/payouts', label: 'Owner payouts' },
        ],
    },
    {
        label: 'Properties',
        key: 'properties',
        children: [
            { key: 'properties', label: 'All Properties' },
            { key: 'properties/units', label: 'All Units' },
        ],
    },
    {
        label: 'CRM',
        key: 'crm',
        children: [
            { key: 'crm/leads', label: 'Leads & pipeline' },
            { key: 'crm/contacts', label: 'Contacts' },
        ],
    },
    {
        label: 'Sales',
        key: 'sales',
        children: [
            { key: 'sales', label: 'Sales pipeline' },
            { key: 'sales/commissions', label: 'Commissions' },
        ],
    },
    {
        label: 'Tenants & Agreements',
        key: 'tenants',
        children: [
            { key: 'tenants', label: 'Tenants' },
            { key: 'agreements', label: 'Agreements' },
            { key: 'tenant-requests', label: 'Tenant requests' },
            { key: 'moving-out', label: 'Moving Out' },
            { key: 'security-deposits', label: 'Security deposits' },
        ],
    },
    {
        label: 'Billing & Finance',
        key: 'billing',
        children: [
            { key: 'invoices', label: 'Invoices' },
            { key: 'payments', label: 'Payments' },
            { key: 'arrears', label: 'Arrears' },
            { key: 'payables', label: 'Payables' },
            { key: 'finance/suppliers', label: 'Suppliers' },
            { key: 'refunds', label: 'Refunds' },
            { key: 'credits', label: 'Customer Credits' },
            { key: 'receipts', label: 'Receipts' },
            { key: 'rent-receipts', label: 'Rent Receipts' },
            { key: 'chart-of-accounts', label: 'Chart of Accounts' },
            { key: 'journal-entries', label: 'Journal Entries' },
            { key: 'trial-balance', label: 'Trial Balance' },
        ],
    },
    {
        label: 'HR & Payroll',
        key: 'hr',
        children: [
            { key: 'hr/employees', label: 'Employees' },
            { key: 'hr/leave', label: 'Leave' },
            { key: 'hr/payroll', label: 'Payroll runs' },
            { key: 'hr/settings/payroll-rules', label: 'Statutory rules' },
            { key: 'hr/me', label: 'My account' },
        ],
    },
    {
        label: 'Facilities',
        key: 'facilities',
        children: [
            { key: 'facilities', label: 'Facility register' },
            { key: 'facilities/bookings', label: 'Bookings' },
            { key: 'facilities/visits', label: 'The gate book' },
            { key: 'facilities/visitors', label: 'Visitors' },
            { key: 'facilities/access-cards', label: 'Access cards' },
        ],
    },
    {
        label: 'Utilities',
        key: 'utilities',
        children: [
            { key: 'utilities', label: 'Meter register' },
            { key: 'utilities/readings', label: 'Readings' },
            { key: 'utilities/tariffs', label: 'Tariffs' },
            { key: 'utilities/billing', label: 'Billing' },
        ],
    },
    {
        label: 'Contracts',
        key: 'contracts',
        children: [
            { key: 'contracts', label: 'Contract register' },
            { key: 'contracts/expiry-report', label: 'Expiry report' },
            { key: 'contracts/new', label: 'File a contract' },
        ],
    },
    {
        label: 'Reports',
        key: 'reports',
        children: [],
    },
    {
        label: 'Users',
        key: 'users',
        children: [],
    },
    {
        label: 'Branches',
        key: 'branches',
        children: [],
    },
    {
        label: 'Documents',
        key: 'documents',
        children: [],
    },
    {
        label: 'Notifications',
        key: 'notifications',
        children: [],
    },
    {
        label: 'Approvals',
        key: 'approvals',
        children: [],
    },
] as const;
