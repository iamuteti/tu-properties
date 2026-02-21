import { Controller, Get, Post, Body, Param, UseGuards, Delete, Request } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { UsersService } from '@/modules/users/users.service';

@UseGuards(JwtAuthGuard)
@Controller('finance/payments')
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly usersService: UsersService
    ) { }

    @Post()
    async create(@Body() createPaymentDto: Prisma.PaymentCreateInput, @Request() req) {
        const tenantId = getTenantId(req);
        const user = await this.usersService.findOne(req.user.userId);
        const recordedBy = user ? `${user.firstName} ${user.lastName}` : 'Unknown User';
        return this.paymentsService.create({
            ...createPaymentDto,
            recordedBy
        }, tenantId);
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
    delete(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.paymentsService.delete(id, tenantId);
    }

    @Post('bulk-delete')
    deleteMany(@Body() body: { ids: string[] }, @Request() req) {
        const tenantId = getTenantId(req);
        return this.paymentsService.deleteMany(body.ids, tenantId);
    }
}
