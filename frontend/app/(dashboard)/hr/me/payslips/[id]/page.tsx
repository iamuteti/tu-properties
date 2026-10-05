'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { hrApi } from '@/lib/api';
import { PayslipDisplay } from '@/components/hr/payslip-display';
import { ErrorState, LoadingState } from '@/components/ui/entity-states';
import type { PayslipDetail } from '@/types';

/**
 * One of your own payslips.
 *
 * A separate route from `/hr/payslips/[id]` rather than a `?mine=true` on it,
 * because that separation is the whole point of the self-service API: no request
 * this page can make carries an employee id, so there is nothing to change that
 * would turn "my payslip" into somebody else's.
 */
export default function MyPayslipPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;

    const [payslip, setPayslip] = useState<PayslipDetail | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const { data } = await hrApi.myPayslip(id);
            setPayslip(data);
        } catch (err) {
            const status = (err as { response?: { status?: number } })?.response?.status;
            setError(
                status === 404
                    ? 'That payslip is not one of yours.'
                    : (err as { response?: { data?: { message?: string } } })?.response?.data
                          ?.message ?? 'Could not load the payslip.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    if (isLoading) return <LoadingState label="Loading your payslip…" />;
    if (error || !payslip) {
        return <ErrorState message={error ?? 'Payslip not found.'} onRetry={load} />;
    }

    return (
        <PayslipDisplay
            payslip={payslip}
            employeeName={payslip.employeeName}
            backHref="/hr/me"
            backLabel="Back to my account"
        />
    );
}