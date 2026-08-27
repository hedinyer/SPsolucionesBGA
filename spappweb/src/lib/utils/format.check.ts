import assert from "node:assert/strict";
import { formatDateOnly, parseDateOnlyYmd } from "./format-date.ts";

assert.deepEqual(parseDateOnlyYmd("2026-08-24"), { y: 2026, m: 8, d: 24 });
assert.deepEqual(parseDateOnlyYmd("2026-08-24T00:00:00.000Z"), {
  y: 2026,
  m: 8,
  d: 24,
});

const shown = formatDateOnly("2026-08-24");
assert.match(shown, /24/);
assert.doesNotMatch(shown, /23/);

console.log("format.check OK");
