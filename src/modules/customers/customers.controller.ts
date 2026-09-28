import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CustomerUsersService } from './customer-users.service';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { AuthUser } from '../../common/auth/auth-user';
import { ContactDto, CreateCustomerDto, CreateCustomerUserDto, CreditHoldDto, CustomerListQueryDto, SiteDto, UpdateContactDto, UpdateCustomerDto, UpdateCustomerUserDto, UpdateSiteDto } from './dto/customers.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService, private readonly customerUsers: CustomerUsersService) {}

  @RequirePermission('customer.view') @Get()
  list(@Query() q: CustomerListQueryDto) { return this.customers.list(q); }

  @RequirePermission('customer.view') @Get(':id')
  get(@Param('id') id: string) { return this.customers.get360(id); }

  @RequirePermission('customer.view') @Get(':id/timeline')
  timeline(@Param('id') id: string, @Query('limit') limit?: string) { return this.customers.timeline(id, limit ? Number(limit) : 100); }

  @RequirePermission('customer.create') @Post()
  create(@Body() dto: CreateCustomerDto) { return this.customers.create(dto); }

  @RequirePermission('customer.edit') @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) { return this.customers.update(id, dto); }

  @RequirePermission('customer.archive') @Post(':id/archive')
  archive(@Param('id') id: string) { return this.customers.archive(id); }

  @RequirePermission('customer.credit_hold') @Post(':id/credit-hold')
  creditHold(@Param('id') id: string, @Body() dto: CreditHoldDto, @CurrentUser() user: AuthUser) { return this.customers.creditHold(id, dto, user); }

  // contacts
  @RequirePermission('customer.edit') @Post(':id/contacts')
  addContact(@Param('id') id: string, @Body() dto: ContactDto) { return this.customers.addContact(id, dto); }

  @RequirePermission('customer.edit') @Patch(':id/contacts/:contactId')
  updateContact(@Param('id') id: string, @Param('contactId') contactId: string, @Body() dto: UpdateContactDto) { return this.customers.updateContact(id, contactId, dto); }

  @RequirePermission('customer.edit') @Delete(':id/contacts/:contactId')
  archiveContact(@Param('id') id: string, @Param('contactId') contactId: string) { return this.customers.archiveContact(id, contactId); }

  // sites
  @RequirePermission('customer.edit') @Post(':id/sites')
  addSite(@Param('id') id: string, @Body() dto: SiteDto) { return this.customers.addSite(id, dto); }

  @RequirePermission('customer.edit') @Patch(':id/sites/:siteId')
  updateSite(@Param('id') id: string, @Param('siteId') siteId: string, @Body() dto: UpdateSiteDto) { return this.customers.updateSite(id, siteId, dto); }

  @RequirePermission('customer.edit') @Delete(':id/sites/:siteId')
  archiveSite(@Param('id') id: string, @Param('siteId') siteId: string) { return this.customers.archiveSite(id, siteId); }

  // portal users
  @RequirePermission('customer_user.manage') @Get(':id/users')
  listUsers(@Param('id') id: string) { return this.customerUsers.list(id); }

  @RequirePermission('customer_user.manage') @Post(':id/users')
  createUser(@Param('id') id: string, @Body() dto: CreateCustomerUserDto) { return this.customerUsers.create(id, dto); }

  @RequirePermission('customer_user.manage') @Patch(':id/users/:userId')
  updateUser(@Param('id') id: string, @Param('userId') userId: string, @Body() dto: UpdateCustomerUserDto) { return this.customerUsers.update(id, userId, dto); }

  @RequirePermission('customer_user.unlock') @Post(':id/users/:userId/unlock')
  unlockUser(@Param('id') id: string, @Param('userId') userId: string) { return this.customerUsers.unlock(id, userId); }

  @RequirePermission('customer_user.manage') @Post(':id/users/:userId/resend-invite') @HttpCode(204)
  async resendInvite(@Param('id') id: string, @Param('userId') userId: string) { await this.customerUsers.resendInvite(id, userId); }
}
