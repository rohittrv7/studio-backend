/**
 * Keys whose values must be redacted before any log output.
 * All comparisons are case-insensitive.
 */
const SENSITIVE_KEYS = new Set([
  'authorization',
  'x-api-key',
  'idtoken',
  'refreshtoken',
  'phone',
  'otp',
  'token',
  'password',
  'secret',
]);

const REDACTED = '[REDACTED]';

/**
 * Deep-clones `obj` and replaces the values of any keys that match
 * {@link SENSITIVE_KEYS} (case-insensitive) with `"[REDACTED]"`.
 *
 * - Handles plain objects and arrays recursively.
 * - Leaves primitives (string, number, boolean, null, undefined) unchanged.
 * - Non-plain values (Date, Buffer, class instances, …) are returned as-is
 *   after their enumerable properties are sanitised.
 */
export function sanitizeForLog(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLog(item));
  }

  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        sanitized[key] = REDACTED;
      } else {
        sanitized[key] = sanitizeForLog(value);
      }
    }
    return sanitized;
  }

  // primitives — safe to return as-is
  return obj;
}
