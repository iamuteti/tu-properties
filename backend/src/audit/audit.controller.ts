import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('audit')
export class AuditController {
    constructor(private readonly auditService: AuditService) { }

    @Get('user/:userId')
    getLogsByUser(@Param('userId') userId: string) {
        return this.auditService.getLogsByUser(userId);
    }

    @Get('entity/:entity/:entityId')
    getLogsForEntity(@Param('entity') entity: string, @Param('entityId') entityId: string) {
        return this.auditService.getLogsForEntity(entity, entityId);
    }
}
