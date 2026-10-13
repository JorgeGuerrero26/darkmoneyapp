/**
 * Mini `expect` sobre node:assert para las pruebas que corren con `node --test` (no con Jest):
 * PGlite no funciona dentro del entorno de Jest (usa import.meta), así que la prueba de punta a
 * punta del motor se compila con tsc y se ejecuta directamente con Node, como las demás
 * pruebas de humo del proyecto (npm run test:movements).
 */
import assert from "node:assert/strict";

function matches(actual: unknown, expected: unknown): boolean {
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object") return false;
    return Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
      matches((actual as Record<string, unknown>)[key], value),
    );
  }
  return Object.is(actual, expected);
}

const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

export function expect(actual: any) {
  return {
    toBe: (expected: unknown) => assert.strictEqual(actual, expected),
    toEqual: (expected: unknown) => assert.deepStrictEqual(plain(actual), plain(expected)),
    toHaveLength: (length: number) => assert.strictEqual(actual.length, length),
    toBeNull: () => assert.strictEqual(actual, null),
    toBeDefined: () => assert.notStrictEqual(actual, undefined),
    toContain: (item: unknown) => assert.ok(actual.includes(item), `${JSON.stringify(actual)} no contiene ${JSON.stringify(item)}`),
    toBeGreaterThan: (n: number) => assert.ok(actual > n, `${actual} no es mayor que ${n}`),
    toMatchObject: (expected: unknown) =>
      assert.ok(matches(actual, expected), `${JSON.stringify(actual)} no coincide con ${JSON.stringify(expected)}`),
    not: {
      toBeNull: () => assert.notStrictEqual(actual, null),
      toBe: (expected: unknown) => assert.notStrictEqual(actual, expected),
    },
  };
}
