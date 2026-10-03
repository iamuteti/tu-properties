'use client'

import { useCallback, useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Users, Home, Landmark, Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { dashboardApi } from "@/lib/api";
import { DashboardStats } from "@/types";

const STATUS_COLORS: Record<string, string> = {
    OCCUPIED: "#8884d8",
    VACANT: "#82ca9d",
    MAINTENANCE: "#f59e0b",
    RESERVED: "#ec4899",
};

export default function DashboardPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const res = await dashboardApi.getStats();
            setStats(res.data);
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to load dashboard stats. Please try again."
            );
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    if (isLoading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="flex items-center gap-3 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading dashboard…</span>
                </div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <Card>
                    <CardContent className="flex flex-col items-center gap-4 py-12">
                        <AlertTriangle className="h-8 w-8 text-destructive" />
                        <p className="text-sm text-muted-foreground">{error || "No data available."}</p>
                        <Button variant="outline" onClick={loadStats}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const pieData = stats.unitsByStatus
        .filter((s) => s.count > 0)
        .map((s) => ({
            name: s.status.replace("_", " "),
            value: s.count,
            fill: STATUS_COLORS[s.status] || "#8884d8",
        }));

    const monthlyData = stats.monthlyCharges.map((m) => ({
        ...m,
        charged: Number(m.charged),
        collected: Number(m.collected),
    }));

    const propertiesData = stats.unitsByProperty.map((p) => ({
        ...p,
        shortName: p.property.length > 18 ? `${p.property.slice(0, 18)}…` : p.property,
    }));

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totals.properties}</div>
                        <p className="text-xs text-muted-foreground">Across your portfolio</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Landlords</CardTitle>
                        <Landmark className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totals.landlords}</div>
                        <p className="text-xs text-muted-foreground">Registered landlords</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Units/Spaces</CardTitle>
                        <Home className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totals.units}</div>
                        <p className="text-xs text-muted-foreground">All units and spaces</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totals.activeTenants}</div>
                        <p className="text-xs text-muted-foreground">Currently active</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Row */}
            <div className="grid gap-4 md:grid-cols-2">
                {/* Units Status Distribution Pie Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Units by Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {pieData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={(entry: any) => `${entry.name} ${entry.value}`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    />
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                                No units yet
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Rental Charge vs Collection Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>Rental Charge vs Collection (Monthly)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={monthlyData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="label" />
                                <YAxis />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="charged" fill="#8884d8" name="Charged" />
                                <Bar dataKey="collected" fill="#82ca9d" name="Collected" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Units by Property Bar Chart */}
            <Card>
                <CardHeader>
                    <CardTitle>Units by Property (top 7)</CardTitle>
                </CardHeader>
                <CardContent>
                    {propertiesData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={propertiesData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="shortName" angle={-45} textAnchor="end" height={80} />
                                <YAxis />
                                <Tooltip
                                    labelFormatter={(value: any, payload: any) =>
                                        payload?.[0]?.payload?.property ?? value
                                    }
                                />
                                <Bar dataKey="units" fill="#8884d8" name="Units" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                            No properties yet
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
