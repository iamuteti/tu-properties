import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { TicketStatus, UserRole } from '@prisma/client';
import { getUserId } from '@/common/utils';
import { SupportTicketsService, TicketActor } from './support-tickets.service';
import { SetTicketStatusDto } from './dto/support-ticket.dto';

/**
 * Platform-side support tickets (Module 19 Phase C).
 *
 * The answering half of `SupportTicketsController`: class-level
 * `@Roles(SUPER_ADMIN)`, structurally separate from the tenant endpoints per
 * the master doc's §2 rule. Status moves and resolutions happen here; the
 * tenant side may only close its own tickets.
 */
@Controller('platform/support-tickets')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN)
export class PlatformSupportController {
  constructor(private readonly tickets: SupportTicketsService) {}

  private actor(req: any): TicketActor {
    return { userId: getUserId(req)!, role: req.user?.role };
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

  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetTicketStatusDto,
    @Request() req: any,
  ) {
    return this.tickets.setStatus(id, dto, this.actor(req));
  }
}
