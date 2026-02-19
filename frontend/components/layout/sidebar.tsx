"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
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
} from "lucide-react";

type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'PROPERTY_MANAGER' | 'ACCOUNTANT' | 'USER';

interface NavItem {
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    roles: UserRole[];
}

const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'USER'] },
    { href: "/dashboard/organizations", label: "Organizations", icon: Building, roles: ['SUPER_ADMIN'] },
    { href: "/dashboard/properties", label: "Properties", icon: Building2, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
    { href: "/dashboard/units", label: "Units", icon: DoorOpen, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
    { href: "/dashboard/tenants", label: "Tenants", icon: Users, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
    { href: "/dashboard/leases", label: "Leases", icon: FileText, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER'] },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard, roles: ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT'] },
    { href: "/dashboard/reports", label: "Reports", icon: BarChart, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
    { href: "/dashboard/settings", label: "Settings", icon: Settings, roles: ['SUPER_ADMIN', 'ADMIN'] },
];

const roleLabels: Record<UserRole, string> = {
    SUPER_ADMIN: 'Super Admin',
    ADMIN: 'Admin',
    PROPERTY_MANAGER: 'Property Manager',
    ACCOUNTANT: 'Accountant',
    USER: 'User',
};

export function Sidebar() {
    const pathname = usePathname();
    const { user, isLoading, logout } = useAuth();

    console.log('User: ', user);
    console.log('IsLoading: ', isLoading);
    console.log('User: ', user);

    // Filter nav items based on user role
    const filteredNavItems = navItems.filter(
        (item) => user && item.roles.includes(user.role)
    );

    return (
        <aside className="hidden h-screen w-64 flex-col border-r bg-card text-card-foreground md:flex">
            <div className="flex h-16 items-center border-b px-6">
                <span className="text-xl font-bold tracking-tight text-primary">
                    Tu Properties
                </span>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
                {filteredNavItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
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
                })}
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
