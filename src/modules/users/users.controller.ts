import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { ListQueryDto } from '../../common/util/pagination';
import { CloneRoleDto, CreateUserDto, ResetUserPasswordDto, SetRolePermissionsDto, SetUserRolesDto, UpdateUserDto } from './dto/users.dto';
import { AuthUser } from '../../common/auth/auth-user';

@ApiTags('users')
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission('user.manage')
  @Get('users')
  list(@Query() q: ListQueryDto) {
    return this.users.list(q);
  }

  @RequirePermission('user.manage')
  @Get('users/:id')
  get(@Param('id') id: string) {
    return this.users.get(id);
  }

  @RequirePermission('user.manage')
  @Post('users')
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @RequirePermission('user.manage')
  @Patch('users/:id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor);
  }

  @RequirePermission('user.manage')
  @Post('users/:id/roles')
  setRoles(@Param('id') id: string, @Body() dto: SetUserRolesDto, @CurrentUser() actor: AuthUser) {
    return this.users.setRoles(id, dto, actor);
  }

  @RequirePermission('user.manage')
  @Post('users/:id/unlock')
  unlock(@Param('id') id: string) {
    return this.users.unlock(id);
  }

  @RequirePermission('user.manage')
  @Post('users/:id/reset-password')
  @HttpCode(204)
  async resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto) {
    await this.users.resetPassword(id, dto.password);
  }

  /** Roles are readable by anyone who can manage staff or customer logins. */
  @RequirePermission('user.manage', 'role.manage', 'customer_user.manage')
  @Get('roles')
  roles(@Query('scope') scope?: 'STAFF' | 'CUSTOMER') {
    return this.users.listRoles(scope);
  }

  @RequirePermission('role.manage')
  @Get('permissions')
  permissions() {
    return this.users.listPermissions();
  }

  @RequirePermission('role.manage')
  @Post('roles/:id/clone')
  cloneRole(@Param('id') id: string, @Body() dto: CloneRoleDto) {
    return this.users.cloneRole(id, dto);
  }

  @RequirePermission('role.manage')
  @Patch('roles/:id/permissions')
  setPermissions(@Param('id') id: string, @Body() dto: SetRolePermissionsDto) {
    return this.users.setRolePermissions(id, dto);
  }
}
