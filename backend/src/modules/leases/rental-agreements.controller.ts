import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RentalAgreementsService } from './rental-agreements.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('rental-agreements')
export class RentalAgreementsController {
  constructor(private readonly rentalAgreementsService: RentalAgreementsService) {}

  @Post()
  create(@Body() createRentalAgreementDto: Prisma.RentalAgreementCreateInput, @Request() req) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.create(createRentalAgreementDto, tenantId);
  }

  @Get()
  findAll(@Request() req) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateRentalAgreementDto: Prisma.RentalAgreementUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.update(id, updateRentalAgreementDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.rentalAgreementsService.remove(id, tenantId);
  }
}
