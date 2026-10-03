"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { crmApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/ui/entity-states";
import { ContactForm, type ContactFormValues } from "@/components/crm/contact-form";
import type { Contact } from "@/types";

export default function EditContactPage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const router = useRouter();
    const [contact, setContact] = useState<Contact | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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

    async function handleSubmit(values: ContactFormValues) {
        if (!id) return;
        await crmApi.updateContact(id, values);
        toast.success("Contact updated");
        router.push(`/crm/contacts/${id}`);
        router.refresh();
    }

    if (isLoading) return <LoadingState label="Loading contact…" />;
    if (error) return <ErrorState message={error} onRetry={loadContact} />;
    if (!contact || !id) return <ErrorState message="Contact not found." />;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => router.push(`/crm/contacts/${id}`)}
                    aria-label="Back to contact"
                >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Edit {contact.firstName} {contact.lastName}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Changes apply across leasing and sales — this is the shared record.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <ContactForm
                    mode="edit"
                    initial={contact}
                    submitLabel="Save changes"
                    onSubmit={handleSubmit}
                    onCancel={() => router.push(`/crm/contacts/${id}`)}
                />
            </div>
        </div>
    );
}