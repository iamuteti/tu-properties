'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FacilityForm } from '@/components/facilities/facility-form';

export default function FacilityNewPage() {
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/facilities"
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to facilities
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Add facility</h1>
                <p className="text-muted-foreground">
                    The opening hours and the booking grid are the two decisions that
                    matter: everything else about a slot &mdash; whether it fits the
                    opening hours, whether it lands on the grid, whether two bookings can
                    share it &mdash; follows from them.
                </p>
            </div>
            <FacilityForm />
        </div>
    );
}
