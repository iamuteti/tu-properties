'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { VisitorForm } from '@/components/facilities/visitor-form';

export default function VisitorNewPage() {
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/facilities/visitors"
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to visitors
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Add visitor</h1>
                <p className="text-muted-foreground">
                    Adding somebody to the directory is what lets the system answer
                    &ldquo;have we had this person before&rdquo; and &ldquo;are they on the
                    barred list&rdquo;. Neither question has an answer if the name is only
                    written on the day&rsquo;s gate sheet.
                </p>
            </div>
            <VisitorForm />
        </div>
    );
}
