import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  calculateDeposit,
  type DeductionLike,
} from '../moveouts/agreement-deposit';
import {
  DEPOSIT_BASIS,
  computeDepositAmount,
  validateDepositRule,
} from './deposit-rule';
import { depositInvoiceStates } from './deposit-state';

/**
 * Where a deposit stands.
 *
 * - `HELD` — taken and still in the company's hands, with nothing claimed against it.
 * - `PART_DEDUCTED` — deductions have been recorded against it but the deposit has
 *   not been settled yet.
 * - `DEDUCTED` — the deductions use the whole deposit up and nothing goes back.
 * - `REFUNDED` — the refund was paid out; what stayed behind is the deductions.
 * - `WAIVED` — the owner let this resident off it, on the record.
 */
export type DepositDisposition =
  | 'HELD'
  | 'PART_DEDUCTED'
  | 'DEDUCTED'
  | 'REFUNDED'
  | 'WAIVED';

export interface DepositFilters {
  /** Disposition filter — one of `DepositDisposition`. */
  status?: string;
  propertyId?: string;
}

export interface DepositSummaryLine {
  currency: string;
  /** Deposits taken across the register. */
  deposits: number;
  /** Money actually paid back to tenants. */
  refunded: number;
  /** Deductions recorded against deposits. */
  deductions: number;
  /** What the company still holds: a settled deposit keeps only its deductions. */
  netHeld: number;
  /** How much has actually been received against the billed deposits. */
  received: number;
  count: number;
}

export interface SecurityDepositRow {
  agreementId: string;
  agreementCode: string;
  agreementStatus: string;
  agreementType: string;
  startDate: string;
  endDate: string | null;
  currency: string;
  rentAmount: number;
  /**
   * What the property's rule said this deposit should be.
   *
   * Three different numbers, and the register shows all three because they
   * answer three different questions: what the owner requires, what this
   * resident agreed to, and what actually turned up.
   */
  requiredAmount: number | null;
  /** The deposit the agreement says was taken. */
  depositAmount: number;
  /** What has actually been received against the deposit invoice. */
  receivedAmount: number;
  /** The deposit invoice the deposit was billed on. */
  invoiceId: string | null;
  invoiceNumber: string | null;
  /** Whether the deposit was waived, and why. */
  waived: boolean;
  waiverReason: string | null;
  tenant: {
    id: string;
    code: string;
    name: string;
    accountNumber: string;
  };
  property: { id: string; name: string; code: string } | null;
  unit: { id: string; name: string; code: string } | null;
  /** The kind of unit, which is what the rule hangs off. */
  unitType: { id: string; code: string; name: string } | null;
  disposition: DepositDisposition;
  /** Deductions recorded against this deposit. */
  deductionsTotal: number;
  /** Rent still unpaid on the agreement, which comes off the deposit first. */
  unpaidRent: number;
  /** What goes back if the deposit is settled now — derived, never typed. */
  refundDue: number;
  /** The excess the deductions and arrears run past the deposit. */
  carriedForward: number;
  /** The refund actually paid out, once it has been. */
  refundedAmount: number;
  /** What the company still holds on this deposit. */
  netHeld: number;
  moveOut: {
    id: string;
    status: string;
    moveoutDate: string;
    deductionsTotal: number;
    refunded: boolean;
    refundedAmount: number | null;
    refundedAt: string | null;
  } | null;
}

/** A property's deposit rule, per kind of unit. */
export interface PropertyDepositPolicy {
  id: string;
  propertyId: string;
  propertyName: string;
  unitTypeId: string;
  unitTypeCode: string;
  unitTypeName: string;
  /** The deposit. */
  amount: number;
  /** FIXED or RENT_MONTHS. */
  basis: string;
  /** How many months of rent, when the basis is RENT_MONTHS. */
  months: number | null;
  /** How many units of this type the property has. */
  unitCount: number;
}

/**
 * The security-deposit register.
 *
 * A deposit is not a row of its own: it is the `securityDeposit` on an agreement,
 * and what has happened to the money is the move-out's deduction list and the
 * refund it carries. So this screen is **derived**, never a second copy of the
 * facts — the arithmetic is `calculateDeposit`, the same function the move-out
 * screen uses to work out the refund, so the two screens can never disagree
 * about the same deposit.
 */
@Injectable()
export class SecurityDepositsService {
  constructor(private prisma: PrismaService) {}

  /**
   * The register: one row per tenancy that carries a deposit.
   *
   * Rows are derived before they are filtered and paginated, because the
   * disposition of a deposit is not a column anywhere — it is a fact about the
   * move-out, the deductions and the refund — and a filter on a derived value
   * cannot be pushed into the database.
   */
  async findAll(
    tenantId: string,
    params?: { page?: number; limit?: number; search?: string },
    filters?: DepositFilters,
  ) {
    const page = Math.max(1, params?.page ?? 1);
    const limit = Math.max(1, Math.min(100, params?.limit ?? 20));
    const search = params?.search?.trim();

    const where: Prisma.AgreementWhereInput = {
      // The same scoping the lease screen uses: an agreement with no
      // organization set is still a real agreement in this estate.
      OR: [{ organizationId: tenantId }, { organizationId: null }],
      securityDeposit: { not: null },
    };

    if (filters?.propertyId) {
      where.unit = { propertyId: filters.propertyId };
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            {
              tenant: {
                is: {
                  OR: [
                    { surname: { contains: search, mode: 'insensitive' } },
                    { otherNames: { contains: search, mode: 'insensitive' } },
                    { code: { contains: search, mode: 'insensitive' } },
                    {
                      accountNumber: { contains: search, mode: 'insensitive' },
                    },
                  ],
                },
              },
            },
            {
              unit: { is: { name: { contains: search, mode: 'insensitive' } } },
            },
            {
              unit: {
                is: {
                  property: {
                    is: { name: { contains: search, mode: 'insensitive' } },
                  },
                },
              },
            },
          ],
        },
      ];
    }

    const agreements = await this.prisma.agreement.findMany({
      where,
      orderBy: { startDate: 'desc' },
      include: {
        tenant: {
          select: {
            id: true,
            code: true,
            surname: true,
            otherNames: true,
            accountNumber: true,
          },
        },
        unit: {
          select: {
            id: true,
            name: true,
            code: true,
            property: { select: { id: true, name: true, code: true } },
            unitType: { select: { id: true, code: true, name: true } },
          },
        },
        moveOutRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            deductions: {
              select: { category: true, description: true, amount: true },
            },
          },
        },
      },
    });

    const unpaidRentByAgreement = await this.unpaidRentByAgreement(
      agreements.map((agreement) => agreement.id),
    );

    // What has actually been received against each deposit, and whether it is
    // paid up. The renewal chain is walked in one pass, because a renewed
    // tenancy keeps the money its predecessor took.
    const invoiceStates = await depositInvoiceStates(
      this.prisma,
      agreements.map((agreement) => agreement.id),
    );

    let rows: SecurityDepositRow[] = agreements
      .map((agreement) =>
        this.toRow(
          agreement,
          unpaidRentByAgreement.get(agreement.id) ?? 0,
          invoiceStates.get(agreement.id),
        ),
      )
      .filter((row) => row.depositAmount > 0 || row.waived);

    if (filters?.status) {
      const wanted = filters.status.toUpperCase();
      rows = rows.filter((row) => row.disposition === wanted);
    }

    const total = rows.length;
    const start = (page - 1) * limit;
    const data = rows.slice(start, start + limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      summary: this.summary(rows),
    };
  }

  /**
   * The deposit rules, per kind of unit.
   *
   * A property says what a deposit is for each of its kinds of unit — one
   * month's rent for the 1B, two months for the 3B, nothing at all for the
   * studio — and this is the other half of the register: the rule on one side,
   * what was actually taken on the other.
   */
  async findPolicies(tenantId: string): Promise<PropertyDepositPolicy[]> {
    const rows = await this.prisma.propertyDepositRule.findMany({
      where: {
        unitType: {
          property: {
            OR: [{ organizationId: tenantId }, { organizationId: null }],
          },
        },
      },
      orderBy: [
        { unitType: { property: { name: 'asc' } } },
        { unitType: { code: 'asc' } },
      ],
      include: {
        unitType: {
          select: {
            id: true,
            code: true,
            name: true,
            property: { select: { id: true, name: true } },
            _count: { select: { units: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      propertyId: row.unitType.property.id,
      propertyName: row.unitType.property.name,
      unitTypeId: row.unitType.id,
      unitTypeCode: row.unitType.code,
      unitTypeName: row.unitType.name,
      amount: Number(row.amount),
      basis: row.basis,
      months: row.months === null ? null : Number(row.months),
      unitCount: row.unitType._count.units,
    }));
  }

  /**
   * The rule that applies to a unit, and what it works out to.
   *
   * This is what the agreement screen asks before anybody types a deposit: it
   * either has an answer, or it says that nobody has decided — and those two
   * are not the same thing.
   */
  async ruleForUnit(
    unitId: string,
    rentAmount?: number | null,
    tenantId?: string,
  ) {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
      },
      select: {
        id: true,
        baseRent: true,
        currency: true,
        unitType: {
          select: {
            id: true,
            code: true,
            name: true,
            depositRule: {
              select: { id: true, amount: true, basis: true, months: true },
            },
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found.');
    }

    const rule = unit.unitType?.depositRule ?? null;
    const rent = rentAmount ?? Number(unit.baseRent ?? 0);

    return {
      unitId: unit.id,
      unitTypeId: unit.unitType?.id ?? null,
      unitTypeCode: unit.unitType?.code ?? null,
      unitTypeName: unit.unitType?.name ?? null,
      /** False when nobody has set a rule for this kind of unit yet. */
      decided: Boolean(rule),
      rule: rule
        ? {
            id: rule.id,
            amount: Number(rule.amount),
            basis: rule.basis,
            months: rule.months === null ? null : Number(rule.months),
          }
        : null,
      amount: computeDepositAmount(
        rule
          ? {
              amount: Number(rule.amount),
              basis: rule.basis,
              months: rule.months === null ? null : Number(rule.months),
            }
          : null,
        rent,
      ),
    };
  }

  /**
   * Set the deposit rule for a kind of unit.
   *
   * A rule of zero is stored as a rule of zero — that is "this kind of unit
   * takes no deposit", said on the record. Clearing the rule is a different
   * thing: it is "nobody has decided", and the agreement screen says so.
   */
  async setRule(
    unitTypeId: string,
    input: {
      amount?: number | null;
      basis?: string | null;
      months?: number | null;
    },
    tenantId?: string,
  ) {
    const unitType = await this.prisma.propertyUnitType.findFirst({
      where: {
        id: unitTypeId,
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
      },
      select: { id: true },
    });
    if (!unitType) {
      throw new NotFoundException('Unit type not found.');
    }

    const check = validateDepositRule(input);
    if (!check.valid) {
      throw new BadRequestException(check.reason);
    }

    const basis = (input.basis ?? DEPOSIT_BASIS.FIXED).toUpperCase();
    const data =
      basis === DEPOSIT_BASIS.RENT_MONTHS
        ? {
            amount: 0,
            basis,
            months: Number(input.months ?? 0),
          }
        : {
            amount: Number(input.amount ?? 0),
            basis,
            months: null,
          };

    const rule = await this.prisma.propertyDepositRule.upsert({
      where: { unitTypeId },
      create: { unitTypeId, ...data },
      update: data,
      select: { id: true, amount: true, basis: true, months: true },
    });

    return {
      id: rule.id,
      unitTypeId,
      amount: Number(rule.amount),
      basis: rule.basis,
      months: rule.months === null ? null : Number(rule.months),
    };
  }

  /**
   * Take the rule away, which puts the kind of unit back to "nobody has
   * decided" rather than "no deposit".
   */
  async clearRule(unitTypeId: string, tenantId?: string) {
    const unitType = await this.prisma.propertyUnitType.findFirst({
      where: {
        id: unitTypeId,
        ...(tenantId ? { property: { organizationId: tenantId } } : {}),
      },
      select: { id: true },
    });
    if (!unitType) {
      throw new NotFoundException('Unit type not found.');
    }

    await this.prisma.propertyDepositRule.deleteMany({ where: { unitTypeId } });
    return { unitTypeId, cleared: true };
  }

  // ---------------------------------------------------------------- helpers

  /**
   * Rent still unpaid per agreement, measured from the recorded payments.
   *
   * Finance never reconciles `Invoice.balanceAmount` (master doc issue 41), so
   * the move-out screen measures it this way and this screen must measure it
   * the same way — otherwise the two would quote different refunds.
   */
  private async unpaidRentByAgreement(
    agreementIds: string[],
  ): Promise<Map<string, number>> {
    const unpaid = new Map<string, number>();
    if (agreementIds.length === 0) return unpaid;

    const invoices = await this.prisma.invoice.findMany({
      where: { agreementId: { in: agreementIds } },
      include: { payments: { select: { amount: true } } },
    });

    for (const invoice of invoices) {
      if (!invoice.agreementId) continue;
      const paid = invoice.payments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      );
      const outstanding = Math.max(Number(invoice.amount) - paid, 0);
      unpaid.set(
        invoice.agreementId,
        round2((unpaid.get(invoice.agreementId) ?? 0) + outstanding),
      );
    }

    return unpaid;
  }

  /** One agreement's deposit, worked out against its move-out and its arrears. */
  private toRow(
    agreement: {
      id: string;
      code: string;
      status: string;
      agreementType: string;
      startDate: Date;
      endDate: Date | null;
      currency: string;
      rentAmount: Prisma.Decimal;
      securityDeposit: Prisma.Decimal | null;
      depositRuleAmount: Prisma.Decimal | null;
      depositWaived: boolean;
      depositWaiverReason: string | null;
      depositRefunded: boolean;
      tenant: {
        id: string;
        code: string;
        surname: string;
        otherNames: string | null;
        accountNumber: string;
      };
      unit: {
        id: string;
        name: string;
        code: string;
        property: { id: string; name: string; code: string } | null;
        unitType: { id: string; code: string; name: string } | null;
      } | null;
      moveOutRequests: Array<{
        id: string;
        status: string;
        moveoutDate: Date;
        depositRefunded: boolean;
        depositRefundAmount: Prisma.Decimal | null;
        refundedAt: Date | null;
        deductions: Array<{
          category: DeductionLike['category'];
          description: string;
          amount: Prisma.Decimal;
        }>;
      }>;
    },
    unpaidRent: number,
    invoice?: {
      invoiceId: string | null;
      invoiceNumber: string | null;
      received: number;
    },
  ): SecurityDepositRow {
    const depositAmount = Number(agreement.securityDeposit ?? 0);
    const moveOut = agreement.moveOutRequests[0] ?? null;
    const waived = agreement.depositWaived;

    const deductions: DeductionLike[] = (moveOut?.deductions ?? []).map(
      (deduction) => ({
        category: deduction.category,
        description: deduction.description,
        amount: Number(deduction.amount),
      }),
    );

    const breakdown = calculateDeposit({
      securityDeposit: depositAmount,
      deductions,
      unpaidRent,
    });

    const refunded =
      agreement.depositRefunded || moveOut?.depositRefunded === true;
    const refundedAmount = refunded
      ? Number(moveOut?.depositRefundAmount ?? 0)
      : 0;

    return {
      agreementId: agreement.id,
      agreementCode: agreement.code,
      agreementStatus: agreement.status,
      agreementType: agreement.agreementType,
      startDate: agreement.startDate.toISOString(),
      endDate: agreement.endDate ? agreement.endDate.toISOString() : null,
      currency: agreement.currency,
      rentAmount: Number(agreement.rentAmount),
      requiredAmount:
        agreement.depositRuleAmount === null
          ? null
          : Number(agreement.depositRuleAmount),
      depositAmount,
      receivedAmount: invoice?.received ?? 0,
      invoiceId: invoice?.invoiceId ?? null,
      invoiceNumber: invoice?.invoiceNumber ?? null,
      waived,
      waiverReason: agreement.depositWaiverReason,
      tenant: {
        id: agreement.tenant.id,
        code: agreement.tenant.code,
        name: `${agreement.tenant.surname} ${agreement.tenant.otherNames ?? ''}`.trim(),
        accountNumber: agreement.tenant.accountNumber,
      },
      property: agreement.unit?.property ?? null,
      unit: agreement.unit
        ? {
            id: agreement.unit.id,
            name: agreement.unit.name,
            code: agreement.unit.code,
          }
        : null,
      unitType: agreement.unit?.unitType ?? null,
      disposition: waived
        ? 'WAIVED'
        : dispositionOf({
            depositAmount,
            deductionsTotal: breakdown.deductionsTotal,
            refunded,
            settled: moveOut?.status === 'COMPLETED',
          }),
      deductionsTotal: breakdown.deductionsTotal,
      unpaidRent: breakdown.unpaidRent,
      refundDue: breakdown.refund,
      carriedForward: breakdown.carriedForward,
      refundedAmount,
      netHeld: refunded
        ? round2(depositAmount - refundedAmount)
        : depositAmount,
      moveOut: moveOut
        ? {
            id: moveOut.id,
            status: moveOut.status,
            moveoutDate: moveOut.moveoutDate.toISOString(),
            deductionsTotal: breakdown.deductionsTotal,
            refunded: refunded,
            refundedAmount: refunded ? refundedAmount : null,
            refundedAt: moveOut.refundedAt
              ? moveOut.refundedAt.toISOString()
              : null,
          }
        : null,
    };
  }

  /**
   * The register's totals, one line per currency.
   *
   * Per currency rather than one grand total, because a deposit is money and
   * adding KES to USD is a number nobody can act on.
   */
  private summary(rows: SecurityDepositRow[]): DepositSummaryLine[] {
    const lines = new Map<string, DepositSummaryLine>();

    for (const row of rows) {
      const line = lines.get(row.currency) ?? {
        currency: row.currency,
        deposits: 0,
        refunded: 0,
        deductions: 0,
        netHeld: 0,
        received: 0,
        count: 0,
      };
      line.deposits = round2(line.deposits + row.depositAmount);
      line.refunded = round2(line.refunded + row.refundedAmount);
      line.deductions = round2(line.deductions + row.deductionsTotal);
      line.netHeld = round2(line.netHeld + row.netHeld);
      line.received = round2(line.received + row.receivedAmount);
      line.count += 1;
      lines.set(row.currency, line);
    }

    return Array.from(lines.values()).sort((a, b) =>
      a.currency.localeCompare(b.currency),
    );
  }
}

/**
 * Where the money stands.
 *
 * A deduction that has been recorded but not settled is a *claim* on the
 * deposit, not money already spent — so an approved-but-unpaid move-out reads
 * as `PART_DEDUCTED` and only a settled one can be `DEDUCTED`.
 */
function dispositionOf(input: {
  depositAmount: number;
  deductionsTotal: number;
  refunded: boolean;
  settled: boolean;
}): DepositDisposition {
  if (input.refunded) return 'REFUNDED';
  if (input.deductionsTotal <= 0) return 'HELD';
  if (input.settled && input.deductionsTotal >= input.depositAmount) {
    return 'DEDUCTED';
  }
  return 'PART_DEDUCTED';
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
