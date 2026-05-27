/**
 * Converts values for JSON responses (e.g. Prisma BigInt fields).
 */
export function toJsonSafe<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => (typeof val === 'bigint' ? val.toString() : val))
  ) as T;
}
