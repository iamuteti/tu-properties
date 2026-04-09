import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { tenantsApi, rentalAgreementsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Tenant, RentalAgreement, Unit, Property } from "@/types";
import { TenantTableData } from "@/components/ui/expandable-table";

interface RentalAgreementWithRelations extends RentalAgreement {
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
            const [tenantsResponse, agreementsResponse] = await Promise.all([
                tenantsApi.findAll(),
                rentalAgreementsApi.findAll()
            ]);

            const tenants: Tenant[] = tenantsResponse.data;
            const agreements: RentalAgreementWithRelations[] = agreementsResponse.data;

            const agreementMap = new Map<string, RentalAgreementWithRelations>();
            agreements.forEach(agreement => {
                if (!agreementMap.has(agreement.tenantId)) {
                    agreementMap.set(agreement.tenantId, agreement);
                }
            });

            const tableData: TenantTableData[] = tenants.map(tenant => {
                const agreement = agreementMap.get(tenant.id);
                const unit = agreement?.unit;
                const property = unit?.property;

                let daysToExpire = 0;
                if (agreement?.endDate) {
                    const end = new Date(agreement.endDate);
                    const today = new Date();
                    const diffTime = end.getTime() - today.getTime();
                    daysToExpire = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }

                let status: 'active' | 'expiring' | 'expired' | 'overdue' = 'active';
                if (agreement) {
                    if (daysToExpire <= 0) {
                        status = 'expired';
                    } else if (daysToExpire <= 30) {
                        status = 'expiring';
                    }
                }

                const rentBalance = agreement?.rentAmount || 0;

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
                    leaseId: agreement?.id || '',
                    agreementStartDate: agreement?.startDate || '',
                    agreementEndDate: agreement?.endDate || '',
                    rentAmount: agreement?.rentAmount || 0,
                    rentBalance: rentBalance,
                    daysToExpire: daysToExpire,
                    status: status,
                    agreementType: agreement?.agreementType || 'RENTAL',
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
