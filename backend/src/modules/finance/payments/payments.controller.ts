import { Controller, Get, Post, Body, Param, UseGuards, Delete, Request } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('finance/payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) { }

    @Post()
    create(@Body() createPaymentDto: Prisma.PaymentCreateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.paymentsService.create(createPaymentDto, tenantId);
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
