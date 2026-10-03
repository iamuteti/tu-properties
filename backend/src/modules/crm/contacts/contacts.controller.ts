import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { requireTenantId, getUserId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { ContactsService, type ContactFilters } from './contacts.service';
import type { PaginationParams } from '../leads/leads.service';
import {
  CreateCommunicationDto,
  CreateContactDto,
  UpdateContactDto,
} from './dto/contact.dto';

@UseGuards(JwtAuthGuard)
@Controller('crm/contacts')
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_contacts.create')
  create(@Body() dto: CreateContactDto, @Request() req) {
    return this.contactsService.create(dto, requireTenantId(req));
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('type') type?: string,
    @Query('engaged') engaged?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: ContactFilters = {
      type,
      engaged: engaged === 'true',
    };
    return this.contactsService.findAll(requireTenantId(req), params, filters);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="contacts.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('type') type?: string,
  ) {
    const csv = await this.contactsService.exportCsv(
      requireTenantId(req),
      { type },
      search,
    );
    res.send(csv);
  }

  /** Communication log across every contact — used by the CRM timeline view. */
  @Get('communications')
  listCommunications(
    @Request() req,
    @Query('leadId') leadId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contactsService.listCommunications(requireTenantId(req), {
      leadId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('communications')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_contacts.update')
  logCommunication(@Body() dto: CreateCommunicationDto, @Request() req) {
    return this.contactsService.logCommunication(
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Delete('communications/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_contacts.update')
  removeCommunication(@Param('id') id: string, @Request() req) {
    return this.contactsService.removeCommunication(id, requireTenantId(req));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.contactsService.findOne(id, requireTenantId(req));
  }

  /** The contact's communication timeline, newest first. */
  @Get(':id/timeline')
  timeline(@Param('id') id: string, @Request() req) {
    return this.contactsService.timeline(id, requireTenantId(req));
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_contacts.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @Request() req,
  ) {
    return this.contactsService.update(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('crm_contacts.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.contactsService.remove(id, requireTenantId(req));
  }
}
