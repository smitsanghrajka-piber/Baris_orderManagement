import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Standard list query: ?page&pageSize&sort=field:asc&q */
export class ListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 50;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() q?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function pageArgs(q: ListQueryDto) {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? 50;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

/** Parse "field:asc" against an allow-list; falls back to the default. */
export function orderBy<T extends string>(sort: string | undefined, allowed: readonly T[], fallback: Record<string, 'asc' | 'desc'>): Record<string, 'asc' | 'desc'> {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':');
  if (!allowed.includes(field as T)) return fallback;
  return { [field]: dir === 'desc' ? 'desc' : 'asc' };
}

export function toPage<T>(items: T[], total: number, q: ListQueryDto): Page<T> {
  const { page, pageSize } = pageArgs(q);
  return { items, total, page, pageSize };
}
