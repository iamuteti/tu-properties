import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { getTenantId, getUserId } from '@/common/utils';
import {
  CreditNotesService,
  CreateCreditNoteInput,
} from './credit-notes.service';

@UseGuards(JwtAuthGuard)
@Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT)
@Controller('finance/credit-notes')
export class CreditNotesController {
  constructor(private readonly creditNotesService: CreditNotesService) {}

  @Get()
  @Permissions('credit_notes.view')
  findAll(@Request() req) {
    return this.creditNotesService.findAll(getTenantId(req));
  }

  @Get(':id')
  @Permissions('credit_notes.view')
  findOne(@Param('id') id: string, @Request() req) {
    return this.creditNotesService.findOne(id, getTenantId(req));
  }

  @Post()
  @Permissions('credit_notes.create')
  create(
    @Body() body: Omit<CreateCreditNoteInput, 'organizationId' | 'actorId'>,
    @Request() req,
  ) {
    return this.creditNotesService.create({
      ...body,
      organizationId: getTenantId(req),
      actorId: getUserId(req),
    });
  }

  @Post(':id/void')
  @Permissions('credit_notes.delete')
  void(
    @Param('id') id: string,
    @Body() body: { reason: string },
    @Request() req,
  ) {
    return this.creditNotesService.void(
      id,
      body.reason,
      getTenantId(req),
      getUserId(req),
    );
  }
}
