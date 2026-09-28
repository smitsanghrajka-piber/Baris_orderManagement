import { ArrayNotEmpty, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { PASSWORD_MESSAGE, PASSWORD_RULE } from '../../auth/dto/auth.dto';
import { ListQueryDto } from '../../../common/util/pagination';

const STATUSES = ['PROSPECT', 'ACTIVE', 'ON_HOLD', 'INACTIVE'] as const;

export class CustomerListQueryDto extends ListQueryDto {
  @IsOptional() @IsIn([...STATUSES, 'ALL']) status?: string;
  @IsOptional() @IsIn(['true', 'false']) includeArchived?: string;
}

export class CreateCustomerDto {
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(200) tradingName?: string;
  @IsOptional() @IsString() @MaxLength(20) abn?: string;
  @IsOptional() @IsString() @MaxLength(60) taxStatus?: string;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsUUID() paymentTermsId?: string;
  @IsOptional() @IsUUID() salesRepUserId?: string;
  @IsOptional() @IsString() @MaxLength(200) billingStreet?: string;
  @IsOptional() @IsString() @MaxLength(100) billingSuburb?: string;
  @IsOptional() @IsString() @MaxLength(50) billingState?: string;
  @IsOptional() @IsString() @MaxLength(20) billingPostcode?: string;
  @IsOptional() @IsString() @MaxLength(60) billingCountry?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(5000) requirements?: string;
  @IsOptional() @IsUUID() defaultMaterialId?: string;
  @IsOptional() @IsUUID() defaultFinishId?: string;
  @IsOptional() @IsBoolean() poNotRequired?: boolean;
  @IsOptional() @IsBoolean() allowPartialDispatch?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) deliveryTolerancePct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) oversPct?: number;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) declare name: string;
  @Type(() => Number) @IsInt() @Min(1) version: number;
}

export class CreditHoldDto {
  @IsBoolean() hold: boolean;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class ContactDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) position?: string;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() canApproveArtwork?: boolean;
  @IsOptional() @IsBoolean() canAcceptQuotations?: boolean;
  @IsOptional() @IsBoolean() canSubmitOrders?: boolean;
  @IsOptional() @IsBoolean() receivesDispatchNotices?: boolean;
}

export class UpdateContactDto extends ContactDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}

export class SiteDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(200) street?: string;
  @IsOptional() @IsString() @MaxLength(100) suburb?: string;
  @IsOptional() @IsString() @MaxLength(50) state?: string;
  @IsOptional() @IsString() @MaxLength(20) postcode?: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;
  @IsOptional() @IsString() @MaxLength(2000) deliveryInstructions?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateSiteDto extends SiteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}

export class CreateCustomerUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsOptional() @IsString() @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE }) password?: string;
  @IsArray() @ArrayNotEmpty() @IsString({ each: true }) roleCodes: string[];
}

export class UpdateCustomerUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsUUID() contactId?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) roleCodes?: string[];
}
