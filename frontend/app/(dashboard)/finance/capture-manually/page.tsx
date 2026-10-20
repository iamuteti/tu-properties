'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CaptureManuallyForm } from '@/components/finance/capture-manually-form';

/**
 * Capture a payment for a tenant picked here.
 *
 * The same capture as the resident's file offers, for the person who is
 * recording several payments in a row and does not want to walk through each
 * resident's page to reach it.
 */
export default function CaptureManuallyPage() {
    const router = useRouter();

    return (
        <div className="max-w-5xl space-y-6">
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push('/finance/receipts')}
                    aria-label="Back to receipts"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Capture Manually</h1>
                    <p className="text-muted-foreground">
                        Record money that arrived outside the system
                    </p>
                </div>
            </div>

            <CaptureManuallyForm />
        </div>
    );
}
