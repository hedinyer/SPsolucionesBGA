import assert from "node:assert";
import {
  assertVisitadorAllowedForReferral,
  buildReferralLeaderboard,
  commissionPeriodFromKey,
  currentCommissionPeriod,
  filterVisitadoresForReferral,
  GUILLEN_INBOX_CUTOFF_ISO,
  isHiddenEquipoReferral,
  isHiddenReferral,
  isSegregatedInboxReferral,
  parseReferralSource,
  purchaseLeaderboardReferral,
  rankLeaderboard,
  referralLabel,
  resolveReferralSource,
  shiftCommissionPeriod,
  visitadorMatchesReferral,
} from "./referrals.ts";

assert.equal(parseReferralSource("guillen"), "guillen");
assert.equal(isHiddenReferral("guillen"), true);
assert.equal(isHiddenReferral("Guillen"), true);
assert.equal(isHiddenReferral("yhosmer"), false);
assert.equal(isHiddenEquipoReferral("yhosmer"), true);
assert.equal(isHiddenEquipoReferral("fabian"), false);
assert.equal(isHiddenReferral(null), false);
assert.equal(
  isSegregatedInboxReferral("guillen", "2026-08-01T12:00:00.000Z"),
  true,
);
assert.equal(
  isSegregatedInboxReferral("guillen", GUILLEN_INBOX_CUTOFF_ISO),
  false,
);
assert.equal(
  isSegregatedInboxReferral("guillen", "2026-08-05T00:00:00.000Z"),
  false,
);
assert.equal(isSegregatedInboxReferral("fabian", "2026-08-01T12:00:00.000Z"), false);
assert.equal(isSegregatedInboxReferral("guillen", null), true);
assert.equal(parseReferralSource("Yhosmer"), "yhosmer");
assert.equal(parseReferralSource("fabian"), "fabian");
assert.equal(parseReferralSource("olga"), "olga");
assert.equal(parseReferralSource("neisalinas"), "neisalinas");
assert.equal(parseReferralSource("sebastianbateca"), "sebastianbateca");
assert.equal(parseReferralSource("amormio"), "amormio");
assert.equal(parseReferralSource("mauricio"), "mauricio");
assert.equal(parseReferralSource("call-center"), "call-center");
assert.equal(parseReferralSource("punto-de-venta"), "punto-de-venta");
assert.equal(parseReferralSource("hacker"), null);
assert.equal(referralLabel("fabian"), "Fabian");
assert.equal(referralLabel("olga"), "Olga");
assert.equal(referralLabel("neisalinas"), "Neisalinas");
assert.equal(referralLabel("guillen"), "Guillen");
assert.equal(referralLabel("call-center"), "Call center");
assert.equal(resolveReferralSource(null), "punto-de-venta");
assert.equal(resolveReferralSource(""), "punto-de-venta");
assert.equal(resolveReferralSource("guillen"), "guillen");
assert.equal(resolveReferralSource("olga"), "olga");
assert.equal(resolveReferralSource("mauricio"), "mauricio");
assert.equal(resolveReferralSource("call-center"), "call-center");
assert.equal(purchaseLeaderboardReferral("guillen"), "punto-de-venta");
assert.equal(purchaseLeaderboardReferral(null), "punto-de-venta");
assert.equal(purchaseLeaderboardReferral("yhosmer"), "yhosmer");

const board = buildReferralLeaderboard({
  yhosmer: 5,
  fabian: 5,
  "punto-de-venta": 2,
  olga: 0,
  guillen: 99,
});
assert.equal(board[0].rank, 1);
assert.equal(board[0].slug, "fabian");
assert.equal(board[1].rank, 2);
assert.equal(board[1].slug, "punto-de-venta");
assert.ok(board.some((r) => r.slug === "olga"));
assert.ok(board.some((r) => r.slug === "neisalinas"));
assert.ok(board.some((r) => r.slug === "sebastianbateca"));
assert.ok(board.some((r) => r.slug === "amormio"));
assert.ok(board.some((r) => r.slug === "mauricio"));
assert.ok(board.some((r) => r.slug === "call-center"));
assert.equal(board.length, 8);
assert.equal(
  board.find((r) => r.slug === "guillen"),
  undefined,
);
assert.equal(
  board.find((r) => r.slug === "yhosmer"),
  undefined,
);

const visitadores = [
  { id: 1, nombre: "Guillen" },
  { id: 2, nombre: "Yhosmer" },
  { id: 3, nombre: "Fabian" },
  { id: 4, nombre: "Otro" },
];
// Guillen se guarda en DB pero aquí no tiene lock de visitador.
assert.deepEqual(
  filterVisitadoresForReferral(visitadores, "guillen").map((v) => v.id),
  [1, 2, 3, 4],
);
assert.deepEqual(
  filterVisitadoresForReferral(visitadores, "yhosmer").map((v) => v.id),
  [2],
);
// Fabian/Olga son captadores, no visitadores: puede asignarse a cualquiera.
assert.deepEqual(
  filterVisitadoresForReferral(visitadores, "fabian").map((v) => v.id),
  [1, 2, 3, 4],
);
assert.deepEqual(
  filterVisitadoresForReferral(visitadores, "olga").map((v) => v.id),
  [1, 2, 3, 4],
);
assert.deepEqual(
  filterVisitadoresForReferral(visitadores, null).map((v) => v.id),
  [1, 2, 3, 4],
);
assert.equal(visitadorMatchesReferral("Yhosmer", "yhosmer"), true);
assert.throws(
  () => assertVisitadorAllowedForReferral("Otro", "yhosmer"),
  /referido por Yhosmer/,
);
assertVisitadorAllowedForReferral("Yhosmer", "yhosmer");
assertVisitadorAllowedForReferral("Otro", "fabian");
assertVisitadorAllowedForReferral("Otro", "olga");
assertVisitadorAllowedForReferral("Otro", "punto-de-venta");
assertVisitadorAllowedForReferral("Otro", "guillen");

const visitadoresBoard = rankLeaderboard([
  { slug: "1", label: "Guillen", count: 3 },
  { slug: "2", label: "Yhosmer", count: 3 },
  { slug: "3", label: "Otro", count: 1 },
]);
assert.equal(visitadoresBoard[0].rank, 1);
assert.equal(visitadoresBoard[1].rank, 1);
assert.equal(visitadoresBoard[2].rank, 3);

const jul = commissionPeriodFromKey("2026-07-20");
assert.ok(jul);
assert.equal(jul!.key, "2026-07-20");
assert.equal(jul!.startIso, new Date("2026-07-20T00:00:00.000-05:00").toISOString());
assert.equal(jul!.endExclusiveIso, new Date("2026-08-06T00:00:00.000-05:00").toISOString());
assert.match(jul!.label, /20.*– 5/);

const legacy = commissionPeriodFromKey("2026-07");
assert.equal(legacy?.key, "2026-07-20");

const mid5 = commissionPeriodFromKey("2026-08-05");
assert.ok(mid5);
assert.equal(mid5!.startIso, new Date("2026-08-05T00:00:00.000-05:00").toISOString());
assert.equal(mid5!.endExclusiveIso, new Date("2026-08-21T00:00:00.000-05:00").toISOString());
assert.match(mid5!.label, /5.*– 20/);

// 1–4 ago → aún en 20 jul–5 ago; 5–19 → 5–20 ago; ≥20 → 20 ago–5 sep
assert.equal(
  currentCommissionPeriod(new Date("2026-08-03T12:00:00-05:00")).key,
  "2026-07-20",
);
assert.equal(
  currentCommissionPeriod(new Date("2026-07-15T15:00:00-05:00")).key,
  "2026-07-05",
);
assert.equal(
  currentCommissionPeriod(new Date("2026-07-25T12:00:00-05:00")).key,
  "2026-07-20",
);
assert.equal(
  currentCommissionPeriod(new Date("2026-08-10T12:00:00-05:00")).key,
  "2026-08-05",
);

assert.equal(shiftCommissionPeriod("2026-07-20", 1)?.key, "2026-08-05");
assert.equal(shiftCommissionPeriod("2026-08-05", 1)?.key, "2026-08-20");
assert.equal(shiftCommissionPeriod("2026-07-20", -1)?.key, "2026-07-05");
assert.equal(shiftCommissionPeriod("2026-07-05", -1)?.key, "2026-06-20");
assert.equal(shiftCommissionPeriod("2026-07", 1)?.key, "2026-08-05");

console.log("referrals.check: ok");
