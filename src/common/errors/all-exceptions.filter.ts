import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DomainError } from './domain-error';

/**
 * One response shape for every failure:
 *   { statusCode, error, message, code?, details?, path, timestamp }
 * Prisma errors are mapped to stable codes; stack traces and SQL never leave
 * the server. Postgres trigger messages that start with TENANT_MISMATCH are
 * turned into 404s so cross-tenant references never leak existence.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong. Please try again, and contact support if it keeps happening.';
    let code: string | undefined;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof DomainError) {
      status = exception.statusCode;
      message = exception.message;
      code = exception.code;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else if (body && typeof body === 'object') {
        const b = body as any;
        message = Array.isArray(b.message) ? b.message.join('; ') : b.message ?? exception.message;
        code = b.code;
        if (status === 400 && Array.isArray(b.message)) { code = code ?? 'VALIDATION'; details = { fields: b.message }; }
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, message, code, details } = mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = 400; code = 'VALIDATION'; message = 'The request contained invalid data.';
    } else if (exception instanceof Prisma.PrismaClientInitializationError) {
      status = 503; code = 'DB_UNAVAILABLE'; message = 'The database is not available right now.';
    } else if (isPgTriggerError(exception)) {
      const msg = String((exception as any).message ?? '');
      if (msg.includes('TENANT_MISMATCH')) { status = 404; code = 'NOT_FOUND'; message = 'The requested record was not found.'; }
      else { status = 409; code = 'CONSTRAINT'; message = cleanPgMessage(msg); }
    }

    if (status >= 500) this.logger.error(`${req?.method} ${req?.url} → ${status}`, (exception as Error)?.stack);
    else this.logger.warn(`${req?.method} ${req?.url} → ${status} ${code ?? ''} ${message}`);

    res.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      ...(code ? { code } : {}),
      ...(details ? { details } : {}),
      path: req?.url,
      timestamp: new Date().toISOString(),
    });
  }
}

function mapPrismaError(e: Prisma.PrismaClientKnownRequestError) {
  const target = (e.meta?.target as string[] | string | undefined);
  const field = Array.isArray(target) ? target.join(', ') : target;
  switch (e.code) {
    case 'P2002': return { status: 409, code: 'DUPLICATE', message: field ? `A record with the same ${field} already exists.` : 'A duplicate record already exists.', details: field ? { field } : undefined };
    case 'P2003': return { status: 400, code: 'INVALID_REFERENCE', message: 'The record refers to something that does not exist or cannot be removed while it is in use.', details: e.meta as any };
    case 'P2025': return { status: 404, code: 'NOT_FOUND', message: 'The requested record was not found.', details: undefined };
    case 'P2014': return { status: 400, code: 'RELATION_VIOLATION', message: 'The change would break a required relationship.', details: undefined };
    case 'P2011': return { status: 400, code: 'NULL_CONSTRAINT', message: 'A required value is missing.', details: e.meta as any };
    case 'P2010': {
      // Raw query failure — usually one of our triggers.
      const msg = String((e.meta as any)?.message ?? e.message);
      if (msg.includes('TENANT_MISMATCH')) return { status: 404, code: 'NOT_FOUND', message: 'The requested record was not found.', details: undefined };
      return { status: 409, code: 'CONSTRAINT', message: cleanPgMessage(msg), details: undefined };
    }
    default: {
      const msg = String((e.meta as any)?.message ?? e.message ?? '');
      if (msg.includes('TENANT_MISMATCH')) return { status: 404, code: 'NOT_FOUND', message: 'The requested record was not found.', details: undefined };
      if (/immutable|append-only|cannot be deleted|cannot return to/i.test(msg)) return { status: 409, code: 'CONSTRAINT', message: cleanPgMessage(msg), details: undefined };
      return { status: 500, code: 'DB_ERROR', message: 'A database error occurred.', details: undefined };
    }
  }
}

function isPgTriggerError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? '');
  return /immutable|append-only|TENANT_MISMATCH|cannot be deleted|does not belong to|cannot return to/i.test(msg);
}

function cleanPgMessage(msg: string): string {
  // Postgres wraps our RAISE text in driver noise; keep the first sentence we wrote.
  const m = msg.match(/(?:ERROR:\s*)?([^\n]*?(?:immutable|append-only|cannot be deleted|does not belong to|cannot return to)[^\n]*)/i);
  return (m?.[1] ?? msg).replace(/\s*USING ERRCODE.*$/i, '').trim();
}
