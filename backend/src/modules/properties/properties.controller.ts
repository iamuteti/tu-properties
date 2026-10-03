import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PropertiesService,
  PaginationParams,
  PropertyFilters,
} from './properties.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { UserRole } from '@prisma/client';
import { getTenantId } from '@/common/utils';
import { Roles } from '@/common/decorators/roles.decorator';
import { Permissions } from '@/common/decorators/permissions.decorator';
import {
  AmenityInputDto,
  CreatePropertyDto,
  ImportPropertiesDto,
  ReplaceAmenitiesDto,
  UpdatePropertyDto,
} from './dto/property.dto';

@UseGuards(JwtAuthGuard)
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('properties.create')
  create(@Body() createPropertyDto: CreatePropertyDto, @Request() req) {
    return this.propertiesService.create(createPropertyDto, getTenantId(req));
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
    @Query('category') category?: string,
    @Query('landlordId') landlordId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
    @Query('includeArchived') includeArchived?: string,
  ) {
    const params: PaginationParams = {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
      search,
      sortBy,
      sortOrder,
    };
    const filters: PropertyFilters = {
      type,
      category,
      landlordId,
      branchId,
      status,
      // Archived properties are hidden unless explicitly requested.
      includeArchived: includeArchived === 'true',
    };
    return this.propertiesService.findAll(getTenantId(req), params, filters);
  }

  /** Availability calendar feed: available units + upcoming lease endings. */
  @Get('availability')
  availability(
    @Request() req,
    @Query('propertyId') propertyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.propertiesService.availability(getTenantId(req), {
      propertyId,
      from: parseDateParam(from),
      to: parseDateParam(to),
    });
  }

  /** Tenant-wide occupancy rollup (VACANT/OCCUPIED/RESERVED/MAINTENANCE). */
  @Get('occupancy')
  occupancy(@Request() req) {
    return this.propertiesService.occupancySummary(getTenantId(req));
  }

  @Get('import-template')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="properties-import-template.csv"',
  )
  importTemplate() {
    return this.propertiesService.importTemplate();
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="properties.csv"')
  async export(
    @Request() req,
    @Res() res: Response,
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('category') category?: string,
    @Query('landlordId') landlordId?: string,
    @Query('branchId') branchId?: string,
    @Query('status') status?: string,
  ) {
    const csv = await this.propertiesService.exportCsv(
      getTenantId(req),
      { type, category, landlordId, branchId, status },
      search,
    );
    res.send(csv);
  }

  @Post('import')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('properties.create')
  import(@Body() body: ImportPropertiesDto, @Request() req) {
    return this.propertiesService.importCsv(body, getTenantId(req));
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req) {
    return this.propertiesService.findOne(id, getTenantId(req));
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('properties.update')
  update(
    @Param('id') id: string,
    @Body() updatePropertyDto: UpdatePropertyDto,
    @Request() req,
  ) {
    return this.propertiesService.update(
      id,
      updatePropertyDto,
      getTenantId(req),
    );
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('properties.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.propertiesService.remove(id, getTenantId(req));
  }

  // ---------------------------------------------------------------- amenities

  @Get(':id/amenities')
  listAmenities(@Param('id') id: string, @Request() req) {
    return this.propertiesService.listAmenities(id, getTenantId(req));
  }

  @Post(':id/amenities')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('properties.update')
  addAmenity(
    @Param('id') id: string,
    @Body() amenity: AmenityInputDto,
    @Request() req,
  ) {
    return this.propertiesService.addAmenity(id, amenity, getTenantId(req));
  }

  @Put(':id/amenities')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('properties.update')
  replaceAmenities(
    @Param('id') id: string,
    @Body() body: ReplaceAmenitiesDto,
    @Request() req,
  ) {
    return this.propertiesService.replaceAmenities(
      id,
      body.amenities,
      getTenantId(req),
    );
  }

  @Delete(':id/amenities/:amenityId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PROPERTY_MANAGER)
  @Permissions('properties.update')
  removeAmenity(
    @Param('id') id: string,
    @Param('amenityId') amenityId: string,
    @Request() req,
  ) {
    return this.propertiesService.removeAmenity(
      id,
      amenityId,
      getTenantId(req),
    );
  }
}

function parseDateParam(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
