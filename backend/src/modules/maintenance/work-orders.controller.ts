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
import { TenantPortalGuard } from '@/security/guards/tenant-portal.guard';
import { getTenantId, getUserId, requireTenantId } from '@/common/utils';
import { Permissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
// Imported as **values**, not `import type`. This is master doc issue 52 exactly:
// a type-only import erases the class from `design:paramtypes`, Nest then sees
// `Object` as the metatype, decides there is nothing to validate, and hands the
// service a body whose nested `lines` were never transformed or checked.
import {
  IssueStockDto,
  ReturnStockDto,
} from '@/modules/inventory/dto/inventory.dto';
import { WorkOrdersService } from './work-orders.service';
import { WorkOrderApprovalsService } from './work-order-approvals.service';
import {
  AssignWorkOrderDto,
  BulkAssignWorkOrdersDto,
  CancelWorkOrderDto,
  CompleteWorkOrderDto,
  CreateWorkOrderDto,
  CreateWorkOrderTaskDto,
  InspectWorkOrderDto,
  ReassignWorkOrderDto,
  ReportIssueDto,
  UpdateWorkOrderDto,
  UpdateWorkOrderTaskDto,
} from './dto/maintenance.dto';

/** Who may run maintenance work, as opposed to read about it. */
const MAINTENANCE_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.PROPERTY_MANAGER,
  UserRole.MAINTENANCE_MANAGER,
  UserRole.TECHNICIAN,
];

const VIEW_ROLES = [
  ...MAINTENANCE_ROLES,
  UserRole.LEASING_OFFICER,
  UserRole.ACCOUNTANT,
];

/**
 * Module 9 — the staff side of maintenance.
 *
 * Reads need `work_orders.view`; everything that changes a work order needs
 * `work_orders.update` and a maintenance role. Status moves through the action
 * endpoints at the bottom — never through `PATCH /:id`, which has no status
 * field in its DTO — so every transition runs the state machine in
 * `work-order-lifecycle.ts` and is audited with an actor.
 */
@UseGuards(JwtAuthGuard)
@Controller('maintenance/work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly approvals: WorkOrderApprovalsService,
  ) {}

  @Get()
  @Roles(...VIEW_ROLES)
  @Permissions('work_orders.view')
  findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('priority') priority?: string,
    @Query('source') source?: string,
    @Query('propertyId') propertyId?: string,
    @Query('unitId') unitId?: string,
    @Query('tenantId') tenantId?: string,
    @Query('assetId') assetId?: string,
    @Query('technicianId') technicianId?: string,
    @Query('assigned') assigned?: string,
    @Query('open') open?: string,
    @Query('search') search?: string,
  ) {
    return this.workOrders.findAll(getTenantId(req), {
      status,
      category,
      priority,
      source,
      propertyId,
      unitId,
      tenantId,
      assetId,
      technicianId,
      assigned,
      open: open === 'true' || open === undefined ? undefined : true,
      search,
    });
  }

  @Get('stats')
  @Roles(...VIEW_ROLES)
  @Permissions('work_orders.view')
  stats(@Request() req) {
    return this.workOrders.stats(getTenantId(req));
  }

  @Get('technicians')
  @Roles(...VIEW_ROLES)
  @Permissions('work_orders.view')
  async technicians(@Request() req) {
    const organizationId = getTenantId(req);
    const [technicians, workload] = await Promise.all([
      this.workOrders.listTechnicians(organizationId),
      this.workOrders.technicianWorkload(organizationId),
    ]);

    // One list, not two: the picker shows the open-job count beside the name,
    // because assigning to whoever is already drowning is how the next
    // response window is missed.
    return technicians.map((technician) => ({
      ...technician,
      openWorkOrders:
        workload.find((row) => row.id === technician.id)?.openWorkOrders ?? 0,
    }));
  }

  @Get('export')
  @Roles(...VIEW_ROLES)
  @Permissions('work_orders.view')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="work-orders.csv"')
  async export(
    @Res() res: Response,
    @Request() req,
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('propertyId') propertyId?: string,
    @Query('open') open?: string,
    @Query('search') search?: string,
  ) {
    const csv = await this.workOrders.exportCsv(getTenantId(req), {
      status,
      category,
      propertyId,
      open: open === 'true' || open === undefined ? undefined : true,
      search,
    });
    res.send(csv);
  }

  @Get(':id')
  @Roles(...VIEW_ROLES)
  @Permissions('work_orders.view')
  async findOne(@Param('id') id: string, @Request() req) {
    const organizationId = getTenantId(req);
    const [workOrder, approval] = await Promise.all([
      this.workOrders.findOne(id, organizationId),
      this.approvals.trail(id, organizationId).catch(() => null),
    ]);

    return { ...workOrder, approval };
  }

  @Post()
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.create')
  create(@Body() dto: CreateWorkOrderDto, @Request() req) {
    return this.workOrders.create(dto, requireTenantId(req), getUserId(req));
  }

  @Patch(':id')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkOrderDto,
    @Request() req,
  ) {
    return this.workOrders.update(id, dto, requireTenantId(req));
  }

  @Delete(':id')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.delete')
  remove(@Param('id') id: string, @Request() req) {
    return this.workOrders.remove(id, requireTenantId(req));
  }

  // ------------------------------------------------------------ transitions

  @Post(':id/inspect')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  inspect(
    @Param('id') id: string,
    @Body() dto: InspectWorkOrderDto,
    @Request() req,
  ) {
    return this.workOrders.inspect(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  /**
   * Approve the work and put somebody on it, in one action.
   *
   * The direct path — no approval policy involved. Where the organization has
   * configured a WORK_ORDER policy the manager uses `request-approval` instead,
   * which routes through the engine and only reaches `approve` once the last
   * level has agreed.
   */
  @Post(':id/approve')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  approve(
    @Param('id') id: string,
    @Body() dto: AssignWorkOrderDto,
    @Request() req,
  ) {
    return this.workOrders.approve(
      id,
      {
        technicianId: dto.technicianId,
        ...(dto.scheduledFor ? { scheduledFor: dto.scheduledFor } : {}),
      },
      requireTenantId(req),
      getUserId(req),
    );
  }

  /**
   * Route an inspected work order through the approval engine.
   *
   * With no policy configured the engine auto-approves and the work order lands
   * in APPROVED straight away, ready to be assigned. With a policy it waits for
   * the last approver — and stays in INSPECTION until then, which is what the
   * detail screen shows.
   */
  @Post(':id/request-approval')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  async requestApproval(@Param('id') id: string, @Request() req) {
    const organizationId = requireTenantId(req);
    const approval = await this.approvals.request(
      id,
      organizationId,
      getUserId(req),
    );
    // Read *after* the decision: with no policy configured the handler has
    // already moved the work order to APPROVED by this point, and a response
    // that still said INSPECTION would send the caller looking for an approval
    // that has already happened.
    const workOrder = await this.workOrders.findOne(id, organizationId);

    return { approval, workOrder };
  }

  @Post(':id/assign')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  assign(
    @Param('id') id: string,
    @Body() dto: AssignWorkOrderDto,
    @Request() req,
  ) {
    return this.workOrders.assign(id, dto, requireTenantId(req));
  }

  @Post(':id/reassign')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  reassign(
    @Param('id') id: string,
    @Body() dto: ReassignWorkOrderDto,
    @Request() req,
  ) {
    return this.workOrders.reassign(
      id,
      dto.technicianId,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/start')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  start(@Param('id') id: string, @Request() req) {
    return this.workOrders.start(id, requireTenantId(req), getUserId(req));
  }

  @Post(':id/complete')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteWorkOrderDto,
    @Request() req,
  ) {
    return this.workOrders.complete(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post(':id/close')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  close(@Param('id') id: string, @Request() req) {
    return this.workOrders.close(id, requireTenantId(req), getUserId(req));
  }

  @Post(':id/cancel')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelWorkOrderDto,
    @Request() req,
  ) {
    return this.workOrders.cancel(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Post('bulk-assign')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  bulkAssign(@Body() dto: BulkAssignWorkOrdersDto, @Request() req) {
    return this.workOrders.bulkAssign(
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  // ------------------------------------------------------------------- tasks

  @Post(':id/tasks')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  addTask(
    @Param('id') id: string,
    @Body() dto: CreateWorkOrderTaskDto,
    @Request() req,
  ) {
    return this.workOrders.addTask(id, dto, requireTenantId(req));
  }

  @Patch(':id/tasks/:taskId')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  updateTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateWorkOrderTaskDto,
    @Request() req,
  ) {
    return this.workOrders.updateTask(
      id,
      taskId,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  @Delete(':id/tasks/:taskId')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update')
  removeTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Request() req,
  ) {
    return this.workOrders.removeTask(id, taskId, requireTenantId(req));
  }

  // ============================================================= materials

  /**
   * What this job consumed from the store.
   *
   * Readable by anybody who can read the queue — a technician asking "is there
   * another one of these?" should not need a permission this module invented.
   */
  @Get(':id/materials')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.view', 'stock_movements.view')
  materials(@Param('id') id: string, @Request() req) {
    return this.workOrders.materials(id, getTenantId(req));
  }

  /**
   * Issue material against the job.
   *
   * Both permissions on purpose: `work_orders.update` because this changes what
   * the job consumed, and `stock_movements.create` because it moves stock off a
   * shelf. A technician may hold the first and not the second, and the store's
   * staff the reverse.
   */
  @Post(':id/materials')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update', 'stock_movements.create')
  issueMaterials(
    @Param('id') id: string,
    @Body() dto: IssueStockDto,
    @Request() req,
  ) {
    return this.workOrders.issueMaterials(
      id,
      dto,
      requireTenantId(req),
      getUserId(req),
    );
  }

  /**
   * Put material back.
   *
   * A return row, never a delete: "the technician used the wrong size and put it
   * back" is a fact, and a ledger that cannot say so disagrees with the shelf
   * within a week.
   */
  @Post(':id/materials/return')
  @Roles(...MAINTENANCE_ROLES)
  @Permissions('work_orders.update', 'stock_movements.create')
  returnMaterials(
    @Param('id') id: string,
    @Body() dto: ReturnStockDto,
    @Request() req,
  ) {
    return this.workOrders.returnMaterials(
      id,
      dto.movementIds,
      requireTenantId(req),
      getUserId(req),
    );
  }
}

/**
 * The resident's side of the same queue.
 *
 * Mounted under the portal so it inherits the tenant-scoped guards. There is no
 * body field that can widen the scope: the tenant, unit and property all come
 * from the session's lease, so a resident can only ever report against their own
 * home.
 */
@UseGuards(JwtAuthGuard, TenantPortalGuard)
@Controller('portal/maintenance')
export class PortalMaintenanceController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  @Get()
  list(@Request() req) {
    return this.workOrders.listForPortal(req);
  }

  @Post()
  report(@Body() dto: ReportIssueDto, @Request() req) {
    return this.workOrders.createFromPortal(dto, req);
  }

  @Post(':id/withdraw')
  withdraw(@Param('id') id: string, @Request() req) {
    return this.workOrders.withdrawFromPortal(id, req);
  }
}
