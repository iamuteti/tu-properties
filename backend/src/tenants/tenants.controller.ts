import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('tenants')
export class TenantsController {
    constructor(private readonly tenantsService: TenantsService) { }

    @Post()
    create(@Body() createTenantDto: Prisma.TenantCreateInput) {
        return this.tenantsService.create(createTenantDto);
    }

    @Get()
    findAll() {
        return this.tenantsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.tenantsService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateTenantDto: Prisma.TenantUpdateInput) {
        return this.tenantsService.update(id, updateTenantDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.tenantsService.remove(id);
    }
}
