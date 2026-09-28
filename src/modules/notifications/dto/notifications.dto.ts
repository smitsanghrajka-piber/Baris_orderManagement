import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

const AUDIENCES = ['ROLE', 'CONTACT_FLAG', 'SALES_REP', 'SPECIFIC_USER', 'ACTOR_TARGET'] as const;
const CHANNELS = ['IN_APP', 'EMAIL', 'BOTH'] as const;
const FLAGS = ['canApproveArtwork', 'canAcceptQuotations', 'canSubmitOrders', 'receivesDispatchNotices'] as const;

export class NotificationRuleDto {
  @IsString() @MinLength(3) @MaxLength(80) eventType: string;
  @IsIn(AUDIENCES) audience: (typeof AUDIENCES)[number];
  @IsOptional() @IsString() @MaxLength(60) roleCode?: string | null;
  @IsOptional() @IsIn(FLAGS) contactFlag?: (typeof FLAGS)[number] | null;
  @IsOptional() @IsUUID() userId?: string | null;
  @IsOptional() @IsIn(CHANNELS) channel?: (typeof CHANNELS)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) debounceMinutes?: number;
  @IsOptional() @IsBoolean() digest?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateNotificationRuleDto extends NotificationRuleDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(80) declare eventType: string;
  @IsOptional() @IsIn(AUDIENCES) declare audience: (typeof AUDIENCES)[number];
}

export class PreferenceDto {
  @IsString() @MinLength(3) @MaxLength(80) eventType: string;
  @IsBoolean() inApp: boolean;
  @IsBoolean() email: boolean;
}
