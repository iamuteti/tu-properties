import { ItemForm } from '@/components/inventory/item-form';

export default function NewInventoryItemPage() {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Add an item</h1>
                <p className="text-muted-foreground">
                    Something a store keeps — paint, fittings, safety gear. There is no
                    quantity box because the item is saved empty: stock reaches it
                    through an opening-balance movement, so the level and the ledger
                    can never disagree
                </p>
            </div>
            <ItemForm />
        </div>
    );
}