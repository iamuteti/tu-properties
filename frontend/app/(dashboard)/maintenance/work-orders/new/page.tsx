import { WorkOrderForm } from '@/components/maintenance/work-order-form';

export default function NewWorkOrderPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Report a fault</h1>
                <p className="text-muted-foreground">
                    Raised as a request — it still has to be inspected and approved before
                    anybody is dispatched, unless it is an emergency
                </p>
            </div>
            <WorkOrderForm />
        </div>
    );
}
