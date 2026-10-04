import { AssetForm } from '@/components/maintenance/asset-form';

export default function NewAssetPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Add plant</h1>
                <p className="text-muted-foreground">
                    Something the company owns and has to keep running — a lift, a
                    generator, a pump, the cameras
                </p>
            </div>
            <AssetForm />
        </div>
    );
}
