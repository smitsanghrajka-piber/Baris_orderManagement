import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth-user';
import { CustomersService } from '../customers/customers.service';
import { CustomerUsersService } from '../customers/customer-users.service';
import { FilesService } from '../files/files.service';
import { NotFoundError } from '../../common/errors/domain-error';
import {
  PortalActivityView, PortalCustomerUpdateDto, PortalCustomerView, PortalSiteDto, PortalSiteUpdateDto, PortalSiteView, PortalSkuView,
  PortalUserCreateDto, PortalUserUpdateDto, PortalUserView, toPortal, toPortalList,
} from './dto/portal.dto';

/**
 * Customer-facing facade. Every handler takes the tenant from the JWT
 * (user.customerId) — never from the URL or body — and serialises through
 * allow-list DTOs. Phase 6 extends this with artworks, quotes, orders and
 * dispatches; Phase 2 covers organisation, sites, users, SKUs, timeline,
 * dashboard and files.
 */
@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly customerUsers: CustomerUsersService,
    private readonly files: FilesService,
  ) {}

  @RequirePermission('portal.dashboard.view') @Get('dashboard')
  async dashboard(@CurrentUser() user: AuthUser) {
    const customerId = user.customerId!;
    const [skus, activity, notifications] = await Promise.all([
      this.prisma.customerSku.count({ where: { customerId, archivedAt: null, status: 'ACTIVE' } }),
      this.prisma.activity.findMany({ where: { customerId, visibility: 'SHARED' }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.notification.count({ where: { customerUserId: user.id, readAt: null } }),
    ]);
    // Later phases fill these tiles; the shape is stable from day one.
    return {
      tiles: { ordersInProduction: 0, artworkAwaitingApproval: 0, quotationsOpen: 0, recentOrders: 0, dispatchesRecent: 0, actionRequired: 0, activeSkus: skus, unreadNotifications: notifications },
      recentActivity: toPortalList(PortalActivityView, activity),
    };
  }

  @RequirePermission('portal.customer.view') @Get('customer')
  async customer(@CurrentUser() user: AuthUser) {
    const c = await this.prisma.customer.findUnique({
      where: { id: user.customerId! },
      include: { contacts: { where: { archivedAt: null }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }] }, sites: { where: { archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] } },
    });
    if (!c) throw new NotFoundError('Organisation');
    return toPortal(PortalCustomerView, c);
  }

  @RequirePermission('portal.customer.edit') @Patch('customer')
  async updateCustomer(@CurrentUser() user: AuthUser, @Body() dto: PortalCustomerUpdateDto) {
    const existing = await this.prisma.customer.findUniqueOrThrow({ where: { id: user.customerId! } });
    await this.customers.update(existing.id, { ...dto, version: existing.version } as any);
    return this.customer(user);
  }

  @RequirePermission('portal.customer.view') @Get('timeline')
  async timeline(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return toPortalList(PortalActivityView, await this.customers.timeline(user.customerId!, limit ? Number(limit) : 50, true));
  }

  // sites
  @RequirePermission('portal.customer.view') @Get('sites')
  async sites(@CurrentUser() user: AuthUser) {
    return toPortalList(PortalSiteView, await this.prisma.customerSite.findMany({ where: { customerId: user.customerId!, archivedAt: null }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }));
  }

  @RequirePermission('portal.customer.edit') @Post('sites')
  async addSite(@CurrentUser() user: AuthUser, @Body() dto: PortalSiteDto) {
    return toPortal(PortalSiteView, await this.customers.addSite(user.customerId!, dto));
  }

  @RequirePermission('portal.customer.edit') @Patch('sites/:id')
  async updateSite(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PortalSiteUpdateDto) {
    return toPortal(PortalSiteView, await this.customers.updateSite(user.customerId!, id, dto));
  }

  // users (Customer Administrator)
  @RequirePermission('portal.user.manage') @Get('users')
  async users(@CurrentUser() user: AuthUser) {
    return toPortalList(PortalUserView, await this.customerUsers.list(user.customerId!));
  }

  @RequirePermission('portal.user.manage') @Post('users')
  async createUser(@CurrentUser() user: AuthUser, @Body() dto: PortalUserCreateDto) {
    const created = await this.customerUsers.create(user.customerId!, { email: dto.email, name: dto.name, contactId: dto.contactId, roleCodes: [dto.isAdmin ? 'CUSTOMER_ADMIN' : 'CUSTOMER_USER'] }, { byCustomerAdmin: true });
    return toPortal(PortalUserView, created);
  }

  @RequirePermission('portal.user.manage') @Patch('users/:id')
  async updateUser(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PortalUserUpdateDto) {
    const updated = await this.customerUsers.update(user.customerId!, id, { name: dto.name, isActive: dto.isActive, ...(dto.isAdmin !== undefined ? { roleCodes: [dto.isAdmin ? 'CUSTOMER_ADMIN' : 'CUSTOMER_USER'] } : {}) }, { byCustomerAdmin: true, actorId: user.id });
    return toPortal(PortalUserView, updated);
  }

  // skus
  @RequirePermission('portal.sku.view') @Get('skus')
  async skus(@CurrentUser() user: AuthUser) {
    const rows = await this.prisma.customerSku.findMany({ where: { customerId: user.customerId!, archivedAt: null }, orderBy: { number: 'asc' }, include: { currentSpecification: true } });
    return toPortalList(PortalSkuView, rows);
  }

  @RequirePermission('portal.sku.view') @Get('skus/:id')
  async sku(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.prisma.customerSku.findFirst({ where: { id, customerId: user.customerId!, archivedAt: null }, include: { currentSpecification: true } });
    if (!row) throw new NotFoundError('SKU');
    return toPortal(PortalSkuView, row);
  }

  // files
  @RequirePermission('portal.file.download') @Get('files/:id/url')
  fileUrl(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('download') download?: string) {
    return this.files.signedUrl(user, id, download === '1' || download === 'true');
  }

  @RequirePermission('portal.file.download') @Get('attachments')
  attachments(@CurrentUser() user: AuthUser, @Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.files.listAttachments(user, entityType, entityId);
  }
}
