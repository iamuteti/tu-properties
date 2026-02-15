import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { billingApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Invoice, Payment } from "@/types";

export function useBilling() {
    const { token } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        setError(null);
        try {
            const [invoicesRes, paymentsRes] = await Promise.all([
                billingApi.findAllInvoices(),
                billingApi.findAllPayments(),
            ]);
            setInvoices(invoicesRes.data);
            setPayments(paymentsRes.data);
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
    }, [token]);


    useEffect(() => {
        fetchData();
    }, [fetchData]);

    return { invoices, payments, isLoading, error, refetch: fetchData };
}
