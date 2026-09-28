import { IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CompanySettingsDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) legalName?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) tradingName?: string;
  @IsOptional() @IsString() @MaxLength(20) abn?: string;
  @IsOptional() @IsString() @MaxLength(200) street?: string;
  @IsOptional() @IsString() @MaxLength(100) suburb?: string;
  @IsOptional() @IsString() @MaxLength(50) state?: string;
  @IsOptional() @IsString() @MaxLength(20) postcode?: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsUUID() logoFileId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) gstRatePct?: number;
  @IsOptional() @IsString() @MaxLength(3) defaultCurrency?: string;
  @IsOptional() @IsString() @MaxLength(60) timeZone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) quoteValidityDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(60) proofReminderDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) proofExpiryDays?: number | null;
  @IsOptional() @IsString() @MinLength(20) @MaxLength(2000) approvalStatementText?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultOversPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) defaultDeliveryTolerancePct?: number;
}

export class NumberSequenceDto {
  @IsOptional() @IsString() @Matches(/^[A-Z0-9\-]{1,12}$/) prefix?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) padding?: number;
  @IsOptional() @IsString() @Matches(/\{seq\}/, { message: 'Format must contain {seq}.' }) @MaxLength(60) format?: string;
  @IsOptional() @IsIn(['NEVER', 'YEARLY']) resetPolicy?: 'NEVER' | 'YEARLY';
  /** Only allowed to move forward. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) nextValue?: number;
}
