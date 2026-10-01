import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ListQueryDto } from '../../../common/util/pagination';

/**
 * Multipart fields arrive as strings; "false" must not become true. Reads the
 * raw value from `obj`: the global pipe's implicit conversion has already
 * turned "false" into Boolean("false") === true by the time `value` arrives.
 */
const toBool = ({ obj, key }: { obj: Record<string, unknown>; key: string }) => {
  const raw = obj[key];
  return raw === true || raw === 'true' || raw === '1' || raw === 'on';
};

export const ARTWORK_LIST_FILTERS = ['ALL', 'NEEDS_ACTION', 'AWAITING_CUSTOMER', 'IN_PREPARATION', 'APPROVED'] as const;

export class ArtworkListQueryDto extends ListQueryDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() skuId?: string;
  @IsOptional() @IsIn(ARTWORK_LIST_FILTERS) filter?: (typeof ARTWORK_LIST_FILTERS)[number];
}

/** POST /artworks (multipart, field "file" = the proof). */
export class CreateArtworkDto {
  @IsUUID() customerId: string;
  /** Every artwork belongs to one of the customer's SKUs. */
  @IsUUID() skuId: string;
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @IsUUID() accountManagerUserId?: string;
  @IsOptional() @IsString() @MaxLength(2000) revisionDescription?: string;
  @IsOptional() @IsString() @MaxLength(5000) customerNotes?: string;
  @IsOptional() @IsString() @MaxLength(5000) internalNotes?: string;
  /** Send the proof to the customer straight away. */
  @IsOptional() @Transform(toBool) @IsBoolean() sendNow?: boolean;
}

/** POST /artworks/:id/versions (multipart, field "file" = the new proof). */
export class CreateVersionDto {
  @IsString() @MinLength(3) @MaxLength(2000) revisionDescription: string;
  @IsOptional() @IsString() @MaxLength(5000) customerNotes?: string;
  @IsOptional() @IsString() @MaxLength(5000) internalNotes?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() sendNow?: boolean;
}

/** POST /artwork-versions/:id/files (multipart) — extra files before sending. */
export class AddVersionFileDto {
  @IsIn(['SOURCE', 'PRODUCTION', 'DIE_LINE', 'REFERENCE']) kind: 'SOURCE' | 'PRODUCTION' | 'DIE_LINE' | 'REFERENCE';
}

export class UpdateArtworkDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsUUID() accountManagerUserId?: string | null;
  @IsOptional() @IsUUID() skuId?: string;
  @Type(() => Number) @IsInt() @Min(1) version: number;
}

/** An area of the proof, normalised to 0..1 of the page. w = h = 0 is a pin. */
export class AnnotationDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(500) page: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) x: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) y: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) w: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) h: number;
}

export class StaffCommentDto {
  @IsString() @MinLength(1) @MaxLength(5000) body: string;
  @IsOptional() @IsIn(['SHARED', 'INTERNAL']) visibility?: 'SHARED' | 'INTERNAL';
  @IsOptional() @ValidateNested() @Type(() => AnnotationDto) annotation?: AnnotationDto;
  @IsOptional() @IsUUID() parentId?: string;
}

export class PortalCommentDto {
  @IsString() @MinLength(1) @MaxLength(5000) body: string;
  @IsOptional() @ValidateNested() @Type(() => AnnotationDto) annotation?: AnnotationDto;
  @IsOptional() @IsUUID() parentId?: string;
}

export class PortalCommentUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(5000) body?: string;
  @IsOptional() @ValidateNested() @Type(() => AnnotationDto) annotation?: AnnotationDto | null;
}

export class ResolveCommentDto {
  @IsIn(['OPEN', 'RESOLVED']) status: 'OPEN' | 'RESOLVED';
}

export class PortalDecisionDto {
  @IsIn(['APPROVED', 'CHANGES_REQUESTED']) decision: 'APPROVED' | 'CHANGES_REQUESTED';
  @IsOptional() @IsString() @MaxLength(5000) summary?: string;
  /** Must be true to approve: the user ticked the approval statement. */
  @IsOptional() @IsBoolean() acceptStatement?: boolean;
}
