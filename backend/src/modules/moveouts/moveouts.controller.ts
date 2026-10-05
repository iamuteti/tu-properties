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
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getUserId, requireTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { MoveoutsService } from './moveouts.service';
import {
  ApproveMoveOutDto,
  CreateDeductionDto,
  CreateMoveOutRequestDto,
  RefundDepositDto,
} from '@/modules/leases/dto/lease.dto';

const MOVE_OUT_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.LEASING_OFFICER,
];

/**
 * Move-out requests (Module 5).
 *
 * The deposit refund is derived from itemised deductions, so the endpoints are
 * split: `deductions` records *why*, `refund` pays the derived amount out.
 */
@UseGuards(JwtAuthGuard)
@Controller('move-outs')
export class MoveoutsController {
  constructor(private readonly moveoutsService: MoveoutsService) {}

  @Post()
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  create(@Body() dto: CreateMoveOutRequestDto, @Request() req) {
    return this.moveoutsService.create(
      { ...dto, moveoutDate: new Date(dto.moveoutDate) },
      requireTenantId(req),
    );
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('status') status?: string,
  ) {
    return this.moveoutsService.findAll(
      requireTenantId(req),
      {
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 10,
        search,
        sortBy,
        sortOrder,
      },
      { status },
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.moveoutsService.findOne(id, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  update(
    @Param('id') id: string,
    @Body() dto: { moveoutDate?: string; notes?: string },
    @Request() req,
  ) {
    return this.moveoutsService.update(
      id,
      {
        ...dto,
        ...(dto.moveoutDate ? { moveoutDate: new Date(dto.moveoutDate) } : {}),
      },
      requireTenantId(req),
    );
  }

  @Post(':id/approve')
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveMoveOutDto,
    @Request() req,
  ) {
    return this.moveoutsService.approve(
      id,
      {
        ...(dto.approvedDate
          ? { approvedDate: new Date(dto.approvedDate) }
          : {}),
        ...(dto.notes ? { notes: dto.notes } : {}),
      },
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/reject')
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  reject(
    @Param('id') id: string,
    @Body() dto: { notes: string },
    @Request() req,
  ) {
    return this.moveoutsService.reject(id, dto.notes, requireTenantId(req));
  }

  /** The auditable deposit position: held, deducted, unpaid rent, refund. */
  @Get(':id/deposit')
  deposit(@Param('id') id: string, @Request() req) {
    return this.moveoutsService.depositCalculation(id, requireTenantId(req));
  }

  @Post(':id/deductions')
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  addDeduction(
    @Param('id') id: string,
    @Body() dto: CreateDeductionDto,
    @Request() req,
  ) {
    return this.moveoutsService.addDeduction(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Delete(':id/deductions/:deductionId')
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  removeDeduction(
    @Param('id') id: string,
    @Param('deductionId') deductionId: string,
    @Request() req,
  ) {
    return this.moveoutsService.removeDeduction(
      id,
      deductionId,
      requireTenantId(req),
    );
  }

  @Post(':id/refund')
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  refund(
    @Param('id') id: string,
    @Body() dto: RefundDepositDto,
    @Request() req,
  ) {
    return this.moveoutsService.refundDeposit(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Delete(':id')
  @Roles(...MOVE_OUT_ROLES)
  @Permissions('leases.update')
  remove(@Param('id') id: string, @Request() req) {
    return this.moveoutsService.remove(id, requireTenantId(req));
  }
}
