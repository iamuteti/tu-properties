import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { WarehouseForm } from '@/components/inventory/warehouse-form';

export default function NewWarehousePage() {
    return (
        <div className="space-y-6">
            <div>
                <Link
                    href="/inventory/warehouses"
                    className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to the stores
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Add a store</h1>
                <p className="text-muted-foreground">
                    A room, a rack, a building — wherever stock physically sits. One of
                    them is the default, so goods can be booked in without saying where
                </p>
            </div>
            <WarehouseForm />
        </div>
    );
}