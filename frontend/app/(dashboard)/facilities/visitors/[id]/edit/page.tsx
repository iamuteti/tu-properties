'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { VisitorForm } from '@/components/facilities/visitor-form';

export default function VisitorEditPage() {
    const { id } = useParams<{ id: string }>();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`/facilities/visitors/${id}`}
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to visitor
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Edit visitor</h1>
                <p className="text-muted-foreground">
                    Barring somebody is not on this form. It is its own action on their
                    record, it needs a reason, and it is refused while they are still on
                    site.
                </p>
            </div>
            <VisitorForm itemId={id} />
        </div>
    );
}
