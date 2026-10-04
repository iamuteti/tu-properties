"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { NotificationBell } from "@/components/notifications/notification-bell";
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
} from "lucide-react";

type UserRole =
    | 'SUPER_ADMIN'
    | 'ADMIN'
    | 'PROPERTY_MANAGER'
    | 'LEASING_OFFICER'
    | 'ACCOUNTANT'
    | 'USER';

interface NavItem {
    href?: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    roles: UserRole[];
    children?: NavItem[];
}

const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'USER'] },
    { href: "/organizations", label: "Organizations", icon: Building, roles: ['SUPER_ADMIN'] },
    {
        label: "Landlords",
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

    { href: "/users", label: "Users", icon: Users, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { href: "/branches", label: "Branches", icon: Building, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { href: "/documents", label: "Documents", icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'USER'] },

    { href: "/notifications", label: "Notifications", icon: Bell, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'PROPERTY_MANAGER', 'LEASING_OFFICER'] },
    { href: "/settings", label: "Settings", icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN'] },
    { href: "/settings/tax", label: "Tax Settings", icon: Globe2, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
];

const roleLabels: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    PROPERTY_MANAGER: 'Property Manager',
    LEASING_OFFICER: 'Leasing Officer',
    ACCOUNTANT: 'Accountant',
    USER: 'User',
};

export function Sidebar() {
    const pathname = usePathname();
    const { user, isLoading, logout } = useAuth();
    const [expandedItems, setExpandedItems] = React.useState<string[]>([]);

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
        const children = item.children;
        const hasChildren = children && children.length > 0;
        const isExpanded = expandedItems.includes(item.label);

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
                            {item.children?.map(child => renderNavItem(child))}
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
                {item.label}
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
