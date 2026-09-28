import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ListQueryDto } from '../../../common/util/pagination';

const SKU_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'DISCONTINUED'] as const;
const WHITE_INK = ['NONE', 'BACKING', 'SPOT', 'FLOOD'] as const;

export class SkuListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsIn([...SKU_STATUSES, 'ALL']) status?: string;
  @IsOptional() @IsIn(['true', 'false']) includeArchived?: string;
}

export class CreateSkuDto {
  @IsUUID() customerId: string;
  @IsOptional() @IsString() @MaxLength(80) customerSkuCode?: string;
  @IsString() @MinLength(1) @MaxLength(300) description: string;
  @IsOptional() @IsUUID() labelTypeId?: string;
  @IsOptional() @IsUUID() applicationId?: string;
  @IsOptional() @IsString() @MaxLength(200) mouldedProduct?: string;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) oversPct?: number;
}

export class UpdateSkuDto {
  @IsOptional() @IsString() @MaxLength(80) customerSkuCode?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(300) description?: string;
  @IsOptional() @IsUUID() labelTypeId?: string | null;
  @IsOptional() @IsUUID() applicationId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) mouldedProduct?: string | null;
  @IsOptional() @IsIn(SKU_STATUSES) status?: (typeof SKU_STATUSES)[number];
  @IsOptional() @IsUUID() routeId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) oversPct?: number | null;
  @Type(() => Number) @IsInt() @Min(1) version: number;
}

export class SpecColourDto {
  @IsUUID() colourSystemId: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(200) reference?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100) toleranceDeltaE?: number;
  @IsOptional() @IsString() @MaxLength(500) instructions?: string;
}

export class SpecificationDto {
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
  @Type(() => Number) @IsNumber() @Min(0.001) widthMm: number;
  @Type(() => Number) @IsNumber() @Min(0.001) heightMm: number;
  @IsOptional() @IsString() @MaxLength(120) shape?: string;
  @IsOptional() @IsUUID() dieLineFileId?: string;
  @IsOptional() @IsUUID() materialId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) micron?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) labelWeightG?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(12) colourCount?: number;
  @IsOptional() @IsIn(WHITE_INK) whiteInk?: (typeof WHITE_INK)[number];
  @IsOptional() @IsString() @MaxLength(60) printOrientation?: string;
  @IsOptional() @IsString() @MaxLength(60) unwindDirection?: string;
  @IsOptional() @IsString() @MaxLength(60) printDirection?: string;
  @IsOptional() @IsBoolean() varnish?: boolean;
  @IsOptional() @IsBoolean() lacquer?: boolean;
  @IsOptional() @IsUUID() finishId?: string;
  @IsOptional() @IsBoolean() metallic?: boolean;
  @IsOptional() @IsString() @MaxLength(500) specialInks?: string;
  @IsOptional() @IsBoolean() transparency?: boolean;
  @IsOptional() @IsString() @MaxLength(500) barrierRequirements?: string;
  @IsOptional() @IsString() @MaxLength(500) staticRequirements?: string;
  @IsOptional() @IsString() @MaxLength(500) surfaceTreatment?: string;
  @IsOptional() @IsUUID() toolId?: string;
  @IsOptional() @IsUUID() plateSetId?: string;
  @IsOptional() @IsUUID() routeId?: string;
  @IsOptional() @IsString() @MaxLength(200) packingMethod?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) labelsPerCarton?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) labelsPerPallet?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cartonsPerPallet?: number;
  @IsOptional() @IsString() @MaxLength(5000) customerRequirements?: string;
  @IsOptional() @IsString() @MaxLength(5000) internalNotes?: string;
  @IsOptional() @IsBoolean() requiresCustomerReapproval?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SpecColourDto) colours?: SpecColourDto[];
}
