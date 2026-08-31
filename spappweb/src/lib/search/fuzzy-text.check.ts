import assert from "node:assert/strict";
import {
  diceCoefficient,
  editSimilarity,
  normalizeSearch,
  rankBySimilarity,
  similarityScore,
} from "./fuzzy-text.ts";

assert.equal(normalizeSearch("Batería"), "bateria");
assert.equal(normalizeSearch("CELULAR"), "celular");

{
  const s = similarityScore("celualr", "Celular Samsung");
  assert.ok(s >= 0.45, `celualr vs Celular Samsung: ${s}`);
}

{
  const s = similarityScore("baterai", "Batería iPhone");
  assert.ok(s >= 0.45, `baterai vs Batería: ${s}`);
}

{
  const s = similarityScore("baterai samsung", "Batería Samsung");
  assert.ok(s >= 0.45, `multi-token typo: ${s}`);
}

{
  const s = similarityScore("zzzzqqq", "Celular Samsung");
  assert.ok(s < 0.45, `garbage should be low: ${s}`);
}

{
  const items = [
    { id: 1, nombre: "Cable USB" },
    { id: 2, nombre: "Celular Samsung A15" },
    { id: 3, nombre: "Cargador tipo C" },
  ];
  const ranked = rankBySimilarity(
    "celualr",
    items,
    (i) => normalizeSearch(i.nombre),
    { threshold: 0.45, limit: 20 },
  );
  assert.ok(ranked.length >= 1, "should find approximate matches");
  assert.equal(ranked[0]!.item.id, 2);
}

assert.ok(diceCoefficient("celular", "celualr") >= 0.5);
assert.ok(editSimilarity("bateria", "baterai") >= 0.7);

console.log("fuzzy-text.check.ts: ok");
