import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from '../../auth/dto/auth.dto';

export class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) roleCodes: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SetUserRolesDto {
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) roleCodes: string[];
}

export class CloneRoleDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,40}$/, { message: 'Code must be UPPER_SNAKE_CASE, 3–41 characters.' }) code: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
}

export class SetRolePermissionsDto {
  @IsArray() @IsString({ each: true }) permissionCodes: string[];
}

export class ResetUserPasswordDto {
  @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password: string;
}
