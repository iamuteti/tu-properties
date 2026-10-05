'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RowActionsMenu, type RowAction } from '@/components/ui/row-actions';
import { Select } from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingState, StatusBadge } from '@/components/ui/entity-states';
import { EMPLOYMENT_TYPES, PAY_FREQUENCIES } from '@/lib/constants';
import type { EmployeeRow } from '@/types';

/**
 * The staff directory.
 *
 * **No salary figures appear here, by construction rather than by hiding them**:
 * the backend's `findAll` selects a fixed column list that cannot include
 * compensation, so a salary column added to the model later cannot leak into this
 * table. The one money-adjacent column is the currency somebody is paid in, which
 * is what somebody reading a directory legitimately needs.
 *
 * That is also why the department and employment-type filters are sent to the API
 * rather than applied here: the export is the same query, and a filter that only
 * worked on screen would be a filter that quietly disagreed with the CSV.
 */
export default function EmployeesListPage() {
    const router = useRouter();
    const [employees, setEmployees] = useState<EmployeeRow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [department, setDepartment] = useState('');
    const [employmentType, setEmploymentType] = useState('');
    const [search, setSearch] = useState('');
    const [includeInactive, setIncludeInactive] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Every filter here is the API's, not this page's. `search` in
            // particular is resolved server-side (it spans the employee number,
            // both names and the job title), so filtering the returned array
            // locally would search fewer columns than the export does.
            const { data } = await hrApi.employees({
                ...(department ? { department } : {}),
                ...(employmentType ? { employmentType } : {}),
                ...(search.trim() ? { search: search.trim() } : {}),
                ...(includeInactive ? { includeInactive: true } : {}),
            });
            setEmployees(data);
        } catch (err) {
            setError(
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message ?? 'Could not load the employee list.',
            );
        } finally {
            setIsLoading(false);
        }
    }, [department, employmentType, search, includeInactive]);

    useEffect(() => {
        load();
    }, [load]);

    const departments = useMemo(() => {
        const seen = new Set<string>();
        employees.forEach((employee) => {
            if (employee.department) seen.add(employee.department);
        });
        return [...seen].sort();
    }, [employees]);

    const rows = employees;

    const actionsFor = (employee: EmployeeRow): RowAction<EmployeeRow>[] => [
        { label: 'View', onSelect: () => router.push(`/hr/employees/${employee.id}`) },
        {
            label: 'Edit',
            onSelect: () => router.push(`/hr/employees/${employee.id}/edit`),
        },
        // No "file leave for them" shortcut from here: the leave form needs an
        // employee picker and a preview of the balance it would consume, and a
        // deep link that arrives with the employee already chosen is a form that
        // skipped the check. The employee's own page carries their balance.
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Employees</h1>
                    <p className="text-muted-foreground">
                        The staff directory — every department, contract type and currency. No
                        salary figures appear here by design.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <a href={hrApi.employeesExportUrl()}>
                            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                            Export
                        </a>
                    </Button>
                    <Button asChild>
                        <Link href="/hr/employees/new">
                            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                            Add employee
                        </Link>
                    </Button>
                </div>
            </div>

            {error && <ErrorState message={error} onRetry={load} />}

            <div className="flex flex-wrap items-end gap-3">
                <div className="w-52">
                    <Label htmlFor="empDept">Department</Label>
                    <Select
                        name="empDept"
                        value={department}
                        onChange={(event) => setDepartment(event.target.value)}
                        options={[
                            { value: '', label: 'All departments' },
                            ...departments.map((value) => ({ value, label: value })),
                        ]}
                    />
                </div>
                <div className="w-52">
                    <Label htmlFor="empEmploymentType">Employment type</Label>
                    <Select
                        name="empEmploymentType"
                        value={employmentType}
                        onChange={(event) => setEmploymentType(event.target.value)}
                        options={[
                            { value: '', label: 'All types' },
                            ...EMPLOYMENT_TYPES.map((entry) => ({
                                value: entry.value,
                                label: entry.label,
                            })),
                        ]}
                    />
                </div>
                <div className="w-60">
                    <Label htmlFor="empSearch">Search</Label>
                    <Input
                        id="empSearch"
                        value={search}
                        placeholder="Name, employee number or job title"
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
                <div className="w-44">
                    <Label htmlFor="empInactive">Leaving</Label>
                    <Select
                        name="empInactive"
                        value={includeInactive ? 'yes' : 'no'}
                        onChange={(event) => setIncludeInactive(event.target.value === 'yes')}
                        options={[
                            { value: 'no', label: 'Current staff' },
                            { value: 'yes', label: 'Including leavers' },
                        ]}
                    />
                </div>
            </div>

            {isLoading ? (
                <LoadingState label="Loading the employee directory…" />
            ) : rows.length === 0 ? (
                <EmptyState
                    title="No employees match"
                    description={
                        employees.length === 0
                            ? 'Nobody has been added to the directory yet.'
                            : 'Clear the filters to see everybody.'
                    }
                    action={
                        <Button asChild>
                            <Link href="/hr/employees/new">Add the first employee</Link>
                        </Button>
                    }
                />
            ) : (
                <Card>
                    <CardContent className="pt-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Number</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Job title</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Paid</TableHead>
                                    <TableHead>Hired</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {rows.map((employee) => (
                                    <TableRow key={employee.id}>
                                        <TableCell>
                                            <Link
                                                href={`/hr/employees/${employee.id}`}
                                                className="font-medium underline-offset-4 hover:underline"
                                            >
                                                {employee.displayName}
                                            </Link>
                                            {!employee.hasLogin && (
                                                <p className="text-xs text-muted-foreground">
                                                    no login
                                                </p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {employee.employeeNumber}
                                        </TableCell>
                                        <TableCell>{employee.department ?? '—'}</TableCell>
                                        <TableCell>{employee.jobTitle ?? '—'}</TableCell>
                                        <TableCell className="text-xs">
                                            {EMPLOYMENT_TYPES.find(
                                                (entry) => entry.value === employee.employmentType,
                                            )?.label ?? employee.employmentType}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                            {PAY_FREQUENCIES.find(
                                                (entry) => entry.value === employee.payFrequency,
                                            )?.label ?? employee.payFrequency}{' '}
                                            {employee.salaryCurrency}
                                        </TableCell>
                                        <TableCell>
                                            {new Date(employee.hireDate).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>
                                            <StatusBadge
                                                status={employee.isActive ? 'ACTIVE' : 'INACTIVE'}
                                            />
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <RowActionsMenu
                                                row={employee}
                                                actions={actionsFor(employee)}
                                                label={`Actions for ${employee.displayName}`}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}