import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TicketStatus } from '@prisma/client';
import { getTenantId, getUserId } from '@/common/utils';
import { SupportTicketsService, TicketActor } from './support-tickets.service';
import {
  CreateSupportTicketDto,
  SetTicketStatusDto,
  UpdateSupportTicketDto,
} from './dto/support-ticket.dto';

/**
 * Tenant-facing support tickets (Module 19 Phase C).
 *
 * No `@Roles` — any authenticated user may raise and follow their own
 * organization's tickets (the dashboard pattern: no roles listed means every
 * role). Scoping is by the caller's organization, never by a client-supplied
 * id; SUPER_ADMIN (no tenant) sees the platform-wide view.
 */
@Controller('support-tickets')
@UseGuards(JwtAuthGuard)
export class SupportTicketsController {
  constructor(private readonly tickets: SupportTicketsService) {}

  private actor(req: any): TicketActor {
    return {
      userId: getUserId(req)!,
      role: req.user?.role,
      tenantId: getTenantId(req),
    };
  }

  @Post()
  create(@Body() dto: CreateSupportTicketDto, @Request() req: any) {
    return this.tickets.create(dto, this.actor(req));
  }

  @Get()
  findAll(
    @Request() req: any,
    @Query('status') status?: TicketStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.tickets.findAll(this.actor(req), {
      ...(status ? { status } : {}),
      ...(page ? { page: parseInt(page, 10) } : {}),
      ...(limit ? { limit: parseInt(limit, 10) } : {}),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: any) {
    return this.tickets.findOne(id, this.actor(req));
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupportTicketDto,
    @Request() req: any,
  ) {
    return this.tickets.update(id, dto, this.actor(req));
  }

  /** Close your own ticket (the only status move a tenant may make). */
  @Post(':id/close')
  close(@Param('id') id: string, @Request() req: any) {
    const dto = new SetTicketStatusDto();
    dto.status = TicketStatus.CLOSED;
    return this.tickets.setStatus(id, dto, this.actor(req));
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.tickets.remove(id, this.actor(req));
  }
}
