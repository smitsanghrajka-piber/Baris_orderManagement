import { Expose, Type, plainToInstance } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Portal responses are ALLOW-LISTS (architecture §10). Only @Expose()d
 * fields are ever serialised, so a new internal column can never leak by
 * default. test/unit/portal-dto-snapshot.spec.ts asserts the forbidden keys.
 */
export function toPortal<T>(cls: new () => T, value: unknown): T {
  return plainToInstance(cls, value, { excludeExtraneousValues: true, exposeUnsetFields: false });
}

export function toPortalList<T>(cls: new () => T, values: unknown[]): T[] {
  return values.map((v) => toPortal(cls, v));
}

export class PortalContactView {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() email: string | null;
  @Expose() phone: string | null;
  @Expose() position: string | null;
  @Expose() isPrimary: boolean;
  @Expose() canApproveArtwork: boolean;
  @Expose() canAcceptQuotations: boolean;
  @Expose() canSubmitOrders: boolean;
  @Expose() receivesDispatchNotices: boolean;
}

export class PortalSiteView {
  @Expose() id: string;
  @Expose() name: string;
  @Expose() street: string | null;
  @Expose() suburb: string | null;
  @Expose() state: string | null;
  @Expose() postcode: string | null;
  @Expose() country: string | null;
  @Expose() deliveryInstructions: string | null;
  @Expose() isDefault: boolean;
}

export class PortalUserView {
  @Expose() id: string;
  @Expose() email: string;
  @Expose() name: string;
  @Expose() isActive: boolean;
  @Expose() lockedAt: Date | null;
  @Expose() lastLoginAt: Date | null;
  @Expose() contactId: string | null;
  @Expose() roles: string[];
}

export class PortalCustomerView {
  @Expose() id: string;
  @Expose() number: string;
  @Expose() name: string;
  @Expose() tradingName: string | null;
  @Expose() abn: string | null;
  @Expose() currency: string;
  @Expose() status: string;
  @Expose() billingStreet: string | null;
  @Expose() billingSuburb: string | null;
  @Expose() billingState: string | null;
  @Expose() billingPostcode: string | null;
  @Expose() billingCountry: string | null;
  @Expose() phone: string | null;
  @Expose() email: string | null;
  @Expose() website: string | null;
  @Expose() requirements: string | null;
  @Expose() allowPartialDispatch: boolean;
  @Expose() @Type(() => PortalContactView) contacts: PortalContactView[];
  @Expose() @Type(() => PortalSiteView) sites: PortalSiteView[];
}

export class PortalSpecView {
  @Expose() id: string;
  @Expose() revisionNo: number;
  @Expose() status: string;
  @Expose() widthMm: unknown;
  @Expose() heightMm: unknown;
  @Expose() shape: string | null;
  @Expose() materialCode: string | null;
  @Expose() micron: unknown;
  @Expose() colourCount: number;
  @Expose() whiteInk: string;
  @Expose() varnish: boolean;
  @Expose() lacquer: boolean;
  @Expose() finishCode: string | null;
  @Expose() metallic: boolean;
  @Expose() labelsPerCarton: number | null;
  @Expose() labelsPerPallet: number | null;
  @Expose() customerRequirements: string | null;
  @Expose() approvedAt: Date | null;
}

export class PortalSkuView {
  @Expose() id: string;
  @Expose() number: string;
  @Expose() customerSkuCode: string | null;
  @Expose() description: string;
  @Expose() mouldedProduct: string | null;
  @Expose() status: string;
  @Expose() @Type(() => PortalSpecView) currentSpecification: PortalSpecView | null;
}

export class PortalActivityView {
  @Expose() id: string;
  @Expose() entityType: string;
  @Expose() entityId: string;
  @Expose() actorName: string;
  @Expose() verb: string;
  @Expose() summary: string;
  @Expose() createdAt: Date;
}

// ─── write DTOs (validated) ───

export class PortalCustomerUpdateDto {
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
}

export class PortalSiteDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(200) street?: string;
  @IsOptional() @IsString() @MaxLength(100) suburb?: string;
  @IsOptional() @IsString() @MaxLength(50) state?: string;
  @IsOptional() @IsString() @MaxLength(20) postcode?: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;
  @IsOptional() @IsString() @MaxLength(2000) deliveryInstructions?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class PortalSiteUpdateDto extends PortalSiteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) declare name: string;
}

export class PortalUserCreateDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsUUID() contactId?: string;
  @IsBoolean() isAdmin: boolean;
}

export class PortalUserUpdateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isAdmin?: boolean;
}
