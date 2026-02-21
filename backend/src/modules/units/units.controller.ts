import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { UnitsService } from './units.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('units')
export class UnitsController {
    constructor(private readonly unitsService: UnitsService) { }

    @Post()
    create(@Body() createUnitDto: any, @Request() req) {
        const tenantId = getTenantId(req);
        return this.unitsService.create(createUnitDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = getTenantId(req);
        return this.unitsService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.unitsService.findOne(id, tenantId);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateUnitDto: Prisma.UnitUpdateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.unitsService.update(id, updateUnitDto, tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.unitsService.remove(id, tenantId);
    }
}
