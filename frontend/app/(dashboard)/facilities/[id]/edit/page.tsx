'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FacilityForm } from '@/components/facilities/facility-form';

export default function FacilityEditPage() {
    const { id } = useParams<{ id: string }>();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`/facilities/${id}`}
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to facility
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Edit facility</h1>
                <p className="text-muted-foreground">
                    Changing the hours or the booking grid is refused while a live booking
                    would fall outside the new rules. Move or cancel that booking first
                    &mdash; the message names which ones.
                </p>
            </div>
            <FacilityForm itemId={id} />
        </div>
    );
}
