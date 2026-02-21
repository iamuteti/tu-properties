import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { financeApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { Invoice, Payment, Receipt } from "@/types";

export interface UseFinanceOptions {
    invoices?: boolean;
    payments?: boolean;
    receipts?: boolean;
}

export function useFinance(options: UseFinanceOptions = {}) {
    const { invoices: fetchInvoices = false, payments: fetchPayments = false, receipts: fetchReceipts = false } = options;
    const { token } = useAuth();
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [receipts, setReceipts] = useState<Receipt[]>([]);
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
                fetchPromises.push(financeApi.findAllInvoices());
                fetchKeys.push('invoices');
            }
            if (fetchPayments) {
                fetchPromises.push(financeApi.findAllPayments());
                fetchKeys.push('payments');
            }
            if (fetchReceipts) {
                fetchPromises.push(financeApi.findAllReceipts());
                fetchKeys.push('receipts');
            }

            const results = await Promise.all(fetchPromises);

            results.forEach((result, index) => {
                const key = fetchKeys[index];
                if (key === 'invoices') setInvoices(result.data as Invoice[]);
                if (key === 'payments') setPayments(result.data as Payment[]);
                if (key === 'receipts') setReceipts(result.data as Receipt[]);
            });
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch finance data");
            } else if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("An unknown error occurred");
            }
        } finally {
            setIsLoading(false);
        }
    }, [token, fetchInvoices, fetchPayments, fetchReceipts]);


    useEffect(() => {
        if (fetchInvoices || fetchPayments || fetchReceipts) {
            fetchData();
        } else {
            setIsLoading(false);
        }
    }, [fetchData, fetchInvoices, fetchPayments, fetchReceipts]);

    return { invoices, payments, receipts, isLoading, error, refetch: fetchData };
}
