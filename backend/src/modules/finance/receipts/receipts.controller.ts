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

/**
 * How the money was paid.
 *
 * `DIRECT_REMIT` is the one that is not an instrument: it says the payer sent
 * the money straight to the party it was due to — usually the owner — and it
 * never reached an account of ours. It is here rather than being left as
 * "cash" because a receipt that says cash when no cash arrived is a ledger
 * that claims the estate holds money it has never seen.
 */
type PaymentMethod =
  | 'CASH'
  | 'BANK_TRANSFER'
  | 'CHEQUE'
  | 'MPESA'
  | 'CARD'
  | 'OTHER'
  | 'DIRECT_REMIT';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Permissions('receipts.view')
@Controller('finance/receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  /**
   * Capture money that arrived.
   *
   * The property manager is on this route and not on the ones below, and the
   * difference is deliberate. They are the person who is actually at the
   * estate and receives the money, so they may record that it arrived — but
   * the register is finance's: reading every receipt in the organization and
   * reversing one are two things the person who witnessed the handover should
   * not be able to do. A receipt the property manager cannot quietly remove is
   * evidence; a receipt they can is a note.
   */
  @Post()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.ACCOUNTANT,
    UserRole.PROPERTY_MANAGER,
  )
  @Permissions('receipts.create')
  create(
    @Body()
    createReceiptDto: {
      receiptId?: string;
      receiptType?: 'ApplyToInvoice' | 'CashReceipt';
      receiptCategory?: 'Rent' | 'General';
      receivedFrom: string;
      paymentMethod: PaymentMethod;
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
        agreementId?: string;
        paymentDate: string | Date;
        amount: number;
        currency?: string;
        spotRate?: number;
        paymentMethod: PaymentMethod;
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
