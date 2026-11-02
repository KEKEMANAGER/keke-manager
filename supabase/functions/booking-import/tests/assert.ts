// Tiny assertions on top of Node's built-in assert (no network needed to run the tests).
import * as nodeAssert from 'node:assert/strict';

// deno-lint-ignore no-explicit-any
const node = nodeAssert as any;

export function assertEquals(actual: unknown, expected: unknown, msg?: string): void {
  node.deepStrictEqual(actual, expected, msg);
}

export function assert(condition: unknown, msg?: string): asserts condition {
  node.ok(condition, msg);
}
