import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Delete,
  Request,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Prisma, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { UsersService } from '@/modules/users/users.service';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Permissions('payments.view')
@Controller('finance/payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @Permissions('payments.create')
  async create(
    @Body() createPaymentDto: Prisma.PaymentCreateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    const user = await this.usersService.findOne(req.user.userId);
    const recordedBy = user
      ? `${user.firstName} ${user.lastName}`
      : 'Unknown User';
    return this.paymentsService.create(
      {
        ...createPaymentDto,
        recordedBy,
      },
      tenantId,
    );
  }

  @Post(':id/allocate')
  @Permissions('payments.update')
  async allocate(
    @Param('id') id: string,
    @Body() body: { invoiceIds?: string[] },
    @Request() req,
  ) {
    const user = await this.usersService.findOne(req.user.userId);
    return this.paymentsService.allocate(
      id,
      {
        invoiceIds: body.invoiceIds,
        allocatedBy: user ? `${user.firstName} ${user.lastName}` : undefined,
      },
      getTenantId(req),
    );
  }

  @Post(':id/reverse')
  @Permissions('payments.update')
  async reverse(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    const user = await this.usersService.findOne(req.user.userId);
    const reversedBy = user
      ? `${user.firstName} ${user.lastName}`
      : 'Unknown User';
    return this.paymentsService.reverse(id, tenantId, reversedBy);
  }

  @Get()
  findAll(@Request() req) {
    const tenantId = getTenantId(req);
    return this.paymentsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.paymentsService.findOne(id, tenantId);
  }

  @Delete(':id')
  @Permissions('payments.delete')
  delete(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.paymentsService.delete(id, tenantId);
  }

  @Post('bulk-delete')
  @Permissions('payments.delete')
  deleteMany(@Body() body: { ids: string[] }, @Request() req) {
    const tenantId = getTenantId(req);
    return this.paymentsService.deleteMany(body.ids, tenantId);
  }
}
