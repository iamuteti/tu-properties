"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { workflowsApi } from "@/lib/api";
import {
    LayoutDashboard,
    Building2,
    DoorOpen,
    Users,
    FileText,
    CreditCard,
    BarChart,
    Settings,
    Shield,
    Landmark,
    Building,
    LogOut,
    Handshake,
    Kanban,
    UserRound,
    HandCoins,
    MessageSquare,
    Banknote,
    BookOpen,
    Scale,
    Undo2,
    PiggyBank,
    Globe2,
Receipt,
    Bell,
    TrendingDown,
    CheckSquare,
    GitBranch,
    Wrench,
    KanbanSquare,
    CalendarClock,
    Settings2,
    ShoppingCart,
    FileStack,
    ClipboardList,
    Award,
    Truck,
    // Module 11 — Inventory. `Package` for the catalogue, `Warehouse` for the
    // stores, `ArrowLeftRight` for the ledger — the ledger is a transfer-shaped
    // screen and reads as one.
    Package,
    Warehouse,
    ArrowLeftRight,
    // Module 12 — HR & Payroll. `Calendar` for leave, `Wallet` for the run, and
    // `Calculator` for the statutory rules, which is the screen where somebody
    // works out what a rule does rather than looking at a record of it.
    Calendar,
    Wallet,
    Calculator,
} from "lucide-react";

type UserRole =
    | 'SUPER_ADMIN'
    | 'ADMIN'
    | 'PROPERTY_MANAGER'
    | 'LEASING_OFFICER'
    | 'MAINTENANCE_MANAGER'
    | 'TECHNICIAN'
    | 'PROCUREMENT_OFFICER'
    | 'ACCOUNTANT'
    | 'USER'
    | 'HR_MANAGER'
    | 'EMPLOYEE';

interface NavItem {
    href?: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    roles: UserRole[];
    /** Show a live count on this item (Module 18's approvals inbox). */
    badge?: 'approvals';
    children?: NavItem[];
}

const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'USER'] },
    { href: "/organizations", label: "Organizations", icon: Building, roles: ['SUPER_ADMIN'] },
// Module 9 — Maintenance. The queue is where the work is; the register and the
    // service calendar are what the queue is judged against, so a technician gets
    // all three but a leasing officer only needs to see that the queue exists.
    {
        label: 'Maintenance',
        icon: Wrench,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'LEASING_OFFICER', 'ACCOUNTANT'],
        children: [
            { href: '/maintenance/work-orders', label: 'Work orders', icon: Wrench, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'LEASING_OFFICER', 'ACCOUNTANT'] },
            { href: '/maintenance/work-orders/board', label: 'Board', icon: KanbanSquare, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER', 'TECHNICIAN'] },
            { href: '/maintenance/assets', label: 'Plant register', icon: Settings2, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER'] },
            { href: '/maintenance/schedules', label: 'Service schedule', icon: CalendarClock, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER'] },
        ],
    },
{
        // Module 10 — Procurement. The three documents in the order they happen:
        // a department asks, suppliers quote, the company commits. The supplier
        // list sits with the buyers, though the *bills* those suppliers send stay
        // in Finance — that split is deliberate, and it is why a procurement
        // officer has no `payables` permission.
        label: 'Procurement',
        icon: ShoppingCart,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'PROCUREMENT_OFFICER', 'ACCOUNTANT', 'MAINTENANCE_MANAGER'],
        children: [
            { href: '/procurement/purchase-requests', label: 'Purchase requests', icon: ClipboardList, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'PROCUREMENT_OFFICER', 'ACCOUNTANT', 'MAINTENANCE_MANAGER'] },
            { href: '/procurement/rfqs', label: 'Quotations', icon: FileStack, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'PROCUREMENT_OFFICER', 'ACCOUNTANT'] },
            { href: '/procurement/purchase-orders', label: 'Purchase orders', icon: Truck, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'PROCUREMENT_OFFICER', 'ACCOUNTANT'] },
            { href: '/procurement/suppliers', label: 'Suppliers', icon: Award, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'PROCUREMENT_OFFICER', 'ACCOUNTANT', 'MAINTENANCE_MANAGER'] },
        ],
    },
    {
        // Module 11 — Inventory. Sits next to Procurement because the two are two
        // halves of one loop: an order commits to buy, the store holds what
        // arrived. The roles mirror the backend's split exactly — a technician and
        // an accountant can read the shelf and the ledger but write neither, and
        // that is not an accident of the nav, it is `inventory-roles.ts`.
        label: 'Inventory',
        icon: Package,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'PROCUREMENT_OFFICER', 'ACCOUNTANT'],
        children: [
            { href: '/inventory/items', label: 'Items', icon: Package, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'PROCUREMENT_OFFICER', 'ACCOUNTANT'] },
            { href: '/inventory/warehouses', label: 'Stores', icon: Warehouse, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'PROCUREMENT_OFFICER', 'ACCOUNTANT'] },
            { href: '/inventory/stock-movements', label: 'Stock ledger', icon: ArrowLeftRight, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'PROCUREMENT_OFFICER', 'ACCOUNTANT'] },
        ],
    },
    {
        label: 'Landlords',
        icon: Landmark,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT'],
        children: [
            { href: "/landlords", label: "Owners", icon: Landmark, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT'] },
            { href: "/landlords/statements", label: "Owner statements", icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT'] },
            { href: "/landlords/payouts", label: "Owner payouts", icon: Banknote, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT'] },
        ]
    },
    {
        label: "Properties",
        icon: Building2,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'],
        children: [
            { href: "/properties", label: "All Properties", icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
            { href: "/units", label: "All Units", icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
        ]
    },
    {
        label: "CRM",
        icon: Handshake,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'],
        children: [
            { href: "/crm/leads", label: "Leads & pipeline", icon: Kanban, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
            { href: "/crm/contacts", label: "Contacts", icon: UserRound, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
        ]
    },
    {
        label: "Sales",
        icon: Handshake,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'],
        children: [
            { href: "/sales", label: "Sales pipeline", icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
            { href: "/sales/commissions", label: "Commissions", icon: HandCoins, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
        ]
    },
    {
        label: "Tenants & Leases",
        icon: Users,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'],
        children: [
            { href: "/tenants", label: "Tenants", icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
            { href: "/rental-agreements", label: "Leases", icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
            { href: "/tenant-requests", label: "Tenant requests", icon: MessageSquare, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'LEASING_OFFICER'] },
            { href: "/moving-out", label: "Moving Out", icon: DoorOpen, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] }
        ]
    },
    {
        label: "Billing & Finance",
        icon: CreditCard,
        roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'],
        children: [
            { href: "/finance/invoices", label: "Invoices", icon: CreditCard, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/payments", label: "Payments", icon: CreditCard, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/arrears", label: "Arrears", icon: TrendingDown, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/payables", label: "Payables", icon: Receipt, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/suppliers", label: "Suppliers", icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/refunds", label: "Refunds", icon: Undo2, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/credits", label: "Customer Credits", icon: PiggyBank, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/receipts", label: "Receipts", icon: CreditCard, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/rent-receipts", label: "Rent Receipts", icon: CreditCard, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/chart-of-accounts", label: "Chart of Accounts", icon: BookOpen, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/journal-entries", label: "Journal Entries", icon: Scale, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
            { href: "/finance/trial-balance", label: "Trial Balance", icon: Scale, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] }
        ]
    },

    /**
     * Module 12. Every role list here is the backend's, copied rather than guessed —
     * `HR_VIEW_ROLES`, `HR_APPROVER_ROLES` and `HR_PAYROLL_ROLES` in
     * `backend/src/modules/hr/hr-roles.ts` — and they are deliberately **not** the
     * same list:
     *
     * - the directory and the leave queue are readable by nine roles;
     * - payroll runs and statutory rules by four, because `HR_PAYROLL_ROLES`
     *   excludes the property manager: in a company that runs payroll properly the
     *   person who approves the figures and the person who releases the money are
     *   two people, and a nav that offered it to everybody would be a promise the
     *   API refuses;
     * - `/hr/me` to every staff login, since self-service is the whole point of the
     *   `self` permission and an employee has no directory access at all.
     */
    {
        label: 'HR & Payroll',
        icon: UserRound,
        roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'HR_MANAGER', 'ACCOUNTANT', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'LEASING_OFFICER', 'PROCUREMENT_OFFICER', 'EMPLOYEE'],
        children: [
            { href: '/hr/employees', label: 'Employees', icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'HR_MANAGER', 'ACCOUNTANT', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'LEASING_OFFICER', 'PROCUREMENT_OFFICER'] },
            { href: '/hr/leave', label: 'Leave', icon: Calendar, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'HR_MANAGER', 'ACCOUNTANT', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'LEASING_OFFICER', 'PROCUREMENT_OFFICER'] },
            { href: '/hr/payroll', label: 'Payroll runs', icon: Wallet, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'HR_MANAGER'] },
            { href: '/hr/settings/payroll-rules', label: 'Statutory rules', icon: Calculator, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'HR_MANAGER'] },
            { href: '/hr/me', label: 'My account', icon: UserRound, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'HR_MANAGER', 'ACCOUNTANT', 'MAINTENANCE_MANAGER', 'TECHNICIAN', 'LEASING_OFFICER', 'PROCUREMENT_OFFICER', 'EMPLOYEE'] },
        ],
    },
    { href: "/users", label: "Users", icon: Users, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { href: "/branches", label: "Branches", icon: Building, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { href: "/documents", label: "Documents", icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'USER'] },

{ href: "/notifications", label: "Notifications", icon: Bell, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PROPERTY_MANAGER', 'LEASING_OFFICER'] },
    { href: "/approvals", label: "Approvals", icon: CheckSquare, badge: 'approvals', roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PROPERTY_MANAGER', 'LEASING_OFFICER'] },
    { href: "/settings", label: "Settings", icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { href: "/settings/tax", label: "Tax Settings", icon: Globe2, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
    { href: "/settings/notifications", label: "Notification Settings", icon: Bell, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { href: "/settings/workflows", label: "Approval Workflows", icon: GitBranch, roles: ['SUPER_ADMIN', 'ADMIN'] },
];

const roleLabels: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    PROPERTY_MANAGER: 'Property Manager',
    LEASING_OFFICER: 'Leasing Officer',
    // Module 9: these two enum values were added because a work order needs
    // somebody to assign it to (master doc issues 51/54).
    MAINTENANCE_MANAGER: 'Maintenance Manager',
    TECHNICIAN: 'Technician',
    // Module 10: same reason as the two above — the seeded Procurement Officer
    // role had permissions nobody could hold until UserRole gained a value.
    PROCUREMENT_OFFICER: 'Procurement Officer',
    HR_MANAGER: 'HR Manager',
    ACCOUNTANT: 'Accountant',
    USER: 'User',
    EMPLOYEE: 'Employee',
};

export function Sidebar() {
    const pathname = usePathname();
    const { user, isLoading, logout } = useAuth();
    const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
    // How many approvals are waiting on this person. Polled rather than pushed
    // because it is a count, not an event: the inbox itself is the notification,
    // and this is only there so somebody does not have to open it to find out.
    const [pendingApprovals, setPendingApprovals] = React.useState<number | null>(null);

    React.useEffect(() => {
        if (!user) return;
        let active = true;
        const load = async () => {
            try {
                const inbox = (await workflowsApi.inbox()).data;
                if (active) setPendingApprovals(inbox.counts.pending);
            } catch {
                // A badge is not worth an error message; the page still works.
                if (active) setPendingApprovals(0);
            }
        };
        load();
        const timer = setInterval(load, 60_000);
        return () => {
            active = false;
            clearInterval(timer);
        };
    }, [user]);

    // Filter nav items based on user role
    const filteredNavItems = navItems.filter(
        (item) => user && item.roles.includes(user.role)
    );

    const toggleItem = (label: string) => {
        setExpandedItems(prev =>
            prev.includes(label)
                ? prev.filter(item => item !== label)
                : [...prev, label]
        );
    };

    const renderNavItem = (item: NavItem) => {
        const isActive = item.href
            ? (pathname === item.href || pathname.startsWith(item.href + '/'))
            : false;
        const children = (item.children ?? []).filter(
            (child) => user && child.roles.includes(user.role),
        );
        const hasChildren = children.length > 0;
        const isExpanded = expandedItems.includes(item.label);
        const badgeCount =
            item.badge === 'approvals' ? pendingApprovals : null;

        if (hasChildren) {
            // A parent group is "active" if any child route matches, so the
            // group stays expanded when the user is on one of its pages.
            const childActive = children.some(
                (child) => child.href && (pathname === child.href || pathname.startsWith(child.href + '/'))
            );
            const groupActive = isActive || childActive;

            return (
                <div key={item.label} className="space-y-1">
                    <button
                        onClick={() => toggleItem(item.label)}
                        className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                            groupActive
                                ? "bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <item.icon className="h-4 w-4" />
                            {item.label}
                        </div>
                        <svg
                            className={cn(
                                "h-4 w-4 transition-transform",
                                isExpanded || groupActive ? "rotate-180" : ""
                            )}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                    {isExpanded && (
                        <div className="ml-4 space-y-1 border-l border-muted pl-3">
                            {children.map((child) => renderNavItem(child))}
                        </div>
                    )}
                </div>
            );
        }

        return (
            <Link
                key={item.href}
                href={item.href!}
                className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
            >
                <item.icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {badgeCount ? (
                    <span
                        className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            isActive
                                ? "bg-primary-foreground/20 text-primary-foreground"
                                : "bg-amber-100 text-amber-800"
                        )}
                    >
                        {badgeCount}
                    </span>
                ) : null}
            </Link>
        );
    };

    return (
        <aside className="hidden h-screen w-64 flex-col border-r bg-card text-card-foreground md:flex">
            <div className="flex h-16 items-center border-b px-6">
                <span className="text-xl font-bold tracking-tight text-primary">
                    Tu Properties
                </span>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
                {filteredNavItems.map(renderNavItem)}
            </nav>
            <div className="border-t p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-accent flex items-center justify-center">
                            {user?.firstName?.[0] || 'U'}{user?.lastName?.[0] || ''}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">
                                {user ? `${user.firstName} ${user.lastName}` : 'User Name'}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {user ? roleLabels[user.role] || user.role : 'Admin'}
                            </span>
                        </div>
                    </div>
                    <NotificationBell />
                    <button
                        onClick={() => logout()}
                        className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        title="Logout"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
