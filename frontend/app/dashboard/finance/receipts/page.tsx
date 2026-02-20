"use client";

import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ReceiptsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Receipts</h1>
          <p className="text-muted-foreground">
            Manage your receipts and track payments
          </p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Create Receipt
        </Button>
      </div>
      
      <div className="text-center py-12">
        <p className="text-muted-foreground">No receipts found. Create your first receipt to get started.</p>
      </div>
    </div>
  );
}