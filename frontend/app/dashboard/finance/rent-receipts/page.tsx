"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function RentReceiptsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rent Receipts</h1>
          <p className="text-muted-foreground">
            Manage your rent receipts and track payments
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Create Rent Receipt
        </Button>
      </div>
      
      <div className="text-center py-12">
        <p className="text-muted-foreground">No rent receipts found. Create your first rent receipt to get started.</p>
      </div>
    </div>
  );
}