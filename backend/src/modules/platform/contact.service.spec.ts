import { Test, type TestingModule } from '@nestjs/testing';
import { ContactInquiryStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ContactService } from './contact.service';

/**
 * Module 19 — visitor contact.
 *
 * Two things pinned: the message is stored NEW (the queue's triage depends on
 * nothing else ever writing another status here), and the sender's email is
 * normalised — `Mail@Example.co.ke` and `mail@example.co.ke` are the same
 * mailbox, and a queue that treats them as two people misroutes the reply.
 */
describe('ContactService', () => {
  let service: ContactService;
  let prisma: {
    contactInquiry: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      contactInquiry: { create: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ContactService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ContactService);
  });

  it('stores the message NEW with a normalised email', async () => {
    prisma.contactInquiry.create.mockResolvedValue({ id: 'ci-1' });

    await service.create({
      name: '  Wanjiku Mwangi  ',
      email: 'Wanjiku@Example.CO.ke',
      subject: 'Multi-branch pricing',
      message:
        'We run three branches in Nairobi, can one subscription cover all?',
    });

    expect(prisma.contactInquiry.create).toHaveBeenCalledWith({
      data: {
        name: 'Wanjiku Mwangi',
        email: 'wanjiku@example.co.ke',
        subject: 'Multi-branch pricing',
        message:
          'We run three branches in Nairobi, can one subscription cover all?',
        status: ContactInquiryStatus.NEW,
      },
      select: { id: true, status: true, createdAt: true },
    });
  });

  it('lists newest first', async () => {
    prisma.contactInquiry.findMany.mockResolvedValue([]);

    await service.findAll();

    expect(prisma.contactInquiry.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });
});
