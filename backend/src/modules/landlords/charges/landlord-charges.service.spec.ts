import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ChargeCategory } from '@prisma/client';
import { LandlordChargesService } from './landlord-charges.service';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Charge rules worth pinning:
 *   1. a charge belongs to a landlord in this tenant, on one of their properties,
 *   2. a charge already on an issued statement is frozen — no edits, no deletes,
 *   3. an unattributed charge is allowed (company-level cost).
 */
describe('LandlordChargesService', () => {
  let service: LandlordChargesService;
  let prisma: ReturnType<typeof mockPrisma>;

  function mockPrisma() {
    return {
      landlordCharge: {
        create: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'chg-1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'chg-1',
          ownerStatementId: null,
        }),
        count: jest.fn().mockResolvedValue(0),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) => ({ id: 'chg-1', ...data })),
        delete: jest.fn().mockResolvedValue({ id: 'chg-1' }),
      },
      landlord: {
        findFirst: jest.fn().mockResolvedValue({ id: 'land-1' }),
      },
      property: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'prop-1',
          landlordId: 'land-1',
          name: 'Tolo Towers',
        }),
      },
      $transaction: jest.fn(async (fn: any) =>
        typeof fn === 'function'
          ? fn({
              landlordCharge: {
                findMany: jest.fn().mockResolvedValue([]),
                count: jest.fn().mockResolvedValue(0),
              },
            })
          : fn,
      ),
    };
  }

  beforeEach(async () => {
    prisma = mockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LandlordChargesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(LandlordChargesService);
  });

  it('records a charge against the landlord and property', async () => {
    await service.create(
      {
        landlordId: 'land-1',
        propertyId: 'prop-1',
        category: ChargeCategory.REPAIR,
        description: 'Burst pipe in unit 4B',
        amount: 7_500,
        chargeDate: '2026-09-08',
      },
      'org-1',
      'user-1',
    );

    const data = prisma.landlordCharge.create.mock.calls[0][0].data;
    expect(data.organizationId).toBe('org-1');
    expect(data.amount).toBe(7_500);
    expect(data.chargeDate).toEqual(new Date('2026-09-08'));
    expect(data.createdBy).toBe('user-1');
  });

  it('refuses a charge against another landlord’s property', async () => {
    prisma.property.findFirst.mockResolvedValue({
      id: 'prop-2',
      landlordId: 'land-2',
      name: 'Karen Court',
    });

    await expect(
      service.create(
        {
          landlordId: 'land-1',
          propertyId: 'prop-2',
          category: ChargeCategory.REPAIR,
          description: 'Wrong landlord',
          amount: 1_000,
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a charge for a landlord in another tenant', async () => {
    prisma.landlord.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        {
          landlordId: 'land-x',
          category: ChargeCategory.REPAIR,
          description: 'Not ours',
          amount: 1_000,
        },
        'org-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to edit a charge that is already on an issued statement', async () => {
    prisma.landlordCharge.findFirst.mockResolvedValue({
      id: 'chg-1',
      ownerStatementId: 'stm-1',
    });

    await expect(
      service.update('chg-1', { amount: 1_000 }, 'org-1'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.landlordCharge.update).not.toHaveBeenCalled();
  });

  it('refuses to delete a charge that is already on an issued statement', async () => {
    prisma.landlordCharge.findFirst.mockResolvedValue({
      id: 'chg-1',
      ownerStatementId: 'stm-1',
    });

    await expect(service.remove('chg-1', 'org-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.landlordCharge.delete).not.toHaveBeenCalled();
  });

  it('deletes an unattributed charge', async () => {
    await service.remove('chg-1', 'org-1');

    expect(prisma.landlordCharge.delete).toHaveBeenCalledWith({
      where: { id: 'chg-1' },
    });
  });

  it('404s a charge belonging to another tenant', async () => {
    prisma.landlordCharge.findFirst.mockResolvedValue(null);

    await expect(service.findOne('chg-x', 'org-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
