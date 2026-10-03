import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
  Request,
} from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Permissions('receipts.view')
@Controller('finance/receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post()
  @Permissions('receipts.create')
  create(
    @Body()
    createReceiptDto: {
      receiptId?: string;
      receiptType?: 'ApplyToInvoice' | 'CashReceipt';
      receiptCategory?: 'Rent' | 'General';
      receivedFrom: string;
      paymentMethod:
        | 'CASH'
        | 'BANK_TRANSFER'
        | 'CHEQUE'
        | 'MPESA'
        | 'CARD'
        | 'OTHER';
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
        rentalAgreementId?: string;
        paymentDate: string | Date;
        amount: number;
        currency?: string;
        spotRate?: number;
        paymentMethod:
          | 'CASH'
          | 'BANK_TRANSFER'
          | 'CHEQUE'
          | 'MPESA'
          | 'CARD'
          | 'OTHER';
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
    },
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.receiptsService.create(createReceiptDto, tenantId);
  }

  @Get()
  findAll(@Request() req, @Query('category') category?: string) {
    const tenantId = getTenantId(req);
    return this.receiptsService.findAll(tenantId, category);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.receiptsService.findOne(id, tenantId);
  }

  @Delete(':id')
  @Permissions('receipts.delete')
  delete(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.receiptsService.delete(id, tenantId);
  }

  @Post('bulk-delete')
  @Permissions('receipts.delete')
  deleteMany(@Body() body: { ids: string[] }, @Request() req) {
    const tenantId = getTenantId(req);
    return this.receiptsService.deleteMany(body.ids, tenantId);
  }
}
