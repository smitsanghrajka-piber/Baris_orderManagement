import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const CODE = /^[A-Z0-9][A-Z0-9_\-]{0,39}$/;
const TOOL_TYPES = ['DIE', 'CUTTING_TOOL', 'OTHER'] as const;
const STATUSES = ['ACTIVE', 'MAINTENANCE', 'RETIRED'] as const;
const OWNERS = ['BARIS', 'CUSTOMER'] as const;
const PLATE_TYPES = ['PLATE', 'CYLINDER'] as const;

export class ToolDto {
  @IsString() @Matches(CODE) code: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsIn(TOOL_TYPES) type?: (typeof TOOL_TYPES)[number];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) heightMm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cavities?: number;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsIn(OWNERS) ownedBy?: (typeof OWNERS)[number];
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdateToolDto extends ToolDto {
  @IsOptional() @IsString() @Matches(CODE) declare code: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}

export class PlateSetDto {
  @IsString() @Matches(CODE) code: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsIn(PLATE_TYPES) type?: (typeof PLATE_TYPES)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) colourCount?: number;
  @IsOptional() @IsUUID() toolId?: string | null;
  @IsOptional() @IsIn(STATUSES) status?: (typeof STATUSES)[number];
  @IsOptional() @IsIn(OWNERS) ownedBy?: (typeof OWNERS)[number];
  @IsOptional() @IsUUID() customerId?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class UpdatePlateSetDto extends PlateSetDto {
  @IsOptional() @IsString() @Matches(CODE) declare code: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}
