import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { billingApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Invoice, Payment, Lease } from "@/types";

export interface UseBillingOptions {
    invoices?: boolean;
    payments?: boolean;
    leases?: boolean;
}

export function useBilling(options: UseBillingOptions = {}) {
    const { invoices: fetchInvoices = false, payments: fetchPayments = false, leases: fetchLeases = false } = options;
    const { token } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [leases, setLeases] = useState<Lease[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const fetchPromises: Promise<{ data: unknown }>[] = [];
            const fetchKeys: string[] = [];

            if (fetchInvoices) {
                fetchPromises.push(billingApi.findAllInvoices());
                fetchKeys.push('invoices');
            }
            if (fetchPayments) {
                fetchPromises.push(billingApi.findAllPayments());
                fetchKeys.push('payments');
            }
            if (fetchLeases) {
                fetchPromises.push(billingApi.findAllLeases());
                fetchKeys.push('leases');
            }

            const results = await Promise.all(fetchPromises);

            results.forEach((result, index) => {
                const key = fetchKeys[index];
                if (key === 'invoices') setInvoices(result.data as Invoice[]);
                if (key === 'payments') setPayments(result.data as Payment[]);
                if (key === 'leases') setLeases(result.data as Lease[]);
            });
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch billing data");
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        } finally {
            setIsLoading(false);
        }
    }, [token, fetchInvoices, fetchPayments, fetchLeases]);


    useEffect(() => {
        if (fetchInvoices || fetchPayments || fetchLeases) {
            fetchData();
        } else {
            setIsLoading(false);
        }
    }, [fetchData, fetchInvoices, fetchPayments, fetchLeases]);

    return { invoices, payments, leases, isLoading, error, refetch: fetchData };
}
