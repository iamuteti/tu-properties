import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/decorators/rate-limit.decorator';
import { UserRole } from '@prisma/client';
import { ContactService } from './contact.service';
import { CreateContactInquiryDto } from './dto/contact-inquiry.dto';

/**
 * Visitor contact (Module 19) — the landing site's "Contact us" form.
 *
 * Same structural split as the trial signup: the single unauthenticated write
 * (`POST`, rate-limited — a mailbox that accepts unlimited mail is a spam
 * relay with extra steps) lives beside, never under, the SUPER_ADMIN-guarded
 * read. The queue (`GET`) carries the platform guard like every other
 * platform read, exactly once.
 */
@Controller('platform/contact')
export class PlatformContactController {
  constructor(private readonly contact: ContactService) {}

  @Post()
  @Public()
  @RateLimit({
    limit: 5,
    ttl: 60 * 60 * 1000,
    message: 'Too many messages from this address. Try again in an hour.',
  })
  @HttpCode(201)
  create(@Body() dto: CreateContactInquiryDto) {
    return this.contact.create(dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @Roles(UserRole.SUPER_ADMIN)
  findAll() {
    return this.contact.findAll();
  }
}
