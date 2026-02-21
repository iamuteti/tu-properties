import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { LeasesService } from './leases.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('leases')
export class LeasesController {
    constructor(private readonly leasesService: LeasesService) { }

    @Post()
    create(@Body() createLeaseDto: Prisma.LeaseCreateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.leasesService.create(createLeaseDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = getTenantId(req);
        return this.leasesService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.leasesService.findOne(id, tenantId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateLeaseDto: Prisma.LeaseUpdateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.leasesService.update(id, updateLeaseDto, tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.leasesService.remove(id, tenantId);
    }
}
