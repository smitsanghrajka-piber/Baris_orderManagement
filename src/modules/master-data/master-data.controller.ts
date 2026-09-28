import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MasterDataService, lookupEditPermission } from './master-data.service';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AuthUser, hasPermission } from '../../common/auth/auth-user';
import { PermissionDeniedError } from '../../common/errors/domain-error';
import { ChecklistTemplateDto, LookupDto, RouteDto, StageDefinitionDto, UpdateChecklistTemplateDto, UpdateLookupDto, UpdateRouteDto, UpdateStageDefinitionDto } from './dto/master-data.dto';

@ApiTags('master-data')
@Controller('master-data')
export class MasterDataController {
  constructor(private readonly md: MasterDataService) {}

  @RequirePermission('master_data.view') @Get()
  all() { return this.md.all(); }

  @RequirePermission('master_data.view') @Get('lookups/:kind')
  list(@Param('kind') kind: string) { return this.md.listLookup(kind); }

  /** Machines need master_data.machines.edit; every other lookup master_data.lookups.edit. */
  @RequirePermission('master_data.lookups.edit', 'master_data.machines.edit') @Post('lookups/:kind')
  create(@Param('kind') kind: string, @Body() dto: LookupDto, @CurrentUser() user: AuthUser) {
    this.assertKind(kind, user);
    return this.md.createLookup(kind, dto);
  }

  @RequirePermission('master_data.lookups.edit', 'master_data.machines.edit') @Patch('lookups/:kind/:id')
  update(@Param('kind') kind: string, @Param('id') id: string, @Body() dto: UpdateLookupDto, @CurrentUser() user: AuthUser) {
    this.assertKind(kind, user);
    return this.md.updateLookup(kind, id, dto);
  }

  @RequirePermission('master_data.routes.edit') @Post('stage-definitions')
  createStage(@Body() dto: StageDefinitionDto) { return this.md.createStageDefinition(dto); }

  @RequirePermission('master_data.routes.edit') @Patch('stage-definitions/:id')
  updateStage(@Param('id') id: string, @Body() dto: UpdateStageDefinitionDto) { return this.md.updateStageDefinition(id, dto); }

  @RequirePermission('master_data.routes.edit') @Post('routes')
  createRoute(@Body() dto: RouteDto) { return this.md.createRoute(dto); }

  @RequirePermission('master_data.routes.edit') @Patch('routes/:id')
  updateRoute(@Param('id') id: string, @Body() dto: UpdateRouteDto) { return this.md.updateRoute(id, dto); }

  @RequirePermission('master_data.checklists.edit') @Post('checklist-templates')
  createChecklist(@Body() dto: ChecklistTemplateDto) { return this.md.createChecklist(dto); }

  @RequirePermission('master_data.checklists.edit') @Patch('checklist-templates/:id')
  updateChecklist(@Param('id') id: string, @Body() dto: UpdateChecklistTemplateDto) { return this.md.updateChecklist(id, dto); }

  private assertKind(kind: string, user: AuthUser) {
    const perm = lookupEditPermission(kind);
    if (!perm || !hasPermission(user, perm)) throw new PermissionDeniedError(`You do not have permission to edit ${kind}.`);
  }
}
