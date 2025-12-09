/**
 * Shared utilities for SurrealDB storage domains
 */

/**
 * Normalize SurrealDB record IDs to plain strings
 *
 * SurrealDB returns IDs in formats like:
 * - RecordId object: { tb: "table", id: "uuid" }
 * - String: "mastra_threads:uuid" or "mastra_threads:⟨uuid⟩"
 *
 * This normalizes all formats to just the UUID portion.
 */
export function normalizeId(id: any): string {
  if (!id) return id;

  // Handle SurrealDB RecordId objects
  if (typeof id === 'object' && id.id) {
    return String(id.id);
  }

  // Handle string format like "mastra_threads:uuid" or "mastra_threads:⟨uuid⟩"
  const str = String(id);
  if (str.includes(':')) {
    const parts = str.split(':');
    let idPart = parts.slice(1).join(':');
    // Remove angle brackets if present (⟨ and ⟩)
    idPart = idPart.replace(/^[⟨<]/, '').replace(/[⟩>]$/, '');
    return idPart;
  }

  return str;
}

/**
 * Ensure a value is a Date object
 *
 * SurrealDB may return dates as strings or Date objects depending on context.
 * This ensures consistent Date handling.
 */
export function ensureDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Resolve message limit for pagination
 * Handles Mastra's selectBy.last which can be number | false | undefined
 */
export function resolveMessageLimit(args: { last?: number | false; defaultLimit?: number }): number {
  const { last, defaultLimit = 100 } = args;
  // If last is false or undefined, use default
  if (typeof last !== 'number') return defaultLimit;
  return last;
}
