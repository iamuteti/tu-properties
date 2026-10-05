'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { hrApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { LoadingState } from '@/components/ui/entity-states';
import {
    CURRENCIES,
    EMPLOYMENT_TYPES,
    PAY_FREQUENCIES,
    PAYSLIP_LOCALES,
} from '@/lib/constants';
import type { LeavePolicyRow } from '@/types';

/**
 * Add or edit an employee.
 *
 * The form's state holds **`string | undefined` for every optional field, never
 * `null`**. That is not a style preference: the create/update DTOs run
 * `@CleanOptional()`, which turns an empty string into `undefined` and a null into
 * a validation failure, so a form that sent `null` for a blank box would be
 * refused by the API for the difference of one character.
 *
 * The dropdown values come from the shared constants, which mirror the Prisma
 * enums. `BI-WEEKLY` and `CONTRACTOR` were not values the database accepts —
 * they are `FORTNIGHTLY` and `CONTRACT` — and an enum the server refuses is a
 * create form that fails on save with a message about a field the user never
 * touched.
 */
interface EmployeeFormState {
    employeeNumber: string;
    firstName: string;
    lastName: string;
    preferredName?: string;
    preferredLocale?: string;
    department?: string;
    jobTitle?: string;
    employmentType: string;
    hireDate: string;
    terminationDate?: string;
    basicSalary: string;
    salaryCurrency: string;
    payFrequency: string;
    periodsPerYear: string;
    nationalId?: string;
    taxNumber?: string;
    socialSecurityNumber?: string;
    bankAccount?: string;
    bankName?: string;
    bankBranch?: string;
    bankCode?: string;
    address?: string;
    phone?: string;
    email?: string;
    leavePolicyId?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY: EmployeeFormState = {
    employeeNumber: '',
    firstName: '',
    lastName: '',
    employmentType: 'FULL_TIME',
    hireDate: today(),
    basicSalary: '',
    salaryCurrency: '',
    payFrequency: 'MONTHLY',
    periodsPerYear: '12',
};

interface FormErrors {
    [key: string]: string;
}

export function EmployeeForm({ itemId }: { itemId?: string }) {
    const router = useRouter();
    const isEdit = Boolean(itemId);
    const [form, setForm] = useState<EmployeeFormState>(EMPTY);
    const [isLoading, setIsLoading] = useState(isEdit);
    const [isSaving, setIsSaving] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const [policies, setPolicies] = useState<LeavePolicyRow[]>([]);

    useEffect(() => {
        let cancelled = false;
        hrApi
            .leavePolicies()
            .then(({ data }) => {
                if (!cancelled) setPolicies(data);
            })
            .catch(() => setPolicies([]));
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!itemId) return;
        let cancelled = false;

        hrApi
            .employee(itemId)
            .then(({ data }) => {
                if (cancelled) return;
                setForm({
                    employeeNumber: data.employeeNumber,
                    firstName: data.firstName,
                    lastName: data.lastName,
                    preferredName: data.preferredName ?? undefined,
                    preferredLocale: data.preferredLocale ?? undefined,
                    department: data.department ?? undefined,
                    jobTitle: data.jobTitle ?? undefined,
                    employmentType: data.employmentType,
                    hireDate: data.hireDate?.slice(0, 10) ?? '',
                    terminationDate: data.terminationDate?.slice(0, 10) ?? undefined,
                    basicSalary: String(data.basicSalary ?? ''),
                    salaryCurrency: data.salaryCurrency ?? '',
                    payFrequency: data.payFrequency,
                    periodsPerYear: String(data.periodsPerYear ?? 12),
                    nationalId: data.nationalId ?? undefined,
                    taxNumber: data.taxNumber ?? undefined,
                    socialSecurityNumber: data.socialSecurityNumber ?? undefined,
                    bankAccount: data.bankAccount ?? undefined,
                    bankName: data.bankName ?? undefined,
                    bankBranch: data.bankBranch ?? undefined,
                    bankCode: data.bankCode ?? undefined,
                    address: data.address ?? undefined,
                    phone: data.phone ?? undefined,
                    email: data.email ?? undefined,
                    leavePolicyId: data.leavePolicy?.id,
                });
                setIsLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                toast.error('Could not load the employee');
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [itemId]);

    const set = <K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) => {
        setForm((current) => ({ ...current, [key]: value }));
        setErrors((current) => ({ ...current, [key]: '' }));
    };

    const submit = async () => {
        const nextErrors: FormErrors = {};
        if (!form.firstName.trim()) nextErrors.firstName = "Enter the employee's first name";
        if (!form.lastName.trim()) nextErrors.lastName = "Enter the employee's last name";
        if (!form.hireDate) nextErrors.hireDate = 'Enter the hire date';
        // Required on create by the API: a payslip is calculated from a basic
        // salary, so an employee record without one cannot be paid.
        if (form.basicSalary === '') {
            nextErrors.basicSalary = 'Enter the basic salary';
        } else if (Number(form.basicSalary) < 0) {
            nextErrors.basicSalary = 'A salary cannot be negative';
        }
        if (form.terminationDate && form.terminationDate < form.hireDate) {
            nextErrors.terminationDate = 'They cannot leave before they were hired';
        }
        if (form.basicSalary !== '' && Number(form.basicSalary) < 0) {
            nextErrors.basicSalary = 'A salary cannot be negative';
        }
        if (
            form.periodsPerYear !== '' &&
            (Number(form.periodsPerYear) < 1 || Number(form.periodsPerYear) > 366)
        ) {
            nextErrors.periodsPerYear = 'Between 1 and 366';
        }

        setErrors(nextErrors);
        if (Object.keys(nextErrors).length > 0) {
            toast.error('Check the highlighted fields');
            return;
        }

        setIsSaving(true);
        try {
            // Blank boxes are omitted rather than sent empty: the DTO turns an empty
            // string into `undefined`, and omitting is the same thing without
            // depending on that.
            const optional = (value?: string) =>
                value && value.trim() !== '' ? value.trim() : undefined;

            const payload = {
                firstName: form.firstName.trim(),
                lastName: form.lastName.trim(),
                employmentType: form.employmentType,
                hireDate: form.hireDate,
                ...(form.basicSalary !== '' ? { basicSalary: Number(form.basicSalary) } : {}),
                ...(form.salaryCurrency ? { salaryCurrency: form.salaryCurrency } : {}),
                payFrequency: form.payFrequency,
                periodsPerYear: Number(form.periodsPerYear) || 12,
                ...(optional(form.preferredName) ? { preferredName: form.preferredName } : {}),
                ...(optional(form.preferredLocale)
                    ? { preferredLocale: form.preferredLocale }
                    : {}),
                ...(optional(form.department) ? { department: form.department } : {}),
                ...(optional(form.jobTitle) ? { jobTitle: form.jobTitle } : {}),
                ...(optional(form.terminationDate)
                    ? { terminationDate: form.terminationDate }
                    : {}),
                ...(optional(form.nationalId) ? { nationalId: form.nationalId } : {}),
                ...(optional(form.taxNumber) ? { taxNumber: form.taxNumber } : {}),
                ...(optional(form.socialSecurityNumber)
                    ? { socialSecurityNumber: form.socialSecurityNumber }
                    : {}),
                ...(optional(form.bankAccount) ? { bankAccount: form.bankAccount } : {}),
                ...(optional(form.bankName) ? { bankName: form.bankName } : {}),
                ...(optional(form.bankBranch) ? { bankBranch: form.bankBranch } : {}),
                ...(optional(form.bankCode) ? { bankCode: form.bankCode } : {}),
                ...(optional(form.address) ? { address: form.address } : {}),
                ...(optional(form.phone) ? { phone: form.phone } : {}),
                ...(optional(form.email) ? { email: form.email } : {}),
                ...(optional(form.leavePolicyId) ? { leavePolicyId: form.leavePolicyId } : {}),
            };

            if (isEdit && itemId) {
                await hrApi.updateEmployee(itemId, payload);
                toast.success(`${payload.firstName} ${payload.lastName} updated`);
                router.push(`/hr/employees/${itemId}`);
            } else {
                const response = await hrApi.createEmployee({
                    ...payload,
                    employeeNumber: form.employeeNumber.trim(),
                    basicSalary: Number(form.basicSalary),
                });
                toast.success(`${response.data.firstName} ${response.data.lastName} added`);
                router.push(`/hr/employees/${response.data.id}`);
            }
        } catch (err) {
            toast.error(
                (err as { response?: { data?: { message?: string | string[] } } })?.response?.data
                    ?.message?.toString() ?? 'Could not save the employee',
            );
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading the employee…" />;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{isEdit ? 'Edit employee' : 'Add employee'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <section className="space-y-4">
                        <p className="text-sm font-medium">Who they are</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                id="emp-firstName"
                                label="First name"
                                required
                                value={form.firstName}
                                error={errors.firstName}
                                onChange={(value) => set('firstName', value)}
                            />
                            <Field
                                id="emp-lastName"
                                label="Last name"
                                required
                                value={form.lastName}
                                error={errors.lastName}
                                onChange={(value) => set('lastName', value)}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                id="emp-preferredName"
                                label="Preferred name"
                                hint="Printed on a payslip instead of the legal name"
                                value={form.preferredName ?? ''}
                                onChange={(value) => set('preferredName', value)}
                            />
                            {!isEdit && (
                                <Field
                                    id="emp-number"
                                    label="Employee number"
                                    required
                                    placeholder="EMP-0001"
                                    value={form.employeeNumber}
                                    error={errors.employeeNumber}
                                    onChange={(value) => set('employeeNumber', value)}
                                />
                            )}
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="emp-dept">Department</Label>
                                <Input
                                    id="emp-dept"
                                    value={form.department ?? ''}
                                    onChange={(event) => set('department', event.target.value)}
                                    placeholder="e.g. Operations"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="emp-jobTitle">Job title</Label>
                                <Input
                                    id="emp-jobTitle"
                                    value={form.jobTitle ?? ''}
                                    onChange={(event) => set('jobTitle', event.target.value)}
                                    placeholder="e.g. Property Manager"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="emp-employmentType">Employment type</Label>
                                <Select
                                    name="emp-employmentType"
                                    value={form.employmentType}
                                    onChange={(event) => set('employmentType', event.target.value)}
                                    options={EMPLOYMENT_TYPES.map((entry) => ({
                                        value: entry.value,
                                        label: entry.label,
                                    }))}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4 border-t pt-4">
                        <p className="text-sm font-medium">Employment and pay</p>
                        <div className="grid gap-4 sm:grid-cols-4">
                            <Field
                                id="emp-hireDate"
                                label="Hire date"
                                type="date"
                                required
                                value={form.hireDate}
                                error={errors.hireDate}
                                onChange={(value) => set('hireDate', value)}
                            />
                            <Field
                                id="emp-terminationDate"
                                label="Last working day"
                                type="date"
                                hint="Leave blank while they are here"
                                value={form.terminationDate ?? ''}
                                error={errors.terminationDate}
                                onChange={(value) => set('terminationDate', value)}
                            />
                            <div className="space-y-2">
                                <Label htmlFor="emp-payFrequency">Pay frequency</Label>
                                <Select
                                    name="emp-payFrequency"
                                    value={form.payFrequency}
                                    onChange={(event) => set('payFrequency', event.target.value)}
                                    options={PAY_FREQUENCIES.map((entry) => ({
                                        value: entry.value,
                                        label: entry.label,
                                    }))}
                                />
                            </div>
                            <Field
                                id="emp-periodsPerYear"
                                label="Periods per year"
                                type="number"
                                hint="Drives an annualised tax rule"
                                value={form.periodsPerYear}
                                error={errors.periodsPerYear}
                                onChange={(value) => set('periodsPerYear', value)}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field
                                id="emp-basicSalary"
                                label="Basic salary"
                                type="number"
                                step="0.01"
                                value={form.basicSalary}
                                error={errors.basicSalary}
                                onChange={(value) => set('basicSalary', value)}
                            />
                            <div className="space-y-2">
                                <Label htmlFor="emp-salaryCurrency">Salary currency</Label>
                                <Select
                                    name="emp-salaryCurrency"
                                    value={form.salaryCurrency}
                                    onChange={(event) => set('salaryCurrency', event.target.value)}
                                    placeholder="The organization's default"
                                    options={CURRENCIES.map((entry) => ({
                                        value: entry.value,
                                        label: entry.label,
                                    }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="emp-preferredLocale">Payslip locale</Label>
                                <Select
                                    name="emp-preferredLocale"
                                    value={form.preferredLocale ?? ''}
                                    onChange={(event) =>
                                        set('preferredLocale', event.target.value)
                                    }
                                    options={PAYSLIP_LOCALES.map((entry) => ({
                                        value: entry.value,
                                        label: entry.label,
                                    }))}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="space-y-4 border-t pt-4">
                        <p className="text-sm font-medium">Contact</p>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                id="emp-email"
                                label="Email"
                                type="email"
                                value={form.email ?? ''}
                                onChange={(value) => set('email', value)}
                            />
                            <Field
                                id="emp-phone"
                                label="Phone"
                                value={form.phone ?? ''}
                                onChange={(value) => set('phone', value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="emp-address">Address</Label>
                            <Textarea
                                id="emp-address"
                                rows={2}
                                value={form.address ?? ''}
                                onChange={(event) => set('address', event.target.value)}
                            />
                        </div>
                    </section>

                    <section className="space-y-4 border-t pt-4">
                        <p className="text-sm font-medium">
                            Statutory identifiers and payment details
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Needed on a payslip and for the statutory returns the payroll engine
                            feeds. Visible only to roles that may see compensation.
                        </p>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <Field
                                id="emp-nationalId"
                                label="National ID"
                                value={form.nationalId ?? ''}
                                onChange={(value) => set('nationalId', value)}
                            />
                            <Field
                                id="emp-taxNumber"
                                label="Tax number"
                                value={form.taxNumber ?? ''}
                                onChange={(value) => set('taxNumber', value)}
                            />
                            <Field
                                id="emp-socialSecurityNumber"
                                label="Social security number"
                                value={form.socialSecurityNumber ?? ''}
                                onChange={(value) => set('socialSecurityNumber', value)}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-4">
                            <Field
                                id="emp-bankName"
                                label="Bank"
                                value={form.bankName ?? ''}
                                onChange={(value) => set('bankName', value)}
                            />
                            <Field
                                id="emp-bankAccount"
                                label="Account number"
                                value={form.bankAccount ?? ''}
                                onChange={(value) => set('bankAccount', value)}
                            />
                            <Field
                                id="emp-bankBranch"
                                label="Branch"
                                value={form.bankBranch ?? ''}
                                onChange={(value) => set('bankBranch', value)}
                            />
                            <Field
                                id="emp-bankCode"
                                label="Bank code / SWIFT"
                                value={form.bankCode ?? ''}
                                onChange={(value) => set('bankCode', value)}
                            />
                        </div>
                        <div className="w-72">
                            <Label htmlFor="emp-leavePolicy">Leave policy</Label>
                            <Select
                                name="emp-leavePolicy"
                                value={form.leavePolicyId ?? ''}
                                onChange={(event) => set('leavePolicyId', event.target.value)}
                                placeholder="The organization's default policy"
                                options={policies.map((policy) => ({
                                    value: policy.id,
                                    label: `${policy.code} — ${policy.name}`,
                                }))}
                            />
                        </div>
                    </section>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
                    Cancel
                </Button>
                <Button onClick={submit} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add the employee'}
                </Button>
            </div>
        </div>
    );
}

function Field({
    id,
    label,
    value,
    onChange,
    type = 'text',
    required,
    hint,
    error,
    placeholder,
    step,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
    required?: boolean;
    hint?: string;
    error?: string;
    placeholder?: string;
    step?: string;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={id}>
                {label}
                {required && <span className="text-destructive"> *</span>}
            </Label>
            <Input
                id={id}
                type={type}
                step={step}
                value={value}
                placeholder={placeholder}
                aria-invalid={Boolean(error)}
                aria-describedby={hint || error ? `${id}-hint` : undefined}
                onChange={(event) => onChange(event.target.value)}
            />
            {(error || hint) && (
                <p
                    id={`${id}-hint`}
                    className={error ? 'text-sm text-destructive' : 'text-xs text-muted-foreground'}
                >
                    {error ?? hint}
                </p>
            )}
        </div>
    );
}