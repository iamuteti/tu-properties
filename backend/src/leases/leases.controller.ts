import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { LeasesService } from './leases.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('leases')
export class LeasesController {
    constructor(private readonly leasesService: LeasesService) { }

    @Post()
    create(@Body() createLeaseDto: Prisma.LeaseCreateInput) {
        return this.leasesService.create(createLeaseDto);
    }

    @Get()
    findAll() {
        return this.leasesService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.leasesService.findOne(id);
    }

    @Patch(':id')
    update(@Param('id') id: string, @Body() updateLeaseDto: Prisma.LeaseUpdateInput) {
        return this.leasesService.update(id, updateLeaseDto);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.leasesService.remove(id);
    }
}
