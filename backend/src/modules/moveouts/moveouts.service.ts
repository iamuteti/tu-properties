import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface PaginationParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface MoveOutFilters {
  status?: string;
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
export class MoveoutsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, tenantId?: string) {
    if (tenantId) {
      data.organizationId = tenantId;
    }

    console.log('Data: ', data);
    return this.prisma.moveOutRequest.create({
      data: data as Prisma.MoveOutRequestCreateInput,
      include: {
        tenant: true,
        rentalAgreement: {
          include: {
            unit: {
              include: {
                property: true
              }
            }
          }
        }
      },
    });
  }

  findAll(
    tenantId?: string,
    params?: PaginationParams,
    filters?: MoveOutFilters,
  ): Promise<PaginatedResult<any>> {
    const { page = 1, limit = 10, search, sortBy = 'createdAt', sortOrder = 'desc' } = params || {};
    const skip = (page - 1) * limit;

    const where: any = tenantId ? { organizationId: tenantId } : {};

    if (search) {
      where.OR = [
        { tenant: {
          OR: [
            { surname: { contains: search, mode: 'insensitive' } },
            { otherNames: { contains: search, mode: 'insensitive' } },
            { accountNumber: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ]
        }},
      ];
    }

    if (filters) {
      if (filters.status) where.status = filters.status;
    }

    return this.prisma.$transaction(async (tx) => {
      const [data, total] = await Promise.all([
        tx.moveOutRequest.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            tenant: true,
            rentalAgreement: {
              include: {
                unit: {
                  include: {
                    property: true
                  }
                }
              }
            }
          },
        }),
        tx.moveOutRequest.count({ where }),
      ]);

      return {
        data,
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.moveOutRequest.findUnique({
      where,
      include: {
        tenant: true,
        rentalAgreement: {
          include: {
            unit: {
              include: {
                property: true
              }
            }
          }
        }
      },
    });
  }

  async update(id: string, data: Prisma.MoveOutRequestUpdateInput, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };

    // If approving, handle the move-out logic
    if (data.status === 'APPROVED') {
      const request = await this.prisma.moveOutRequest.findUnique({
        where: { id },
        include: {
          tenant: true,
          rentalAgreement: {
            include: {
              unit: {
                include: {
                  property: true
                }
              }
            }
          }
        }
      });

      if (request) {
        // Update tenant status to INACTIVE
        await this.prisma.tenant.update({
          where: { id: request.tenantId },
          data: { status: 'INACTIVE' }
        });

        // Update rental agreement status to TERMINATED and set terminatedAt to moveout date
        const terminatedAt = new Date(request.moveoutDate);

        await this.prisma.rentalAgreement.update({
          where: { id: request.rentalAgreementId },
          data: {
            status: 'TERMINATED',
            terminatedAt
          }
        });

        // If deposit was required and refunded, create a receipt
        if (request.rentalAgreement.securityDeposit && request.depositRefunded) {
          // Create receipt for deposit refund
          await this.prisma.receipt.create({
            data: {
              receiptId: `REF-${request.id}`,
              receiptType: 'CashReceipt',
              receiptCategory: 'Refund',
              receivedFrom: `${request.tenant.surname} ${request.tenant.otherNames || ''}`,
              paymentMethod: 'BANK_TRANSFER', // or whatever method
              amountReceived: request.depositRefundAmount || request.rentalAgreement.securityDeposit,
              notes: `Security deposit refund for move-out request ${request.id}`,
              tenantId: request.tenantId,
              landlordId: request.rentalAgreement.unit.property.landlordId,
              organizationId: tenantId,
              amountVatInclusive: true,
              currency: 'KES'
            }
          });

          // Update agreement depositRefunded
          await this.prisma.rentalAgreement.update({
            where: { id: request.rentalAgreementId },
            data: { depositRefunded: true }
          });
        }
      }
    }

    return this.prisma.moveOutRequest.update({
      where,
      data,
      include: {
        tenant: true,
        rentalAgreement: {
          include: {
            unit: {
              include: {
                property: true
              }
            }
          }
        }
      },
    });
  }

  remove(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return this.prisma.moveOutRequest.delete({ where });
  }
}