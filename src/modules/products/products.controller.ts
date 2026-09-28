import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth-user';
import { CreateSkuDto, SkuListQueryDto, SpecificationDto, UpdateSkuDto } from './dto/products.dto';

@ApiTags('skus')
@Controller()
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @RequirePermission('sku.view') @Get('skus')
  list(@Query() q: SkuListQueryDto) { return this.products.list(q); }

  @RequirePermission('sku.view') @Get('skus/:id')
  get(@Param('id') id: string) { return this.products.get(id); }

  @RequirePermission('sku.create') @Post('skus')
  create(@Body() dto: CreateSkuDto) { return this.products.create(dto); }

  @RequirePermission('sku.edit') @Patch('skus/:id')
  update(@Param('id') id: string, @Body() dto: UpdateSkuDto) { return this.products.update(id, dto); }

  @RequirePermission('sku.archive') @Post('skus/:id/archive')
  archive(@Param('id') id: string) { return this.products.archive(id); }

  @RequirePermission('spec.create_revision') @Post('skus/:id/specifications')
  createRevision(@Param('id') id: string, @Body() dto: SpecificationDto, @CurrentUser() user: AuthUser) { return this.products.createRevision(id, dto, user.id); }

  @RequirePermission('sku.view') @Get('specifications/:id')
  getSpec(@Param('id') id: string) { return this.products.getSpecification(id); }

  @RequirePermission('spec.create_revision') @Patch('specifications/:id')
  updateDraft(@Param('id') id: string, @Body() dto: SpecificationDto) { return this.products.updateDraft(id, dto); }

  @RequirePermission('spec.approve') @Post('specifications/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: AuthUser) { return this.products.approve(id, user.id); }

  @RequirePermission('spec.create_revision') @Post('specifications/:id/archive')
  archiveSpec(@Param('id') id: string) { return this.products.archiveSpec(id); }
}
