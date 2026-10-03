import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { TenantPortalGuard } from '@/security/guards/tenant-portal.guard';
import { FILE_STORAGE, FileStorage } from '@/modules/documents/storage/file-storage.interface';
import { Inject } from '@nestjs/common';
import { PortalService } from './portal.service';

/**
 * Tenant self-service portal API.
 *
 * Read-only by design: a resident can see their lease, invoices, receipts and
 * documents, but nothing here can be written to. Changes (a new lease, a
 * renewal, a move-out request) stay staff actions so there is a record of who
 * agreed to what.
 *
 * Scope comes from the session, not the request — see `TenantPortalGuard`.
 */
@UseGuards(JwtAuthGuard, TenantPortalGuard)
@Controller('portal')
export class PortalController {
  constructor(
    private readonly portalService: PortalService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  @Get('me')
  me(@Req() req) {
    return this.portalService.me(req);
  }

  @Get('summary')
  summary(@Req() req) {
    return this.portalService.summary(req);
  }

  @Get('lease')
  lease(@Req() req) {
    return this.portalService.currentLease(req);
  }

  @Get('invoices')
  invoices(@Req() req) {
    return this.portalService.invoices(req);
  }

  @Get('receipts')
  receipts(@Req() req) {
    return this.portalService.receipts(req);
  }

  @Get('documents')
  documents(@Req() req) {
    return this.portalService.documents(req);
  }

  /**
   * Stream a document belonging to the signed-in tenant.
   *
   * The id is a path parameter, so it is checked against the session's tenant
   * before the storage driver is touched — otherwise a resident could iterate
   * ids and download another resident's file. The bytes come from the same
   * storage driver the Document Center uses, so there is no second copy of the
   * file-handling logic.
   */
  @Get('documents/:id/download')
  async downloadDocument(
    @Param('id') id: string,
    @Req() req,
    @Res() res: Response,
  ) {
    const document = await this.portalService.authorizeDocument(id, req);
    const stream = await this.storage.openStream(document.fileUrl);

    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.fileName)}"`,
    );
    stream.pipe(res);
  }
}