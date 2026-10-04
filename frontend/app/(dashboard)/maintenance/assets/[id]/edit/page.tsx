'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { maintenanceApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/entity-states';
import { AssetForm } from '@/components/maintenance/asset-form';
import { useAsset } from '@/hooks/use-maintenance';

export default function EditAssetPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { asset, error, refetch } = useAsset(id);
    const [isDeleting, setIsDeleting] = useState(false);

    if (error || !asset) {
        return <ErrorState message={error ?? 'Asset not found'} onRetry={refetch} />;
    }

    if (asset.status === 'RETIRED') {
        return (
            <div className="space-y-4">
                <Link
                    href={`/maintenance/assets/${asset.id}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to {asset.name}
                </Link>
                <ErrorState message={`${asset.name} is retired. Retired plant keeps its service history but is not edited — its record is what it is.`} />
            </div>
        );
    }

    const remove = async () => {
        if (
            !window.confirm(
                `Delete ${asset.name}? Deletion is only possible while nothing points at it — anything with a schedule or a work order must be retired instead.`,
            )
        ) {
            return;
        }
        setIsDeleting(true);
        try {
            await maintenanceApi.deleteAsset(asset.id);
            toast.success('Asset deleted');
            router.push('/maintenance/assets');
        } catch (err) {
            const payload = (err as { response?: { data?: { message?: string | string[] } } })
                ?.response?.data;
            toast.error(
                Array.isArray(payload?.message)
                    ? payload.message.join(' ')
                    : (payload?.message as string) || 'Could not delete this asset',
            );
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <Link
                        href={`/maintenance/assets/${asset.id}`}
                        className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Back to {asset.name}
                    </Link>
                    <h1 className="text-3xl font-bold tracking-tight">Edit plant</h1>
                </div>
                <Button variant="outline" onClick={remove} disabled={isDeleting}>
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                    {isDeleting ? 'Deleting…' : 'Delete'}
                </Button>
            </div>

            <AssetForm assetId={asset.id} />
        </div>
    );
}
