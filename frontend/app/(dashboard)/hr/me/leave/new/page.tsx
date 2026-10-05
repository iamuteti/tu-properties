'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LeaveRequestForm } from '@/components/hr/leave-request-form';

/**
 * File your own leave.
 *
 * `scope="self"` is the only difference from `/hr/leave/new`, and it is the whole
 * difference: this route posts to `POST /hr/me/leave`, which takes no employee id
 * because the caller is resolved from their login.
 */
export default function MyLeaveNewPage() {
    return (
        <div className="space-y-6">
            <div>
                <Button variant="ghost" asChild className="mb-2 -ml-2">
                    <Link href="/hr/me/leave">
                        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
                        Back to my leave
                    </Link>
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">Request leave</h1>
                <p className="text-muted-foreground">
                    Working days are counted against the calendar, so weekends and public
                    holidays do not come out of your entitlement.
                </p>
            </div>
            <LeaveRequestForm scope="self" />
        </div>
    );
}