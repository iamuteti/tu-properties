"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Building2,
    DoorOpen,
    Users,
    FileText,
    CreditCard,
    BarChart,
    Settings,
} from "lucide-react";

const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard/properties", label: "Properties", icon: Building2 },
    { href: "/dashboard/units", label: "Units", icon: DoorOpen },
    { href: "/dashboard/tenants", label: "Tenants", icon: Users },
    { href: "/dashboard/leases", label: "Leases", icon: FileText },
    { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
    { href: "/dashboard/reports", label: "Reports", icon: BarChart },
    { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="hidden h-screen w-64 flex-col border-r bg-card text-card-foreground md:flex">
            <div className="flex h-16 items-center border-b px-6">
                <span className="text-xl font-bold tracking-tight text-primary">
                    Tu Properties
                </span>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-4">
                {navItems.map((item) => {
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
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-accent" />
                    <div className="flex flex-col">
                        <span className="text-sm font-medium">User Name</span>
                        <span className="text-xs text-muted-foreground">Admin</span>
                    </div>
                </div>
            </div>
        </aside>
    );
}
