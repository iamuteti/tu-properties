import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { LandlordsService } from './landlords.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';
import { getTenantId } from '@/common/utils';

@Controller('landlords')
@UseGuards(JwtAuthGuard)
export class LandlordsController {
    constructor(private readonly landlordsService: LandlordsService) { }

    @Post()
    create(@Body() createLandlordDto: Prisma.LandlordCreateInput, @Request() req) {
        const tenantId = getTenantId(req);
        return this.landlordsService.create(createLandlordDto, tenantId);
    }

    @Get()
    findAll(@Request() req) {
        const tenantId = getTenantId(req);
        return this.landlordsService.findAll(tenantId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.landlordsService.findOne(id, tenantId);
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateLandlordDto: Prisma.LandlordUpdateInput,
        @Request() req,
    ) {
        const tenantId = getTenantId(req);
        return this.landlordsService.update(id, updateLandlordDto, tenantId);
    }

    @Delete(':id')
    remove(@Param('id') id: string, @Request() req) {
        const tenantId = getTenantId(req);
        return this.landlordsService.remove(id, tenantId);
    }
}
