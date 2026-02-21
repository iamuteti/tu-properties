import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';
import { getTenantId } from '@/common/utils';

@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
    constructor(private readonly propertiesService: PropertiesService) { }

    @Post()
    create(@Body() createPropertyDto: Prisma.PropertyCreateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.propertiesService.create(createPropertyDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = getTenantId(req);
        return this.propertiesService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.propertiesService.findOne(id, tenantId);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updatePropertyDto: Prisma.PropertyUpdateInput,
        @Request() req,
    ) {
        const tenantId = getTenantId(req);
        return this.propertiesService.update(id, updatePropertyDto, tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.propertiesService.remove(id, tenantId);
    }
}
