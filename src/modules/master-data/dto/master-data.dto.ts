import { ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export const LOOKUP_KINDS = ['materials', 'finishes', 'colour-systems', 'label-types', 'applications', 'payment-terms', 'carriers', 'machines'] as const;
export type LookupKind = (typeof LOOKUP_KINDS)[number];

const CODE = /^[A-Z0-9][A-Z0-9_\-]{0,39}$/;

export class LookupDto {
  @IsString() @Matches(CODE, { message: 'Code must be upper-case letters, digits, _ or -, up to 40 characters.' }) code: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  // kind-specific extras
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) micronDefault?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) days?: number;
  @IsOptional() @IsString() @MaxLength(300) trackingUrlTemplate?: string;
  @IsOptional() @IsString() @MaxLength(60) type?: string;
}

export class UpdateLookupDto extends LookupDto {
  @IsOptional() @IsString() @Matches(CODE) declare code: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}

const CATEGORIES = ['PREP', 'PRINTING', 'FINISHING', 'INSPECTION', 'PACKING'] as const;

export class StageDefinitionDto {
  @IsString() @Matches(CODE) code: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsIn(CATEGORIES) category: (typeof CATEGORIES)[number];
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateStageDefinitionDto extends StageDefinitionDto {
  @IsOptional() @IsString() @Matches(CODE) declare code: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
  @IsOptional() @IsIn(CATEGORIES) declare category: (typeof CATEGORIES)[number];
}

export class RouteStepDto {
  @IsUUID() stageDefinitionId: string;
  @IsOptional() @IsBoolean() requiresQc?: boolean;
  @IsOptional() @IsUUID() qcChecklistTemplateId?: string;
  @IsOptional() @IsBoolean() allowSkip?: boolean;
}

export class RouteDto {
  @IsString() @Matches(CODE) code: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => RouteStepDto) steps: RouteStepDto[];
}

export class UpdateRouteDto extends RouteDto {
  @IsOptional() @IsString() @Matches(CODE) declare code: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RouteStepDto) declare steps: RouteStepDto[];
}

export class ChecklistItemDto {
  @IsString() @Matches(CODE) code: string;
  @IsString() @MinLength(1) @MaxLength(200) label: string;
  @IsOptional() @IsString() @MaxLength(500) helpText?: string;
  @IsOptional() @IsBoolean() isRequired?: boolean;
}

export class ChecklistTemplateDto {
  @IsString() @Matches(CODE) code: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsIn(['PREPRESS', 'QC']) kind: 'PREPRESS' | 'QC';
  @IsOptional() @IsUUID() labelTypeId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) items: ChecklistItemDto[];
}

export class UpdateChecklistTemplateDto extends ChecklistTemplateDto {
  @IsOptional() @IsString() @Matches(CODE) declare code: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
  @IsOptional() @IsIn(['PREPRESS', 'QC']) declare kind: 'PREPRESS' | 'QC';
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChecklistItemDto) declare items: ChecklistItemDto[];
}
