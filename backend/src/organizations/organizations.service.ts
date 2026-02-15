import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class OrganizationsService {
    constructor(private prisma: PrismaService) {}

    async create(data: Prisma.OrganizationCreateInput) {
        return this.prisma.organization.create({ data });
    }

    async findAll() {
        return this.prisma.organization.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async findOne(id: string) {
        const organization = await this.prisma.organization.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        users: true,
                        properties: true,
                        tenants: true,
                    },
                },
            },
        });
        if (!organization) {
            throw new NotFoundException(`Organization with ID ${id} not found`);
        }
        return organization;
    }

    async findBySlug(slug: string) {
        return this.prisma.organization.findUnique({
            where: { slug },
        });
    }

    async findBySubdomain(subdomain: string) {
        return this.prisma.organization.findUnique({
            where: { subdomain },
        });
    }

    async findByCustomDomain(domain: string) {
        return this.prisma.organization.findUnique({
            where: { customDomain: domain },
        });
    }

    async update(id: string, data: Prisma.OrganizationUpdateInput) {
        await this.findOne(id); // Verify exists
        return this.prisma.organization.update({
            where: { id },
            data,
        });
    }

    async remove(id: string) {
        await this.findOne(id); // Verify exists
        return this.prisma.organization.delete({
            where: { id },
        });
    }

    async checkSlugAvailability(slug: string): Promise<boolean> {
        const existing = await this.prisma.organization.findUnique({
            where: { slug },
        });
        return !existing;
    }

    async checkSubdomainAvailability(subdomain: string): Promise<boolean> {
        const existing = await this.prisma.organization.findUnique({
            where: { subdomain },
        });
        return !existing;
    }
}
