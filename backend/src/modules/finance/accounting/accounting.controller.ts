import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AccountType, JournalEntrySource, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId, getUserId } from '@/common/utils';
import { AccountingService, JournalLineInput } from './accounting.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('finance/accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  // ── Chart of accounts ─────────────────────────────────────────────────────

  @Get('accounts')
  @Permissions('accounting.view')
  listAccounts(@Request() req) {
    return this.accountingService.listAccounts(getTenantId(req));
  }

  @Post('accounts')
  @Permissions('accounting.create')
  createAccount(
    @Body()
    body: {
      code: string;
      name: string;
      type: AccountType;
      subtype?: string;
      description?: string;
      normalBalance?: 'DEBIT' | 'CREDIT';
      isPostable?: boolean;
    },
    @Request() req,
  ) {
    return this.accountingService.createAccount(body, getTenantId(req));
  }

  @Put('accounts/:id')
  @Permissions('accounting.update')
  updateAccount(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      subtype?: string;
      description?: string;
      isPostable?: boolean;
      isActive?: boolean;
    },
    @Request() req,
  ) {
    return this.accountingService.updateAccount(id, body, getTenantId(req));
  }

  @Delete('accounts/:id')
  @Permissions('accounting.delete')
  deleteAccount(@Param('id') id: string, @Request() req) {
    return this.accountingService.deleteAccount(id, getTenantId(req));
  }

  // ── Journal entries ───────────────────────────────────────────────────────

  @Get('entries')
  @Permissions('accounting.view')
  findEntries(
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountingService.findEntries(getTenantId(req), {
      from,
      to,
      source,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('entries/:id')
  @Permissions('accounting.view')
  findEntry(@Param('id') id: string, @Request() req) {
    return this.accountingService.findEntry(id, getTenantId(req));
  }

  @Post('entries')
  @Permissions('accounting.create')
  createEntry(
    @Body()
    body: {
      entryDate?: string;
      memo?: string;
      reference?: string;
      lines: JournalLineInput[];
    },
    @Request() req,
  ) {
    return this.accountingService.postEntry(
      {
        entryDate: body.entryDate,
        memo: body.memo,
        reference: body.reference,
        source: JournalEntrySource.MANUAL,
        postedBy: getUserId(req),
        lines: body.lines,
      },
      getTenantId(req),
    );
  }

  @Post('entries/:id/reverse')
  @Permissions('accounting.update')
  reverseEntry(@Param('id') id: string, @Request() req) {
    return this.accountingService.reverseEntry(
      id,
      getTenantId(req),
      getUserId(req),
    );
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  @Get('trial-balance')
  @Permissions('accounting.view')
  trialBalance(
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.trialBalance(getTenantId(req), from, to);
  }

  @Get('accounts/:id/ledger')
  @Permissions('accounting.view')
  accountLedger(
    @Param('id') id: string,
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.accountLedger(id, getTenantId(req), from, to);
  }
}
