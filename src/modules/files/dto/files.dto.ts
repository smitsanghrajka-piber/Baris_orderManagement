import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadAttachmentDto {
  @IsString() @MinLength(1) @MaxLength(60) entityType: string;
  @IsString() @MinLength(1) @MaxLength(60) entityId: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(200) label?: string;
  @IsOptional() @IsIn(['SHARED', 'INTERNAL']) visibility?: 'SHARED' | 'INTERNAL';
}

export class AttachmentsQueryDto {
  @IsString() @MinLength(1) @MaxLength(60) entityType: string;
  @IsString() @MinLength(1) @MaxLength(60) entityId: string;
}
