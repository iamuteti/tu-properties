import { LandlordForm } from '@/components/landlords/landlord-form';

export default async function EditLandlordPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Edit landlord</h1>
                <p className="text-muted-foreground">
                    Contact, payout and management-agreement details
                </p>
            </div>
            <LandlordForm landlordId={id} />
        </div>
    );
}