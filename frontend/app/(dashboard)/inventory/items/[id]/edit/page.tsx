'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { ItemForm } from '@/components/inventory/item-form';

export default function EditInventoryItemPage() {
    const { id } = useParams<{ id: string }>();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`/inventory/items/${id}`}
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to the item
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Edit item</h1>
                <p className="text-muted-foreground">
                    What it is, what it costs and when to order more. The level on the
                    shelf is not editable here — it is the sum of the movements, so a
                    change to it has to be a movement somebody can point at
                </p>
            </div>
            <ItemForm itemId={id} />
        </div>
    );
}