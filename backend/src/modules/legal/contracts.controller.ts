import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { ContractsService } from './contracts.service';
import {
  CONTRACTS_DELETE_ROLES,
  CONTRACTS_FILE_ROLES,
  CONTRACTS_RENEW_ROLES,
  CONTRACTS_VIEW_ROLES,
} from './legal-roles';
import {
  ContractQueryDto,
  CreateContractDto,
  ExpiryReportQueryDto,
  RenewContractDto,
  UpdateContractDto,
} from './dto/contracts.dto';

/**
 * Module 15 - the contract register.
 *
 * One controller, and specifically **not** four controllers sharing a prefix - that is
 * the Module 13 route-shadowing trap (`@Get(':id')` on a prefix swallowing
 * `/facilities/bookings`). Every list route here is a literal segment declared before
 * any `:id`: `/contracts/expiry-report` sits above `/contracts/:id` for that reason
 * alone, because `expiry-report` would otherwise be read as an id and 404 with a
 * confusing message.
 *
 * Five permission tiers, and the split that matters is not view-versus-write - see
 * `legal-roles.ts`, which is where the argument is made:
 *
 * - `contracts.view` reads the register. Broad, because "what is the notice period on
 *   this agreement?" is a question four different roles need answered.
 * - `contracts.create`/`.update` files and corrects a contract. **Not** granted to
 *   `ACCOUNTANT`, who may read every obligation but may not manufacture one.
 * - `contracts.renew` replaces an expiring contract with a new term. The only action
 *   here that changes somebody's commitment, and separate from `create` for the same
 *   reason `payroll.approve` is separate from `payroll.pay`.
 * - `contracts.delete` removes a row that was entered in error. **Not** "the contract
 *   has lapsed" - a lapse is recorded by letting the term end, which keeps the evidence.
 * - `CONTRACTS_COMPLIANCE_ROLES` additionally gates `COMPLIANCE` certificates inside
 *   the service, because the role grants are organisation-wide and would otherwise let
 *   a maintenance manager file a supplier agreement alongside the certificates they
 *   maintain.
 *
 * There is no `PATCH /contracts/:id/status` and no `status` in any DTO. A contract's
 * status is derived from the clock by `contract-expiry.ts` and is never stored, so a
 * route that could write it would let a user file a contract as `EXPIRED` and keep it
 * expired through a renewal.
 */
@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  /**
   * The expiry report.
   *
   * Declared **before** `:id`. This is the Module 13 shadowing trap again, and it is a
   * literal one-segment segment in a prefix that also has a `:id` - `expiry-report`
   * would be matched as an id and come back as "Contract not found".
   */
  @Get('expiry-report')
  @Roles(...CONTRACTS_VIEW_ROLES)
  @Permissions('contracts.view')
  expiryReport(@Query() query: ExpiryReportQueryDto, @Request() req: any) {
    return this.service.expiryReport(query, req);
  }
  @Get(':id')
  @Roles(...CONTRACTS_VIEW_ROLES)
  @Permissions('contracts.view')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.service.findOne(id, req);
  }

  @Get()
  @Roles(...CONTRACTS_VIEW_ROLES)
  @Permissions('contracts.view')
  findAll(@Query() query: ContractQueryDto, @Request() req: any) {
    return this.service.findAll(query, req);
  }

  /**
   * File a contract.
   *
   * `CONTRACTS_FILE_ROLES` excludes `ACCOUNTANT` on purpose. Note that the compliance
   * gate is a *service* check rather than another decorator: a decorator can only say
   * "may this role create a contract", not "may this role create a contract **of this
   * type**", and the distinction is the whole reason `COMPLIANCE` exists here.
   */
  @Post()
  @Roles(...CONTRACTS_FILE_ROLES)
  @Permissions('contracts.create')
  create(@Body() dto: CreateContractDto, @Request() req: any) {
    return this.service.create(dto, req);
  }

  /**
   * Correct a contract's dates, title, notice period, notes or attachment.
   *
   * `type`, the four counterparty columns and `renewalOfId` are absent from
   * `UpdateContractDto` and that is the design - see the DTO header. A mis-filed
   * contract is deleted and refiled; `renewalOfId` is set only by `renew`.
   */
  @Patch(':id')
  @Roles(...CONTRACTS_FILE_ROLES)
  @Permissions('contracts.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @Request() req: any,
  ) {
    return this.service.update(id, dto, req);
  }

  /**
   * Replace an expiring contract with a new term.
   *
   * A named action rather than a `PATCH`, for the same reason `bill` and `void` are:
   * a renewal creates a row, changes the chain, and sets somebody's term for another
   * year, and none of that should be reachable by editing a date.
   */
  @Post(':id/renew')
  @Roles(...CONTRACTS_RENEW_ROLES)
  @Permissions('contracts.renew')
  renew(
    @Param('id') id: string,
    @Body() dto: RenewContractDto,
    @Request() req: any,
  ) {
    return this.service.renew(id, dto, req);
  }

  /**
   * Remove a contract that was entered in error.
   *
   * A contract with a renewal is refused by the service rather than deleted, because
   * the successor would be silently orphaned and its history would start from nothing.
   */
  @Delete(':id')
  @Roles(...CONTRACTS_DELETE_ROLES)
  @Permissions('contracts.delete')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.service.remove(id, req);
  }
}
