/**
 * Maps dashboard route paths to their module keys.
 *
 * Keys match `NavItem.module` in `components/layout/sidebar.tsx` and
 * `Subscription.enabledModules` on the backend. Routes without an entry
 * (Dashboard, Settings, Support, Platform) are always-on for their allowed
 * roles and are not module-gated.
 *
 * Used by `ModuleGuard` to redirect users who navigate directly to a URL
 * whose module is disabled for their organization.
 */
export const ROUTE_TO_MODULE: Record<string, string> = {
    // Maintenance
    "/maintenance/work-orders": "maintenance/work-orders",
    "/maintenance/work-orders/board": "maintenance/work-orders/board",
    "/maintenance/assets": "maintenance/assets",
    "/maintenance/schedules": "maintenance/schedules",

    // Procurement
    "/procurement/purchase-requests": "procurement/purchase-requests",
    "/procurement/rfqs": "procurement/rfqs",
    "/procurement/purchase-orders": "procurement/purchase-orders",
    "/procurement/suppliers": "procurement/suppliers",

    // Inventory
    "/inventory/items": "inventory/items",
    "/inventory/warehouses": "inventory/warehouses",
    "/inventory/stock-movements": "inventory/stock-movements",

    // Landlords
    "/landlords": "landlords",
    "/landlords/statements": "landlords/statements",
    "/landlords/payouts": "landlords/payouts",

    // Properties & Units
    "/properties": "properties",
    "/units": "properties/units",

    // CRM
    "/crm/leads": "crm/leads",
    "/crm/contacts": "crm/contacts",

    // Sales
    "/sales": "sales",
    "/sales/commissions": "sales/commissions",

    // Tenants & Leases
    "/tenants": "tenants",
    "/agreements": "agreements",
    "/tenant-requests": "tenant-requests",
    "/moving-out": "moving-out",
    "/security-deposits": "security-deposits",

    // Billing & Finance
    "/finance/invoices": "invoices",
    "/finance/payments": "payments",
    "/finance/arrears": "arrears",
    "/finance/payables": "payables",
    "/finance/suppliers": "finance/suppliers",
    "/finance/refunds": "refunds",
    "/finance/credits": "credits",
    "/finance/receipts": "receipts",
    "/finance/rent-receipts": "rent-receipts",
    "/finance/chart-of-accounts": "chart-of-accounts",
    "/finance/journal-entries": "journal-entries",
    "/finance/trial-balance": "trial-balance",

    // HR & Payroll
    "/hr/employees": "hr/employees",
    "/hr/leave": "hr/leave",
    "/hr/payroll": "hr/payroll",
    "/hr/settings/payroll-rules": "hr/settings/payroll-rules",
    "/hr/me": "hr/me",

    // Facilities
    "/facilities": "facilities",
    "/facilities/bookings": "facilities/bookings",
    "/facilities/visits": "facilities/visits",
    "/facilities/visitors": "facilities/visitors",
    "/facilities/access-cards": "facilities/access-cards",

    // Utilities
    "/utilities": "utilities",
    "/utilities/readings": "utilities/readings",
    "/utilities/tariffs": "utilities/tariffs",
    "/utilities/billing": "utilities/billing",

    // Contracts (Legal)
    "/contracts": "contracts",
    "/contracts/expiry-report": "contracts/expiry-report",
    "/contracts/new": "contracts/new",

    // Reports
    "/reports": "reports",

    // Users / Branches / Documents
    "/users": "users",
    "/branches": "branches",
    "/documents": "documents",

    // Notifications / Approvals
    "/notifications": "notifications",
    "/approvals": "approvals",
};
