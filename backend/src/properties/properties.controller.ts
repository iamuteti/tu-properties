import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';

@Controller('properties')
@UseGuards(JwtAuthGuard)
export class PropertiesController {
    constructor(private readonly propertiesService: PropertiesService) { }

    private getTenantId(request: any): string | undefined {
        const user = request?.user;
        if (!user) return undefined;
        if (user.role === 'SUPER_ADMIN') return undefined;
        return user.organizationId || undefined;
    }

    @Post()
    create(@Body() createPropertyDto: Prisma.PropertyCreateInput, @Request() req) {
        const tenantId = this.getTenantId(req);
        return this.propertiesService.create(createPropertyDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = this.getTenantId(req);
        return this.propertiesService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = this.getTenantId(req);
        return this.propertiesService.findOne(id, tenantId);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updatePropertyDto: Prisma.PropertyUpdateInput,
        @Request() req,
    ) {
        const tenantId = this.getTenantId(req);
        return this.propertiesService.update(id, updatePropertyDto, tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        const tenantId = this.getTenantId(req);
        return this.propertiesService.remove(id, tenantId);
    }
}
