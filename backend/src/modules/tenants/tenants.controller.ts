import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    create(@Body() createTenantDto: Prisma.TenantCreateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.tenantsService.create(createTenantDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = getTenantId(req);
        return this.tenantsService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.tenantsService.findOne(id, tenantId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateTenantDto: Prisma.TenantUpdateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.tenantsService.update(id, updateTenantDto, tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.tenantsService.remove(id, tenantId);
    }
}
