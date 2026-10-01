import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ToolingService } from './tooling.service';
import { RequirePermission } from '../../common/auth/decorators';
import { PlateSetDto, ToolDto, ToolingListQueryDto, UpdatePlateSetDto, UpdateToolDto } from './dto/tooling.dto';

@ApiTags('tooling')
@Controller('tooling')
export class ToolingController {
  constructor(private readonly tooling: ToolingService) {}

  @RequirePermission('tooling.view') @Get('tools')
  listTools(@Query() q: ToolingListQueryDto) { return this.tooling.listTools(q); }

  @RequirePermission('tooling.view') @Get('tools/:id')
  getTool(@Param('id') id: string) { return this.tooling.getTool(id); }

  @RequirePermission('tooling.edit') @Post('tools')
  createTool(@Body() dto: ToolDto) { return this.tooling.createTool(dto); }

  @RequirePermission('tooling.edit') @Patch('tools/:id')
  updateTool(@Param('id') id: string, @Body() dto: UpdateToolDto) { return this.tooling.updateTool(id, dto); }

  @RequirePermission('tooling.edit') @Post('tools/:id/archive')
  archiveTool(@Param('id') id: string) { return this.tooling.archiveTool(id); }

  @RequirePermission('tooling.view') @Get('plate-sets')
  listPlateSets(@Query() q: ToolingListQueryDto) { return this.tooling.listPlateSets(q); }

  @RequirePermission('tooling.edit') @Post('plate-sets')
  createPlateSet(@Body() dto: PlateSetDto) { return this.tooling.createPlateSet(dto); }

  @RequirePermission('tooling.edit') @Patch('plate-sets/:id')
  updatePlateSet(@Param('id') id: string, @Body() dto: UpdatePlateSetDto) { return this.tooling.updatePlateSet(id, dto); }

  @RequirePermission('tooling.edit') @Post('plate-sets/:id/archive')
  archivePlateSet(@Param('id') id: string) { return this.tooling.archivePlateSet(id); }
}
