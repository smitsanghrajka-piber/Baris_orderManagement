/**
 * Domain errors carry a stable machine `code` and a human sentence written
 * for the person at the screen (architecture §15, §25). They are mapped to
 * HTTP by AllExceptionsFilter. Never put SQL, stack traces or internal ids
 * the user cannot act on into `message`.
 */
export class DomainError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string, details?: Record<string, unknown>) {
    super(404, 'NOT_FOUND', `${what} was not found.`, details);
  }
}

/** Tenant mismatches are reported as NOT_FOUND so existence never leaks across customers. */
export class TenantMismatchError extends DomainError {
  constructor(what = 'The requested record') {
    super(404, 'NOT_FOUND', `${what} was not found.`, { tenantMismatch: true });
  }
}

export class PermissionDeniedError extends DomainError {
  constructor(message = 'You do not have permission to perform this action.', details?: Record<string, unknown>) {
    super(403, 'PERMISSION_DENIED', message, details);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'VALIDATION', message, details);
  }
}

export class ConflictError extends DomainError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(409, code, message, details);
  }
}

export class InvalidTransitionError extends ConflictError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('INVALID_TRANSITION', message, details);
  }
}

export class VersionConflictError extends ConflictError {
  constructor(what = 'This record') {
    super('VERSION_CONFLICT', `${what} was changed by someone else. Reload and try again.`);
  }
}

export class LockedError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(423, 'LOCKED', message, details);
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = 'Authentication required.', code = 'UNAUTHORIZED') {
    super(401, code, message);
  }
}
