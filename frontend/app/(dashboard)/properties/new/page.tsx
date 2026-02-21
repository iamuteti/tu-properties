"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/simple-select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft } from "lucide-react";
import { propertiesApi, landlordsApi } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COUNTRIES, PROPERTY_CATEGORIES, PROPERTY_TYPES } from "@/lib/constants";
import { Landlord } from "@/types";

// Zod schema for property validation
const propertySchema = z.object({
    code: z.string().min(2, "Property code is required"),
    name: z.string().min(2, "Property name is required"),
    dateAcquired: z.string().optional(),
    lrNumber: z.string().optional(),
    
    // Location & Address
    country: z.string().optional(),
    estateArea: z.string().optional(),
    areaRegion: z.string().optional(),
    roadStreet: z.string().optional(),
    specification: z.string().optional(),
    
    // Property Classification
    multiStoryType: z.string().optional(),
    numberOfFloors: z.number().int().optional(),
    
    // Geographic Coordinates
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    
    // Notes & Contact Info
    notes: z.string().optional(),
    specificContactInfo: z.string().optional(),
    
    // Relationships
    landlordId: z.string().optional(),
    categoryId: z.string().optional(),
    propertyTypeId: z.string().optional(),
    
    // Accounting & Billing Configuration
    accountLedgerType: z.string().optional(),
    primaryBankAccount: z.string().optional(),
    alternativeTaxPin: z.string().optional(),
    propertyWorkingTaxPin: z.string().optional(),
    invoicePaymentInfo: z.string().optional(),
    holderPaymentTerms: z.string().optional(),
    
    // MPESA Configuration
    mpesaPropertyPayNumber: z.string().optional(),
    disableMpesaStkPush: z.boolean().optional().default(false),
    disableMpesaStkNarration: z.boolean().optional().default(false),
    
    // Rent Penalty Configuration
    lpgExempted: z.boolean().optional().default(false),
    penaltyChargeMode: z.string().optional(),
    penaltyDay: z.number().int().optional(),
    
    // Landlord Banking Details
    landlordDrawerBank: z.string().optional(),
    landlordBankBranch: z.string().optional(),
    landlordAccountName: z.string().optional(),
    landlordAccountNumber: z.string().optional(),
    
    // Communication Preferences
    exemptAllSms: z.boolean().optional().default(false),
    exemptInvoiceSms: z.boolean().optional().default(false),
    exemptGeneralSms: z.boolean().optional().default(false),
    exemptHagueSms: z.boolean().optional().default(false),
    exemptBalanceSms: z.boolean().optional().default(false),
    
    exemptAllEmail: z.boolean().optional().default(false),
    exemptInvoiceEmail: z.boolean().optional().default(false),
    exemptGeneralEmail: z.boolean().optional().default(false),
    exemptReceiptEmail: z.boolean().optional().default(false),
    exemptBalanceEmail: z.boolean().optional().default(false),
    
    // Other Preferences
    excludeInTwoSummaryReport: z.boolean().optional().default(false),
});

type PropertyFormValues = z.infer<typeof propertySchema>;

export default function NewPropertyPage() {
    const { token } = useAuth();
    const router = useRouter();
    const [error, setError] = useState<string | null>(null);
    const [landlords, setLandlords] = useState<Landlord[]>([]);
    const [loadingLandlords, setLoadingLandlords] = useState<boolean>(true);

    // Fetch landlords
    useEffect(() => {
        const fetchLandlords = async () => {
            try {
                const response = await landlordsApi.findAll();
                setLandlords(response.data);
            } catch (err) {
                console.error('Failed to fetch landlords:', err);
            } finally {
                setLoadingLandlords(false);
            }
        };

        fetchLandlords();
    }, []);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm({
        resolver: zodResolver(propertySchema),
        defaultValues: {
            disableMpesaStkPush: false,
            disableMpesaStkNarration: false,
            lpgExempted: false,
            exemptAllSms: false,
            exemptInvoiceSms: false,
            exemptGeneralSms: false,
            exemptHagueSms: false,
            exemptBalanceSms: false,
            exemptAllEmail: false,
            exemptInvoiceEmail: false,
            exemptGeneralEmail: false,
            exemptReceiptEmail: false,
            exemptBalanceEmail: false,
            excludeInTwoSummaryReport: false,
        },
    });

    const onSubmit = async (data: PropertyFormValues) => {
        setError(null);
        try {
            await propertiesApi.create(data);
            router.push("/dashboard/properties");
            router.refresh();
        } catch (err: any) {
            setError(
                err.response?.data?.message || "Failed to create property. Please try again."
            );
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ChevronLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Add New Property</h1>
                    <p className="text-muted-foreground">
                        Enter the details of the new property
                    </p>
                </div>
            </div>

            <div className="rounded-lg border bg-card p-6 shadow-sm">
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                    <Tabs defaultValue="basic">
                        <TabsList className="grid grid-cols-4 mb-8">
                            <TabsTrigger value="basic">Basic Info & Location</TabsTrigger>
                            <TabsTrigger value="classification">Classification</TabsTrigger>
                            <TabsTrigger value="accounting">Accounting</TabsTrigger>
                            <TabsTrigger value="preferences">Preferences</TabsTrigger>
                        </TabsList>

                        {/* Basic Information & Location */}
                        <TabsContent value="basic" className="space-y-4">
                            <h2 className="text-lg font-semibold">Basic Information</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="code" className="text-sm font-medium">
                                        Property Code
                                    </label>
                                    <Input
                                        id="code"
                                        placeholder="e.g. PROP001"
                                        {...register("code")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.code && (
                                        <p className="text-xs text-destructive">{errors.code.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="name" className="text-sm font-medium">
                                        Property Name
                                    </label>
                                    <Input
                                        id="name"
                                        placeholder="e.g. Sunset Apartments"
                                        {...register("name")}
                                        disabled={isSubmitting}
                                    />
                                    {errors.name && (
                                        <p className="text-xs text-destructive">{errors.name.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="categoryId" className="text-sm font-medium">
                                        Property Category
                                    </label>
                                    <Select
                                        id="categoryId"
                                        {...register("categoryId")}
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select category</option>
                                        {PROPERTY_CATEGORIES.map((category) => (
                                            <option key={category.id} value={category.id}>
                                                {category.name}
                                            </option>
                                        ))}
                                    </Select>
                                    {errors.categoryId && (
                                        <p className="text-xs text-destructive">{errors.categoryId.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="propertyTypeId" className="text-sm font-medium">
                                        Property Type
                                    </label>
                                    <Select
                                        id="propertyTypeId"
                                        {...register("propertyTypeId")}
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select type</option>
                                        {PROPERTY_TYPES.map((type) => (
                                            <option key={type.id} value={type.id}>
                                                {type.name}
                                            </option>
                                        ))}
                                    </Select>
                                    {errors.propertyTypeId && (
                                        <p className="text-xs text-destructive">{errors.propertyTypeId.message}</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="dateAcquired" className="text-sm font-medium">
                                        Date Acquired
                                    </label>
                                    <Input
                                        id="dateAcquired"
                                        type="date"
                                        {...register("dateAcquired")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="lrNumber" className="text-sm font-medium">
                                        LR Number
                                    </label>
                                    <Input
                                        id="lrNumber"
                                        placeholder="e.g. LR/12345/678"
                                        {...register("lrNumber")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="landlordId" className="text-sm font-medium">
                                        Landlord
                                    </label>
                                    <Select
                                        id="landlordId"
                                        {...register("landlordId")}
                                        disabled={loadingLandlords || isSubmitting}
                                    >
                                        <option value="">Select landlord</option>
                                        {landlords.map((landlord) => (
                                            <option key={landlord.id} value={landlord.id}>
                                                {landlord.name}
                                            </option>
                                        ))}
                                    </Select>
                                    {errors.landlordId && (
                                        <p className="text-xs text-destructive">{errors.landlordId.message}</p>
                                    )}
                                </div>
                            </div>

                            <h2 className="text-lg font-semibold mt-6">Location & Address</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="country" className="text-sm font-medium">
                                        Country
                                    </label>
                                    <Select
                                        id="country"
                                        {...register("country")}
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select country</option>
                                        {COUNTRIES.map((country) => (
                                            <option key={country.value} value={country.value}>
                                                {country.label}
                                            </option>
                                        ))}
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="estateArea" className="text-sm font-medium">
                                        Estate/Area
                                    </label>
                                    <Input
                                        id="estateArea"
                                        placeholder="e.g. Westlands"
                                        {...register("estateArea")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="areaRegion" className="text-sm font-medium">
                                        Area/Region
                                    </label>
                                    <Input
                                        id="areaRegion"
                                        placeholder="e.g. Nairobi"
                                        {...register("areaRegion")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="roadStreet" className="text-sm font-medium">
                                        Road/Street
                                    </label>
                                    <Input
                                        id="roadStreet"
                                        placeholder="e.g. Waiyaki Way"
                                        {...register("roadStreet")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="specification" className="text-sm font-medium">
                                        Specification
                                    </label>
                                    <Select
                                        id="specification"
                                        {...register("specification")}
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select specification</option>
                                        <option value="multi-unit">Multi-unit/Multi-Space</option>
                                        <option value="single-unit">Single Unit</option>
                                        <option value="space">Space</option>
                                        <option value="na">N/A</option>
                                    </Select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="latitude" className="text-sm font-medium">
                                        Latitude
                                    </label>
                                    <Input
                                        id="latitude"
                                        placeholder="e.g. -1.286389"
                                        {...register("latitude", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="longitude" className="text-sm font-medium">
                                        Longitude
                                    </label>
                                    <Input
                                        id="longitude"
                                        placeholder="e.g. 36.817223"
                                        {...register("longitude", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                <div className="space-y-2">
                                    <label htmlFor="notes" className="text-sm font-medium">
                                        Property Notes
                                    </label>
                                    <Textarea
                                        id="notes"
                                        placeholder="Additional property details or notes..."
                                        {...register("notes")}
                                        disabled={isSubmitting}
                                        className="min-h-[100px]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="specificContactInfo" className="text-sm font-medium">
                                        Specific Contact Information
                                    </label>
                                    <Textarea
                                        id="specificContactInfo"
                                        placeholder="Contact details for the property..."
                                        {...register("specificContactInfo")}
                                        disabled={isSubmitting}
                                        className="min-h-[100px]"
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {/* Property Classification */}
                        <TabsContent value="classification" className="space-y-4">
                            <h2 className="text-lg font-semibold">Property Classification</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="multiStoryType" className="text-sm font-medium">
                                        Multi Story Type
                                    </label>
                                    <Select
                                        id="multiStoryType"
                                        {...register("multiStoryType")}
                                        disabled={isSubmitting}
                                    >
                                        <option value="">Select multi-story type</option>
                                        <option value="low-rise">Low-rise</option>
                                        <option value="mid-rise">Mid-rise</option>
                                        <option value="high-rise">High-rise</option>
                                        <option value="skyscraper">Skyscraper</option>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="numberOfFloors" className="text-sm font-medium">
                                        Number of Floors
                                    </label>
                                    <Input
                                        id="numberOfFloors"
                                        type="number"
                                        placeholder="e.g. 5"
                                        {...register("numberOfFloors", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {/* Accounting & Billing */}
                        <TabsContent value="accounting" className="space-y-4">
                            <h2 className="text-lg font-semibold">Accounting & Billing Configuration</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="accountLedgerType" className="text-sm font-medium">
                                        Account Ledger Type
                                    </label>
                                    <Input
                                        id="accountLedgerType"
                                        placeholder="e.g. Property Control Ledger"
                                        {...register("accountLedgerType")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="primaryBankAccount" className="text-sm font-medium">
                                        Primary Bank Account
                                    </label>
                                    <Input
                                        id="primaryBankAccount"
                                        placeholder="e.g. Equity Bank - 1234567890"
                                        {...register("primaryBankAccount")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="alternativeTaxPin" className="text-sm font-medium">
                                        Alternative Tax PIN
                                    </label>
                                    <Input
                                        id="alternativeTaxPin"
                                        placeholder="e.g. A1234567890"
                                        {...register("alternativeTaxPin")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="propertyWorkingTaxPin" className="text-sm font-medium">
                                        Property Working Tax PIN
                                    </label>
                                    <Input
                                        id="propertyWorkingTaxPin"
                                        placeholder="e.g. P1234567890"
                                        {...register("propertyWorkingTaxPin")}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="invoicePaymentInfo" className="text-sm font-medium">
                                        Invoice Payment Info
                                    </label>
                                    <Textarea
                                        id="invoicePaymentInfo"
                                        placeholder="Payment information for invoices..."
                                        {...register("invoicePaymentInfo")}
                                        disabled={isSubmitting}
                                        className="min-h-[100px]"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="holderPaymentTerms" className="text-sm font-medium">
                                        Holder Payment Terms
                                    </label>
                                    <Textarea
                                        id="holderPaymentTerms"
                                        placeholder="Payment terms for the property holder..."
                                        {...register("holderPaymentTerms")}
                                        disabled={isSubmitting}
                                        className="min-h-[100px]"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="mpesaPropertyPayNumber" className="text-sm font-medium">
                                        MPESA Paybill Number
                                    </label>
                                    <Input
                                        id="mpesaPropertyPayNumber"
                                        placeholder="e.g. 123456"
                                        {...register("mpesaPropertyPayNumber")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="penaltyChargeMode" className="text-sm font-medium">
                                        Penalty Charge Mode
                                    </label>
                                    <Input
                                        id="penaltyChargeMode"
                                        placeholder="e.g. Daily"
                                        {...register("penaltyChargeMode")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="penaltyDay" className="text-sm font-medium">
                                        Penalty Day
                                    </label>
                                    <Input
                                        id="penaltyDay"
                                        type="number"
                                        placeholder="e.g. 7"
                                        {...register("penaltyDay", { valueAsNumber: true })}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label htmlFor="landlordDrawerBank" className="text-sm font-medium">
                                        Drawer Bank
                                    </label>
                                    <Input
                                        id="landlordDrawerBank"
                                        placeholder="e.g. KCB Bank"
                                        {...register("landlordDrawerBank")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="landlordBankBranch" className="text-sm font-medium">
                                        Bank Branch
                                    </label>
                                    <Input
                                        id="landlordBankBranch"
                                        placeholder="e.g. Nairobi CBD"
                                        {...register("landlordBankBranch")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="landlordAccountName" className="text-sm font-medium">
                                        Account Name
                                    </label>
                                    <Input
                                        id="landlordAccountName"
                                        placeholder="e.g. John Doe"
                                        {...register("landlordAccountName")}
                                        disabled={isSubmitting}
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label htmlFor="landlordAccountNumber" className="text-sm font-medium">
                                        Account Number
                                    </label>
                                    <Input
                                        id="landlordAccountNumber"
                                        placeholder="e.g. 1234567890"
                                        {...register("landlordAccountNumber")}
                                        disabled={isSubmitting}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {/* Preferences */}
                        <TabsContent value="preferences" className="space-y-4">
                            <h2 className="text-lg font-semibold">MPESA Configuration</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="disableMpesaStkPush"
                                        {...register("disableMpesaStkPush")}
                                        disabled={isSubmitting}
                                    />
                                    <label htmlFor="disableMpesaStkPush" className="text-sm font-medium">
                                        Disable MPESA STK Push
                                    </label>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Checkbox
                                        id="disableMpesaStkNarration"
                                        {...register("disableMpesaStkNarration")}
                                        disabled={isSubmitting}
                                    />
                                    <label htmlFor="disableMpesaStkNarration" className="text-sm font-medium">
                                        Disable MPESA STK Narration
                                    </label>
                                </div>
                            </div>

                            <h2 className="text-lg font-semibold mt-6">Rent Penalty Configuration</h2>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="lpgExempted"
                                    {...register("lpgExempted")}
                                    disabled={isSubmitting}
                                />
                                <label htmlFor="lpgExempted" className="text-sm font-medium">
                                    LPG Exempted
                                </label>
                            </div>

                            <h2 className="text-lg font-semibold mt-6">Communication Preferences</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <h3 className="text-sm font-medium text-muted-foreground">SMS Preferences</h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptAllSms"
                                                {...register("exemptAllSms")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptAllSms" className="text-sm">
                                                Exempt All SMS
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptInvoiceSms"
                                                {...register("exemptInvoiceSms")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptInvoiceSms" className="text-sm">
                                                Exempt Invoice SMS
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptGeneralSms"
                                                {...register("exemptGeneralSms")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptGeneralSms" className="text-sm">
                                                Exempt General SMS
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptHagueSms"
                                                {...register("exemptHagueSms")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptHagueSms" className="text-sm">
                                                Exempt Hague SMS
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptBalanceSms"
                                                {...register("exemptBalanceSms")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptBalanceSms" className="text-sm">
                                                Exempt Balance SMS
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <h3 className="text-sm font-medium text-muted-foreground">Email Preferences</h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptAllEmail"
                                                {...register("exemptAllEmail")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptAllEmail" className="text-sm">
                                                Exempt All Email
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptInvoiceEmail"
                                                {...register("exemptInvoiceEmail")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptInvoiceEmail" className="text-sm">
                                                Exempt Invoice Email
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptGeneralEmail"
                                                {...register("exemptGeneralEmail")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptGeneralEmail" className="text-sm">
                                                Exempt General Email
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptReceiptEmail"
                                                {...register("exemptReceiptEmail")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptReceiptEmail" className="text-sm">
                                                Exempt Receipt Email
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Checkbox
                                                id="exemptBalanceEmail"
                                                {...register("exemptBalanceEmail")}
                                                disabled={isSubmitting}
                                            />
                                            <label htmlFor="exemptBalanceEmail" className="text-sm">
                                                Exempt Balance Email
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <h2 className="text-lg font-semibold mt-6">Other Preferences</h2>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="excludeInTwoSummaryReport"
                                    {...register("excludeInTwoSummaryReport")}
                                    disabled={isSubmitting}
                                />
                                <label htmlFor="excludeInTwoSummaryReport" className="text-sm font-medium">
                                    Exclude in Two Summary Report
                                </label>
                            </div>
                        </TabsContent>
                    </Tabs>

                    {error && (
                        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-4">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => router.back()}
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Creating..." : "Create Property"}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
