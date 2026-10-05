import { PurchaseRequestForm } from '@/components/procurement/purchase-request-form';

export default function NewPurchaseRequestPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Raise a purchase request</h1>
                <p className="text-muted-foreground">
                    What is needed and why — approved before suppliers are asked, so nobody buys
                    something the business did not agree to
                </p>
            </div>
            <PurchaseRequestForm />
        </div>
    );
}