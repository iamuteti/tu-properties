"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, UserRound } from "lucide-react";
import { crmApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ContactForm } from "@/components/crm/contact-form";

export default function NewContactPage() {
    const router = useRouter();

    async function handleSubmit(values: Parameters<typeof crmApi.createContact>[0]) {
        await crmApi.createContact(values);
        toast.success("Contact added");
        router.push("/crm/contacts");
        router.refresh();
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Go back">
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <UserRound className="h-5 w-5" aria-hidden="true" />
                        Add contact
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        The shared people directory — the same record can be linked to a tenant later.
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <ContactForm
                    mode="create"
                    onSubmit={handleSubmit}
                    onCancel={() => router.push("/crm/contacts")}
                />
            </div>
        </div>
    );
}