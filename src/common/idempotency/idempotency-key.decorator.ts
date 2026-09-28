import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ValidationError } from '../errors/domain-error';

/**
 * Reads the Idempotency-Key header (a header, not a body field, so an
 * offline outbox can attach it generically). Absent → undefined → unguarded.
 */
export const IdempotencyKey = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const raw = ctx.switchToHttp().getRequest().headers['idempotency-key'];
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) throw new ValidationError('Idempotency-Key must be sent once.');
  const key = String(raw).trim();
  if (!key) return undefined;
  if (key.length > 200) throw new ValidationError('Idempotency-Key is too long (max 200 characters).');
  return key;
});
