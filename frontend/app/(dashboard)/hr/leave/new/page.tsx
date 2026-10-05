'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeaveRequestForm } from '@/components/hr/leave-request-form';

/**
 * File leave on somebody else's behalf.
 *
 * The manager half of the pair — see `/hr/me/leave/new` for the other one. This
 * route picks the employee and previews the balance before the request is filed.
 */
export default function LeaveNewPage() {
    return (
        <div className="space-y-6">
            <div>
                <Button variant="ghost" asChild className="mb-2 -ml-2">
                    <Link href="/hr/leave">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to leave requests
                    </Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">Request leave</h1>
                <p className="text-muted-foreground">
                    Filing for somebody else. If the organization has an approval workflow
                    configured the request goes to it; otherwise it waits here for a direct
                    decision.
                </p>
            </div>
            <LeaveRequestForm scope="manager" />
        </div>
    );
}