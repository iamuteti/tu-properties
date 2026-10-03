import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { assertTenantRecord, requireRecord } from '@/common/utils';
import { FILE_STORAGE, FileStorage } from './storage/file-storage.interface';
import { Readable } from 'stream';

export interface DocumentListParams {
  entityType?: string;
  entityId?: string;
  page?: number;
  limit?: number;
}

export interface DocumentListItem {
  id: string;
  organizationId: string;
  entityType: string;
  entityId: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  uploadedById: string;
  createdAt: Date;
  updatedAt: Date;
  uploadedBy: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.oasis.opendocument',
  'text/',
  'application/json',
  'application/zip',
  'application/x-zip',
];

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return base.slice(-80);
}

/**
 * Document Center service (Module 1: Core Platform).
 *
 * Polymorphic attachments: (entityType, entityId) point at any tenant
 * entity. Re-uploading the same file name for the same entity increments
 * `version` instead of overwriting, so document history is preserved.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    @Inject(FILE_STORAGE) private storage: FileStorage,
  ) {}

  async upload(
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
    entityType: string,
    entityId: string,
    uploadedById: string,
    organizationId: string,
  ) {
    if (!entityType || !entityId) {
      throw new BadRequestException('entityType and entityId are required');
    }
    if (!isAllowedMime(file.mimetype)) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    const fileName = file.originalname || 'unnamed';
    const latest = await this.prisma.document.findFirst({
      where: { organizationId, entityType, entityId, fileName },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    const key = `${organizationId}/${entityType}/${entityId}/${Date.now()}-v${version}-${sanitizeFileName(fileName)}`;
    await this.storage.save(key, file.buffer, file.mimetype);

    return this.prisma.document.create({
      data: {
        organizationId,
        entityType,
        entityId,
        fileName,
        fileUrl: key,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        version,
        uploadedById,
      },
      include: {
        uploadedBy: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
    });
  }

  async findAll(
    organizationId?: string,
    params?: DocumentListParams,
  ): Promise<{
    data: DocumentListItem[];
    meta: { total: number; page: number; limit: number; totalPages: number };
  }> {
    const page = params?.page ?? 1;
    const limit = Math.min(params?.limit ?? 20, 200);
    const where: Prisma.DocumentWhereInput = {
      ...(organizationId ? { organizationId } : {}),
      ...(params?.entityType ? { entityType: params.entityType } : {}),
      ...(params?.entityId ? { entityId: params.entityId } : {}),
    };

    const [data, total] = await this.prisma.$transaction(async (tx) =>
      Promise.all([
        tx.document.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          include: {
            uploadedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
        tx.document.count({ where }),
      ]),
    );

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, organizationId?: string) {
    const where: Prisma.DocumentWhereInput = {
      id,
      ...(organizationId ? { organizationId } : {}),
    };
    return requireRecord(
      this.prisma.document.findFirst({
        where,
        include: {
          uploadedBy: {
            select: { id: true, email: true, firstName: true, lastName: true },
          },
        },
      }),
      'Document',
    );
  }

  /** Open the stored file for a document (tenant-scoped). */
  async openStream(
    id: string,
    organizationId?: string,
  ): Promise<{ stream: Readable; mimeType: string; fileName: string }> {
    const doc = await this.findOne(id, organizationId);
    const stream = await this.storage.openStream(doc.fileUrl);
    return { stream, mimeType: doc.mimeType, fileName: doc.fileName };
  }

  async remove(id: string, organizationId?: string) {
    if (organizationId) {
      await assertTenantRecord(this.prisma.document, {
        id,
        organizationId,
      });
    }
    const doc = await this.prisma.document.findUnique({ where: { id } });
    await this.prisma.document.delete({ where: { id } });
    // Best-effort: a storage delete failure must not break the API call.
    if (doc) {
      await this.storage.remove(doc.fileUrl).catch(() => undefined);
    }
    return { deleted: true };
  }
}
