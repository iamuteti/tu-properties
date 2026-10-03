import { LandlordForm } from '@/components/landlords/landlord-form';

export default function NewLandlordPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Add landlord</h1>
                <p className="text-muted-foreground">
                    An owner whose rent income you collect and whose balance you settle
                </p>
            </div>
            <LandlordForm />
        </div>
    );
}