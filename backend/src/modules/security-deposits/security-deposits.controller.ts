import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { requireTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import {
  SecurityDepositsService,
  type DepositFilters,
} from './security-deposits.service';
import { SetDepositRuleDto } from './dto/deposit.dto';

/**
 * Who may read the deposit register.
 *
 * The same three roles the sidebar offers the screen to, deliberately: a nav
 * item a role can see but the API refuses is exactly the inconsistency this
 * product's role lists are written to avoid, and a deposit register is money the
 * company is holding on a resident's behalf.
 */
const DEPOSIT_VIEW_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
];

/**
 * Who may set a deposit rule.
 *
 * The property manager, on the owner's instruction. There is no landlord
 * portal in the product, so there is nobody else who could.
 */
const DEPOSIT_RULE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
];

/**
 * Deposits (Module 5).
 *
 * Two things live here: the **rule** — what the owner requires as a deposit
 * for each kind of unit a property has — and the **register**, which is
 * derived from the agreements, the deposit invoices and the move-outs rather
 * than being a second copy of the facts.
 *
 * The rule is set here; the money is moved by Finance (a deposit is billed as
 * its own invoice and paid like any other), and the refund is paid by the
 * move-out. This controller owns the policy and the picture, not the cash.
 */
@UseGuards(JwtAuthGuard)
@Controller('security-deposits')
export class SecurityDepositsController {
  constructor(private readonly deposits: SecurityDepositsService) {}

  @Get()
  @Roles(...DEPOSIT_VIEW_ROLES)
  @Permissions('deposits.view')
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('propertyId') propertyId?: string,
  ) {
    const filters: DepositFilters = {
      status: status || undefined,
      propertyId: propertyId || undefined,
    };

    return this.deposits.findAll(
      requireTenantId(req),
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 20,
        search: search || undefined,
      },
      filters,
    );
  }

  /**
   * The deposit rules, per kind of unit — what each property asks for, against
   * what the register says was actually taken.
   */
  @Get('policies')
  @Roles(...DEPOSIT_VIEW_ROLES)
  @Permissions('deposits.view')
  findPolicies(@Request() req) {
    return this.deposits.findPolicies(requireTenantId(req));
  }

  /**
   * The rule that applies to a unit, and what it works out to.
   *
   * This is what the agreement screen asks before anybody types a deposit: it
   * either has an answer, or it says that nobody has decided — and those two
   * are not the same thing.
   */
  @Get('rule')
  @Roles(...DEPOSIT_VIEW_ROLES)
  @Permissions('deposits.view')
  ruleForUnit(
    @Request() req,
    @Query('unitId') unitId?: string,
    @Query('rentAmount') rentAmount?: string,
  ) {
    if (!unitId) {
      return { unitId: null, decided: false, amount: 0, rule: null };
    }
    return this.deposits.ruleForUnit(
      unitId,
      rentAmount ? Number(rentAmount) : null,
      requireTenantId(req),
    );
  }

  /**
   * Set the deposit rule for a kind of unit.
   *
   * A rule of zero is stored as a rule of zero: that is "this kind of unit
   * takes no deposit", said on the record. Clearing the rule is a different
   * thing — it is "nobody has decided", and the agreement screen says so.
   */
  @Put('unit-types/:unitTypeId/rule')
  @Roles(...DEPOSIT_RULE_ROLES)
  @Permissions('deposits.update')
  setRule(
    @Param('unitTypeId') unitTypeId: string,
    @Body() body: SetDepositRuleDto,
    @Request() req,
  ) {
    return this.deposits.setRule(unitTypeId, body, requireTenantId(req));
  }

  @Delete('unit-types/:unitTypeId/rule')
  @Roles(...DEPOSIT_RULE_ROLES)
  @Permissions('deposits.update')
  clearRule(@Param('unitTypeId') unitTypeId: string, @Request() req) {
    return this.deposits.clearRule(unitTypeId, requireTenantId(req));
  }
}
