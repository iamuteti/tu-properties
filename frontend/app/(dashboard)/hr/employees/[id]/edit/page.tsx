'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { EmployeeForm } from '@/components/hr/employee-form';

export default function EmployeeEditPage() {
    const { id } = useParams<{ id: string }>();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`/hr/employees/${id}`}
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to employee
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Edit employee</h1>
                <p className="text-muted-foreground">
                    Changes are saved to the employee record. Salary and compensation data
                    are protected by role-based access.
                </p>
            </div>
            <EmployeeForm itemId={id} />
        </div>
    );
}