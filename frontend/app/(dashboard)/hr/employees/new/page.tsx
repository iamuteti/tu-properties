'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { EmployeeForm } from '@/components/hr/employee-form';

export default function EmployeeNewPage() {
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/hr/employees"
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                    >
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    Back to employees
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Add employee</h1>
                <p className="text-muted-foreground">
                    Every employee needs a record. Fill in the details and the system will
                    assign an employee number automatically.
                </p>
            </div>
            <EmployeeForm />
        </div>
    );
}