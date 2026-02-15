import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Prisma } from '@prisma/client';

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
    constructor(private readonly organizationsService: OrganizationsService) {}

    @Post()
    create(@Body() data: Prisma.OrganizationCreateInput) {
        return this.organizationsService.create(data);
    }

    @Get()
    findAll() {
        return this.organizationsService.findAll();
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.organizationsService.findOne(id);
    }

    @Get('slug/:slug')
    findBySlug(@Param('slug') slug: string) {
        return this.organizationsService.findBySlug(slug);
    }

    @Get('subdomain/:subdomain')
    findBySubdomain(@Param('subdomain') subdomain: string) {
        return this.organizationsService.findBySubdomain(subdomain);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() data: Prisma.OrganizationUpdateInput) {
        return this.organizationsService.update(id, data);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.organizationsService.remove(id);
    }

    @Get('check/slug/:slug')
    checkSlugAvailability(@Param('slug') slug: string) {
        return this.organizationsService.checkSlugAvailability(slug);
    }

    @Get('check/subdomain/:subdomain')
    checkSubdomainAvailability(@Param('subdomain') subdomain: string) {
        return this.organizationsService.checkSubdomainAvailability(subdomain);
    }
}
