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
import { BadRequestException } from '@nestjs/common';
import { TaxBasis, TaxTreatment, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { getTenantId } from '@/common/utils';
import { TaxService } from './tax.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('finance/tax')
export class TaxController {
  constructor(private readonly taxService: TaxService) {}

  private requireTenant(req: unknown): string {
    const tenantId = getTenantId(req as never);
    if (!tenantId) {
      throw new BadRequestException('No organization scope on this request');
    }
    return tenantId;
  }

  /**
   * Price a hypothetical invoice under the organization's rules without writing
   * anything — what the invoice form calls as the user types.
   */
  @Post('calculate')
  @Permissions('tax.view')
  calculate(
    @Body()
    body: {
      lines: {
        description: string;
        amount: number;
        quantity?: number;
        category?: string;
      }[];
      at?: string;
      countryCode?: string;
      regionCode?: string;
    },
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    if (!tenantId) throw new BadRequestException('No organization scope');
    return this.taxService.computeFor(tenantId, body.lines ?? [], {
      at: body.at ? new Date(body.at) : new Date(),
      jurisdiction:
        body.countryCode !== undefined
          ? {
              countryCode: body.countryCode,
              regionCode: body.regionCode ?? null,
            }
          : undefined,
    });
  }

  @Get('rules')
  @Permissions('tax.view')
  findAll(@Request() req, @Query('countryCode') countryCode?: string) {
    return this.taxService.findAll(this.requireTenant(req), { countryCode });
  }

  @Get('jurisdiction')
  @Permissions('tax.view')
  jurisdiction(@Request() req) {
    return this.taxService.jurisdictionOf(this.requireTenant(req));
  }

  /**
   * Declare where this organization is taxed. Until this is set, only
   * country-less fallback rules apply — which is why a new organization sees
   * no tax on its invoices rather than an accidental Kenyan 16%.
   */
  @Put('jurisdiction')
  @Permissions('tax.update')
  setJurisdiction(
    @Body()
    body: {
      countryCode?: string | null;
      regionCode?: string | null;
      taxRegistrationNumber?: string | null;
    },
    @Request() req,
  ) {
    return this.taxService.setJurisdiction(this.requireTenant(req), body);
  }

  /**
   * Record tax paid over to the authority. Clears the liability (and, for tax
   * customers withheld at source, the matching receivable), so the accounts show
   * what is genuinely still owed rather than accumulating forever.
   */
  @Post('remit')
  @Permissions('tax.create')
  remit(
    @Body()
    body: {
      amount: number;
      remittanceDate?: string;
      code?: string;
      clearsWithholding?: boolean;
      bankAccountCode?: string;
      reference?: string;
    },
    @Request() req,
  ) {
    return this.taxService.remit(body, this.requireTenant(req));
  }

  @Get('rules/:id')
  @Permissions('tax.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.taxService.findOne(id, this.requireTenant(req));
  }

  /**
   * Create a rule, or supersede an existing one by passing its `id` — the old
   * rule is closed with an end date rather than edited, so invoices already
   * issued under it keep citing the rate that applied then.
   */
  @Post('rules')
  @Permissions('tax.create')
  create(
    @Body()
    body: {
      id?: string;
      code: string;
      name: string;
      description?: string;
      countryCode?: string | null;
      regionCode?: string | null;
      basis?: TaxBasis;
      treatment?: TaxTreatment;
      appliesToCategory?: string;
      isCompound?: boolean;
      compoundOnRuleId?: string | null;
      ratePercent: number;
      ledgerAccountCode?: string;
      validFrom?: string;
      validTo?: string;
    },
    @Request() req,
  ) {
    return this.taxService.create(body, this.requireTenant(req));
  }

  @Put('rules/:id')
  @Permissions('tax.update')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      description?: string;
      isActive?: boolean;
      validTo?: string;
    },
    @Request() req,
  ) {
    return this.taxService.update(id, body, this.requireTenant(req));
  }

  @Delete('rules/:id')
  @Permissions('tax.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.taxService.remove(id, this.requireTenant(req));
  }
}
