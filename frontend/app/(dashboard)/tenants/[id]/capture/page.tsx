'use client';

import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CaptureManuallyForm } from '@/components/finance/capture-manually-form';

/**
 * Capture a payment against one resident, from their file.
 *
 * The resident's page is where the question is asked — "did they pay, and how
 * did they pay it?" — so the capture opens there with the tenant already
 * chosen. Everything else about the form lives in the shared component.
 */
export default function CaptureForTenantPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const tenantId = params?.id ?? '';

    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/tenants/${tenantId}`)}
                    aria-label="Back to tenant"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Capture Manually</h1>
                    <p className="text-muted-foreground">
                        Record money this resident handed over, and what it settles
                    </p>
                </div>
            </div>

            <CaptureManuallyForm tenantId={tenantId} />
        </div>
    );
}
