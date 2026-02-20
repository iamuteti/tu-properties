import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { tenantsApi, leasesApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Tenant, Lease, Unit, Property } from "@/types";
import { TenantTableData } from "@/components/ui/tenants-table";

// Extended lease type with relations from backend
interface LeaseWithRelations extends Lease {
    unit?: Unit & { property?: Property };
}

export function useTenantTableData() {
    const { token } = useAuth();
    const [data, setData] = useState<TenantTableData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            // Fetch both tenants and leases in parallel
            const [tenantsResponse, leasesResponse] = await Promise.all([
                tenantsApi.findAll(),
                leasesApi.findAll()
            ]);

            const tenants: Tenant[] = tenantsResponse.data;
            const leases: LeaseWithRelations[] = leasesResponse.data;

            // Create a map of tenantId to lease for quick lookup
            const leaseMap = new Map<string, LeaseWithRelations>();
            leases.forEach(lease => {
                if (!leaseMap.has(lease.tenantId)) {
                    leaseMap.set(lease.tenantId, lease);
                }
            });

            // Transform tenants into table data
            const tableData: TenantTableData[] = tenants.map(tenant => {
                const lease = leaseMap.get(tenant.id);
                const unit = lease?.unit;
                const property = unit?.property;

                // Calculate days to expire
                let daysToExpire = 0;
                if (lease?.endDate) {
                    const end = new Date(lease.endDate);
                    const today = new Date();
                    const diffTime = end.getTime() - today.getTime();
                    daysToExpire = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }

                // Determine status based on days to expire and balance
                let status: 'active' | 'expiring' | 'expired' | 'overdue' = 'active';
                if (lease) {
                    if (daysToExpire <= 0) {
                        status = 'expired';
                    } else if (daysToExpire <= 30) {
                        status = 'expiring';
                    }
                }

                // Get rent balance (for now, using rentAmount as the balance for active leases)
                const rentBalance = lease?.rentAmount || 0;

                return {
                    id: tenant.id,
                    tenantId: tenant.id,
                    tenantName: `${tenant.surname} ${tenant.otherNames || ''}`.trim(),
                    tenantCode: tenant.code,
                    unitName: unit?.name || 'N/A',
                    unitId: unit?.id || '',
                    propertyName: property?.name || 'N/A',
                    propertyId: property?.id || '',
                    idNoRegNo: tenant.idNoRegNo,
                    taxPin: tenant.taxPin,
                    phone: tenant.phone,
                    email: tenant.email,
                    leaseId: lease?.id || '',
                    leaseStartDate: lease?.startDate || '',
                    leaseEndDate: lease?.endDate || '',
                    rentAmount: lease?.rentAmount || 0,
                    rentBalance: rentBalance,
                    daysToExpire: daysToExpire,
                    status: status,
                    agreementType: lease?.status,
                    tenancyType: tenant.tenantType,
                };
            });

            setData(tableData);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch data");
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { data, isLoading, error, refetch: fetchData };
}
