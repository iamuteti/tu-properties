"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, Pencil, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, StatusBadge } from "@/components/ui/entity-states";
import { LeadStageBadge } from "@/components/crm/lead-stage-badge";
import { CommunicationTimeline } from "@/components/crm/communication-timeline";
import { crmApi } from "@/lib/api";
import type { Contact } from "@/types";

export default function ContactDetailPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();

    const [contact, setContact] = useState<Contact | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isBusy, setIsBusy] = useState(false);

    const loadContact = useCallback(async () => {
        if (!id) return;
        setIsLoading(true);
        setError(null);
        try {
            const response = await crmApi.findContact(id);
            setContact(response.data);
        } catch (err: any) {
            setError(
                err.response?.status === 404
                    ? "Contact not found. It may have been deleted."
                    : err.response?.data?.message || "Failed to load the contact.",
            );
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        loadContact();
    }, [loadContact]);

    const handleDelete = async () => {
        if (!contact) return;
        if (!confirm(`Delete ${contact.firstName} ${contact.lastName}?`)) return;
        setIsBusy(true);
        try {
            await crmApi.removeContact(contact.id);
            toast.success("Contact deleted");
            router.push("/crm/contacts");
        } catch (err: any) {
            toast.error(err.response?.data?.message || "Failed to delete the contact.");
            setIsBusy(false);
        }
    };

    if (isLoading) return <LoadingState label="Loading contact…" />;
    if (error || !contact) {
        return (
            <div className="space-y-6">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push("/crm/contacts")}
                    aria-label="Back to contacts"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <ErrorState message={error || "Contact not found."} onRetry={loadContact} />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => router.push("/crm/contacts")}
                        aria-label="Back to contacts"
                    >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {contact.firstName} {contact.lastName}
                            </h1>
                            <StatusBadge status={contact.type} />
                            {!contact.isActive && (
                                <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                                    Inactive
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {[contact.company, contact.email, contact.phone].filter(Boolean).join(" · ") ||
                                "No contact details"}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button onClick={() => router.push(`/crm/contacts/${contact.id}/edit`)} disabled={isBusy}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        Edit
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isBusy}>
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        Delete
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle>Details</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4 text-sm">
                        <Detail label="Type" value={contact.type} />
                        <Detail label="Company" value={contact.company} />
                        <Detail label="Email" value={contact.email} />
                        <Detail label="Phone" value={contact.phone} />
                        <Detail
                            label="Added"
                            value={new Date(contact.createdAt).toLocaleDateString()}
                        />
                        <Detail
                            label="Linked tenant"
                            value={
                                contact.tenant
                                    ? `${contact.tenant.code} — ${contact.tenant.surname} ${contact.tenant.otherNames ?? ""}`.trim()
                                    : undefined
                            }
                        />
                    </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle>Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                            {contact.notes || "No notes recorded."}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <UserRound className="h-4 w-4" aria-hidden="true" />
                        Leads that produced this contact
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {!contact.leads || contact.leads.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            This contact was added directly — no converted leads.
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Lead</TableHead>
                                    <TableHead>Stage</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Captured</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {contact.leads.map((lead) => (
                                    <TableRow key={lead.id}>
                                        <TableCell>
                                            <Link href={`/crm/leads/${lead.id}`} className="hover:underline">
                                                {lead.firstName} {lead.lastName ?? ""}
                                            </Link>
                                        </TableCell>
                                        <TableCell>
                                            <LeadStageBadge stage={lead.stage} />
                                        </TableCell>
                                        <TableCell>{lead.source.replace(/_/g, " ")}</TableCell>
                                        <TableCell>
                                            {new Date(lead.createdAt).toLocaleDateString()}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Communication history</CardTitle>
                </CardHeader>
                <CardContent>
                    <CommunicationTimeline
                        entries={contact.timeline ?? []}
                        contactId={contact.id}
                        onLogged={loadContact}
                        onDeleted={loadContact}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="break-words font-medium">{value || "—"}</p>
        </div>
    );
}