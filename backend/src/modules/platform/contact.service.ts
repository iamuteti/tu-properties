import { Injectable } from '@nestjs/common';
import { ContactInquiryStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CreateContactInquiryDto } from './dto/contact-inquiry.dto';

/**
 * Visitor messages to the platform team (Module 19, landing site).
 *
 * Kept deliberately thin: store the message with status NEW and let an
 * operator work the queue. No auto-reply, no notification fan-out — a form
 * that claims "we'll be in touch shortly" while the message lands in a table
 * nobody reads is the dishonest version of this feature. The queue is read at
 * `GET /platform/contact` (SUPER_ADMIN); replying happens in the operator's
 * own mailbox until templates exist for it.
 */
@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateContactInquiryDto) {
    return this.prisma.contactInquiry.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        subject: dto.subject.trim(),
        message: dto.message.trim(),
        status: ContactInquiryStatus.NEW,
      },
      select: { id: true, status: true, createdAt: true },
    });
  }

  /** Newest first — an unread queue reads top-down. */
  findAll() {
    return this.prisma.contactInquiry.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
