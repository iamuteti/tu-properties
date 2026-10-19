import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface TenantFilters {
  gender?: string;
  status?: string;
  agreementType?: string;
  propertyId?: string;
  withDeposit?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, tenantId?: string) {
    if (tenantId) {
      data.organization = { connect: { id: tenantId } };
    }

    // Generate unique account number and code
    const count = await this.prisma.tenant.count();
    const nextNumber = count + 1;
    const accountNumber = `TEN-${String(nextNumber).padStart(3, '0')}`;
    const code = `T${String(nextNumber).padStart(3, '0')}`;

    data.accountNumber = accountNumber;
    data.code = code;

    // Handle emergency contacts
    if (data.emergencyContacts) {
      data.emergencyContacts = {
        create: data.emergencyContacts
          .filter((contact: any) => contact.contactName)
          .map((contact: any, index: number) => ({
            ...contact,
            priority: index + 1,
          })),
      };
    }

    return this.prisma.tenant.create({
      data: data as Prisma.TenantCreateInput,
      include: {
        emergencyContacts: true,
      },
    });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: TenantFilters,
  ): Promise<PaginatedResult<any>> {
    const {
      page = 1,
      limit = 10,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = params || {};
    const skip = (page - 1) * limit;

    const where: any = tenantId ? { organizationId: tenantId } : {};

    if (search) {
      where.OR = [
        { surname: { contains: search, mode: 'insensitive' } },
        { otherNames: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const agreementType = filters?.agreementType || 'RENTAL';

    where.agreements = {
      some: {
        agreementType: agreementType,
      },
    };

    if (filters) {
      if (filters.status) where.status = filters.status;
      if (filters.gender) where.gender = filters.gender;
      if (filters.propertyId) {
        where.agreements = {
          ...where.agreements,
          some: {
            ...where.agreements.some,
            unit: {
              propertyId: filters.propertyId,
            },
          },
        };
      }
      if (filters.withDeposit !== undefined) {
        where.agreements = {
          ...where.agreements,
          some: {
            ...where.agreements.some,
            securityDeposit: filters.withDeposit
              ? { not: null }
              : { equals: null },
          },
        };
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.tenant.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            agreements: {
              include: {
                unit: {
                  include: {
                    property: true,
                  },
                },
                invoices: true,
              },
            },
          },
        }),
        tx.tenant.count({ where }),
      ]);

      // Format data to include agreement as single object instead of array
      const formattedData = data.map((tenant) => {
        const agreement =
          tenant.agreements?.sort(
            (a, b) =>
              new Date(b.startDate).getTime() - new Date(a.startDate).getTime(),
          )[0] || null;
        const lastPaidInvoice =
          agreement?.invoices
            ?.filter((inv) => inv.status === 'PAID')
            ?.sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )[0] || null;

        return {
          ...tenant,
          agreement,
          lastPaidInvoice,
        };
      });

      return {
        data: formattedData,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.tenant.findFirst({
        where,
        include: {
          agreements: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
              invoices: true,
              payments: true,
              inspections: true,
              tenantRequests: true,
              contracts: true,
              moveOutRequests: {
                orderBy: { moveoutDate: 'desc' },
              },
            },
            orderBy: { startDate: 'desc' },
          },
          emergencyContacts: {
            orderBy: { priority: 'asc' },
          },
          receipts: {
            orderBy: { recordingDate: 'desc' },
          },
          moveOutRequests: {
            include: {
              deductions: true,
            },
            orderBy: { moveoutDate: 'desc' },
          },
          credits: {
            orderBy: { createdAt: 'desc' },
          },
          creditNotes: {
            orderBy: { issueDate: 'desc' },
          },
          workOrders: {
            orderBy: { reportedAt: 'desc' },
          },
          facilityBookings: {
            orderBy: { startsAt: 'desc' },
          },
          accessCards: {
            orderBy: { issuedAt: 'desc' },
          },
          visitorVisits: {
            orderBy: { createdAt: 'desc' },
          },
          requests: {
            orderBy: { createdAt: 'desc' },
          },
          contact: true,
        },
      }),
      'Tenant',
    );
  }

  async update(id: string, data: Prisma.TenantUpdateInput, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.tenant, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.tenant.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.tenant, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.tenant.delete({ where: { id } });
  }
}
