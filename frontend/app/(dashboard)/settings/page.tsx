"use client";

import { Building2, Save } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export default function SettingsPage() {
    const { user, organization } = useAuth();

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your organization profile and preferences
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Organization</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="orgName">Organization Name</Label>
                            <Input
                                id="orgName"
                                defaultValue={organization?.name || ""}
                                placeholder="Organization name"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="orgSlug">Slug</Label>
                            <Input
                                id="orgSlug"
                                defaultValue={organization?.slug || ""}
                                placeholder="organization-slug"
                                disabled
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="contactEmail">Contact Email</Label>
                            <Input
                                id="contactEmail"
                                type="email"
                                defaultValue={organization?.contactEmail || ""}
                                placeholder="billing@example.com"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="contactPhone">Contact Phone</Label>
                            <Input
                                id="contactPhone"
                                type="tel"
                                defaultValue={organization?.contactPhone || ""}
                                placeholder="+254 700 000 000"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Plan</Label>
                            <Input
                                value={organization?.plan || "FREE"}
                                disabled
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Subdomain</Label>
                            <Input
                                value={organization?.subdomain || ""}
                                disabled
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Input
                                value={organization?.isActive ? "Active" : "Inactive"}
                                disabled
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Current User</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-accent flex items-center justify-center text-lg font-medium">
                            {user?.firstName?.[0] || 'U'}{user?.lastName?.[0] || ''}
                        </div>
                        <div>
                            <p className="font-medium">
                                {user ? `${user.firstName} ${user.lastName}` : '—'}
                            </p>
                            <p className="text-sm text-muted-foreground">
                                {user?.email || '—'}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button disabled>
                    <Save className="mr-2 h-4 w-4" />
                    Save Changes
                </Button>
            </div>
        </div>
    );
}