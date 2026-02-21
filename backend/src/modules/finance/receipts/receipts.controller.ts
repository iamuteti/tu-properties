import { Controller, Get, Post, Body, Param, UseGuards, Delete, Request } from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('finance/receipts')
export class ReceiptsController {
    constructor(private readonly receiptsService: ReceiptsService) { }

    @Post()
    create(@Body() createReceiptDto: {
        receiptId?: string;
        receiptType?: 'ApplyToInvoice' | 'CashReceipt';
        receiptCategory?: 'Rent' | 'General';
        receivedFrom: string;
        paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
        depositIntoAc?: string;
        refNo?: string;
        chequeNo?: string;
        chequeDate?: string;
        recordingDate?: string | Date;
        amountReceived: number;
        notes?: string;
        tenantId?: string;
        landlordId?: string;
        recordDate?: string | Date;
        bankingDate?: string | Date;
        paymentRefNo?: string;
        amountVatInclusive?: boolean;
        receiptTo?: 'Landlord' | 'GeneralLedger';
        drtOrDrf?: 'DirectReceipt' | 'DepositRefund';
        memo?: string;
        paymentBank?: string;
        currency?: string;
        spotRate?: number;
        receiptLines?: {
            date: string | Date;
            invNo?: string;
            particular: string;
            invoiceTotal: number;
            prevReceipts?: number;
            amtDue: number;
            payment: number;
            newBalance: number;
            whtTax?: number;
        }[];
        payments?: {
            invoiceId?: string;
            leaseId?: string;
            paymentDate: string | Date;
            amount: number;
            currency?: string;
            spotRate?: number;
            paymentMethod: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'MPESA' | 'CARD' | 'OTHER';
            paymentReference?: string;
            payee?: string;
            paidFrom?: string;
            paidTo?: string;
            paymentType?: 'ApplyToBill' | 'CashPayment';
            chequeNumber?: string;
            chequeDate?: string;
            mpesaReceiptNumber?: string;
            mpesaPhoneNumber?: string;
            notes?: string;
            attachments?: string;
        }[];
        recordedBy?: string;
    }, @Request() req) {
        const tenantId = getTenantId(req);
        return this.receiptsService.create(createReceiptDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = getTenantId(req);
        return this.receiptsService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.receiptsService.findOne(id, tenantId);
    }

    @Delete(':id')
    delete(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.receiptsService.delete(id, tenantId);
    }

    @Post('bulk-delete')
    deleteMany(@Body() body: { ids: string[] }, @Request() req) {
        const tenantId = getTenantId(req);
        return this.receiptsService.deleteMany(body.ids, tenantId);
    }
}
