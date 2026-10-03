import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '@/common/utils';
import { Permissions } from '@/common/decorators/permissions.decorator';

/**
 * Document Center (Module 1: Core Platform).
 *
 * - POST /documents                 multipart upload (fields: entityType, entityId)
 * - GET  /documents                 list (filters: entityType, entityId, page, limit)
 * - GET  /documents/:id             metadata
 * - GET  /documents/:id/download    raw file stream
 * - DELETE /documents/:id           delete
 *
 * Everything is tenant-scoped; the acting user's organization is taken from
 * the session, never the client. Uploads are gated by `documents.create`,
 * deletes by `documents.delete`.
 */
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Permissions('documents.create')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile()
    file: Express.Multer.File | undefined,
    @Body() body: { entityType?: string; entityId?: string },
    @Req() req,
  ) {
    if (!file || !file.size) {
      throw new BadRequestException('No file uploaded (field: file)');
    }
    const organizationId = getTenantId(req);
    if (!organizationId) {
      throw new ForbiddenException(
        'Documents are tenant-scoped; this user has no organization',
      );
    }
    return this.documentsService.upload(
      file,
      body?.entityType ?? '',
      body?.entityId ?? '',
      req.user.userId,
      organizationId,
    );
  }

  @Get()
  findAll(
    @Req() req,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const organizationId = getTenantId(req);
    return this.documentsService.findAll(organizationId, {
      entityType,
      entityId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req) {
    return this.documentsService.findOne(id, getTenantId(req));
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Req() req, @Res() res: Response) {
    const { stream, mimeType, fileName } =
      await this.documentsService.openStream(id, getTenantId(req));
    res.setHeader('Content-Type', mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    stream.pipe(res);
  }

  @Delete(':id')
  @Permissions('documents.delete')
  remove(@Param('id') id: string, @Req() req) {
    return this.documentsService.remove(id, getTenantId(req));
  }
}
