import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { UsersService } from '@/modules/users/users.service';
import { assertTenantRecord, requireRecord } from '@/common/utils';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  /**
   * Record a payment.
   *
   * The controller receives the flat shape the UI sends (`invoiceId`,
   * `rentalAgreementId`, `receiptId`) while Prisma needs either all scalar FKs
   * *or* all nested relation writes — mixing them is rejected. Since we also
   * connect `organization` as a relation, the parent links are converted to
   * nested writes here; before this, paying an invoice by `invoiceId` always
   * failed with "Unknown argument `invoiceId`".
   */
  async create(
    data: Prisma.PaymentCreateInput & {
      recordedBy?: string;
      invoiceId?: string | null;
      rentalAgreementId?: string | null;
      receiptId?: string | null;
    },
    tenantId?: string,
  ) {
    const { invoiceId, rentalAgreementId, receiptId, ...rest } = data;
    // `recordedBy` is the UI's display name, not a column.
    delete (rest as { recordedBy?: string }).recordedBy;

    const paymentData = {
      ...rest,
      ...(invoiceId ? { invoice: { connect: { id: invoiceId } } } : {}),
      ...(rentalAgreementId
        ? { rentalAgreement: { connect: { id: rentalAgreementId } } }
        : {}),
      ...(receiptId ? { receipt: { connect: { id: receiptId } } } : {}),
    } as Prisma.PaymentCreateInput;

    // Add tenant organization if provided
    if (tenantId) {
      paymentData.organization = { connect: { id: tenantId } };
    }

    return this.prisma.payment.create({ data: paymentData });
  }

  findAll(tenantId?: string) {
    const where = tenantId ? { organizationId: tenantId } : {};
    return this.prisma.payment.findMany({
      where,
      include: {
        invoice: true,
        rentalAgreement: true,
        receipt: true,
      },
    });
  }

  async findOne(id: string, tenantId?: string) {
    const where = tenantId ? { id, organizationId: tenantId } : { id };
    return requireRecord(
      this.prisma.payment.findFirst({
        where,
        include: {
          invoice: true,
          rentalAgreement: true,
          receipt: true,
        },
      }),
      'Payment',
    );
  }

  async delete(id: string, tenantId?: string) {
    if (tenantId) {
      await assertTenantRecord(this.prisma.payment, {
        id,
        organizationId: tenantId,
      });
    }
    return this.prisma.payment.delete({
      where: { id },
    });
  }

  async deleteMany(ids: string[], tenantId?: string) {
    const where = tenantId
      ? { id: { in: ids }, organizationId: tenantId }
      : { id: { in: ids } };
    const result = await this.prisma.payment.deleteMany({
      where,
    });
    return { deleted: result.count };
  }
}
