'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { WarehouseForm } from '@/components/inventory/warehouse-form';

/**
 * Editing a store is one form and nothing else. Deactivating and re-defaulting are
 * switches on that form, and the only thing that *looks* like a page-level action —
 * deleting — lives on the store's own page instead, next to the movements that make
 * it undeletable, so the reason is in front of whoever presses the button.
 */
export default function EditWarehousePage() {
    const params = useParams<{ id: string }>();

    return (
        <div className="space-y-6">
            <div>
                <Link
                    href={`/inventory/warehouses/${params.id}`}
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to the store
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Edit the store</h1>
                <p className="text-muted-foreground">
                    The code goes on delivery notes, so changing it is something to do
                    once rather than often
                </p>
            </div>
            <WarehouseForm warehouseId={params.id} />
        </div>
    );
}