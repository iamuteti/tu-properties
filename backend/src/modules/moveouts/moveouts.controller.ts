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
  Query,
} from '@nestjs/common';
import { MoveoutsService, PaginationParams, MoveOutFilters } from './moveouts.service';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';

@UseGuards(JwtAuthGuard)
@Controller('moveouts')
export class MoveoutsController {
  constructor(private readonly moveoutsService: MoveoutsService) {}

  @Post()
  create(@Body() createMoveOutDto: Prisma.MoveOutRequestCreateInput, @Request() req) {
    const tenantId = getTenantId(req);
    return this.moveoutsService.create(createMoveOutDto, tenantId);
  }

  @Get()
  findAll(
    @Request() req,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
    @Query('status') status?: string,
  ) {
    const tenantId = getTenantId(req);
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: MoveOutFilters = {
      status,
    };
    return this.moveoutsService.findAll(tenantId, params, filters);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.moveoutsService.findOne(id, tenantId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMoveOutDto: Prisma.MoveOutRequestUpdateInput,
    @Request() req,
  ) {
    const tenantId = getTenantId(req);
    return this.moveoutsService.update(id, updateMoveOutDto, tenantId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req) {
    const tenantId = getTenantId(req);
    return this.moveoutsService.remove(id, tenantId);
  }
}