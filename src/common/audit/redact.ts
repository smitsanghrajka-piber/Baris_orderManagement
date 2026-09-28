/**
 * Blank secret-bearing fields by name, anywhere in a payload, before it is
 * written to the audit trail. Depth-capped and cycle-safe.
 */
const REDACT_KEYS = new Set([
  'password', 'passwordhash', 'token', 'tokenhash', 'refreshtoken', 'accesstoken', 'secret', 'clientsecret',
  'apikey', 'pin', 'authorization', 'signaturedataurl', 'serviceRoleKey'.toLowerCase(),
]);

export function redactSecrets<T>(value: T, depth = 0, seen = new WeakSet<object>()): T {
  if (typeof value === 'bigint') return value.toString() as unknown as T;
  if (value === null || typeof value !== 'object' || depth > 12) return value;
  if (seen.has(value as object)) return '[circular]' as unknown as T;
  seen.add(value as object);
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1, seen)) as unknown as T;
  if (value instanceof Date) return value;
  // Value objects (Prisma Decimal, Buffer, …) are stored in their JSON form.
  // Prisma rejects class instances nested inside a Json column, and a
  // Decimal left as-is would fail the whole audited transaction.
  if (typeof (value as any).toJSON === 'function') return redactSecrets((value as any).toJSON(), depth + 1, seen);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? '[redacted]' : redactSecrets(v, depth + 1, seen);
  }
  return out as T;
}

/** Fields that changed between two snapshots (shallow, by JSON equality). */
export function changedFields(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string[] {
  if (!before || !after) return [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (k === 'updatedAt') continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) changed.push(k);
  }
  return changed;
}
