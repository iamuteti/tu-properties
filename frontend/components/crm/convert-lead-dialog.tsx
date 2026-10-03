'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { crmApi } from '@/lib/api';
import { CONTACT_TYPES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/simple-select';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingState } from '@/components/ui/entity-states';
import type { Contact, ContactType, Lead } from '@/types';

/**
 * Convert a lead into a contact.
 *
 * Offers the two real cases: create a fresh contact from the enquiry, or link
 * someone who is already in the directory (a returning enquirer). Optionally
 * creates the Tenant record in the same step, because a won rental lead becomes
 * a tenant immediately in practice.
 */
export function ConvertLeadDialog({
    lead,
    isOpen,
    onClose,
    onConverted,
}: {
    lead: Lead;
    isOpen: boolean;
    onClose: () => void;
    onConverted: (contactId: string) => void | Promise<void>;
}) {
    const [mode, setMode] = useState<'create' | 'link'>('create');
    const [type, setType] = useState<ContactType>('TENANT');
    const [firstName, setFirstName] = useState(lead.firstName);
    const [lastName, setLastName] = useState(lead.lastName ?? '');
    const [email, setEmail] = useState(lead.email ?? '');
    const [phone, setPhone] = useState(lead.phone ?? '');
    const [company, setCompany] = useState('');
    const [createTenant, setCreateTenant] = useState(true);
    const [contactId, setContactId] = useState('');
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isLoadingContacts, setIsLoadingContacts] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || mode !== 'link') return;
        setIsLoadingContacts(true);
        crmApi
            .findContacts({ limit: 200, engaged: true })
            .then((response) => setContacts(response.data.data))
            .catch(() => setContacts([]))
            .finally(() => setIsLoadingContacts(false));
    }, [isOpen, mode]);

    if (!isOpen) return null;

    const submit = async () => {
        setIsBusy(true);
        setError(null);
        try {
            const response = await crmApi.convertLead(
                lead.id,
                mode === 'create'
                    ? { type, firstName, lastName, email, phone, company, createTenant }
                    : { contactId, createTenant },
            );
            toast.success(
                response.data.tenantId
                    ? 'Lead converted — contact and tenant created'
                    : 'Lead converted to a contact',
            );
            await onConverted(response.data.contactId);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Conversion failed.');
        } finally {
            setIsBusy(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Convert lead to contact"
        >
            <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
                <header className="border-b px-5 py-4">
                    <h2 className="text-lg font-semibold">
                        Convert {lead.firstName} {lead.lastName ?? ''}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        The lead moves to <strong>Won</strong> and its enquiry history is carried over.
                    </p>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => setMode('create')}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                                mode === 'create' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                        >
                            New contact
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('link')}
                            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                                mode === 'link' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                        >
                            Link existing contact
                        </button>
                    </div>

                    {mode === 'create' ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Labeled label="Contact type" id="convert-type">
                                <Select
                                    id="convert-type"
                                    value={type}
                                    onChange={(e) => setType(e.target.value as ContactType)}
                                >
                                    {CONTACT_TYPES.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </Select>
                            </Labeled>
                            <Labeled label="First name" id="convert-first">
                                <Input
                                    id="convert-first"
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                />
                            </Labeled>
                            <Labeled label="Last name" id="convert-last">
                                <Input
                                    id="convert-last"
                                    value={lastName}
                                    onChange={(e) => setLastName(e.target.value)}
                                />
                            </Labeled>
                            <Labeled label="Email" id="convert-email">
                                <Input
                                    id="convert-email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </Labeled>
                            <Labeled label="Phone" id="convert-phone">
                                <Input
                                    id="convert-phone"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                />
                            </Labeled>
                            <Labeled label="Company (optional)" id="convert-company">
                                <Input
                                    id="convert-company"
                                    value={company}
                                    onChange={(e) => setCompany(e.target.value)}
                                />
                            </Labeled>
                        </div>
                    ) : (
                        <Labeled label="Existing contact" id="convert-contact">
                            {isLoadingContacts ? (
                                <LoadingState label="Loading contacts…" />
                            ) : (
                                <Select
                                    id="convert-contact"
                                    value={contactId}
                                    onChange={(e) => setContactId(e.target.value)}
                                >
                                    <option value="">Select a contact</option>
                                    {contacts.map((contact) => (
                                        <option key={contact.id} value={contact.id}>
                                            {contact.firstName} {contact.lastName}
                                            {contact.email ? ` · ${contact.email}` : ''}
                                        </option>
                                    ))}
                                </Select>
                            )}
                        </Labeled>
                    )}

                    <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2">
                        <Checkbox
                            id="convert-tenant"
                            checked={createTenant}
                            onCheckedChange={setCreateTenant}
                        />
                        <label htmlFor="convert-tenant" className="text-sm">
                            Also create a tenant record (for rental leads)
                        </label>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <footer className="flex items-center justify-end gap-2 border-t px-5 py-4">
                    <Button variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        onClick={submit}
                        disabled={
                            isBusy ||
                            (mode === 'create' ? !firstName.trim() : !contactId)
                        }
                    >
                        {isBusy ? 'Converting…' : 'Convert lead'}
                    </Button>
                </footer>
            </div>
        </div>
    );
}

function Labeled({
    label,
    id,
    children,
}: {
    label: string;
    id: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium">
                {label}
            </label>
            {children}
        </div>
    );
}