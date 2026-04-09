import { useState, useEffect, useCallback } from "react";
import { AxiosError } from "axios";
import { rentalAgreementsApi } from "@/lib/api";
import { useAuth } from "./use-auth";
import { RentalAgreement } from "@/types";

export function useRentalAgreements() {
    const { token } = useAuth();
    const [rentalAgreements, setRentalAgreements] = useState<RentalAgreement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRentalAgreements = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const response = await rentalAgreementsApi.findAll();
            setRentalAgreements(response.data);
            setError(null);
        } catch (err: unknown) {
            if (err instanceof AxiosError) {
                setError(err.response?.data?.message || err.message || "Failed to fetch rental agreements");
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
        fetchRentalAgreements();
    }, [fetchRentalAgreements]);

    return { rentalAgreements, isLoading, error, refetch: fetchRentalAgreements };
}
