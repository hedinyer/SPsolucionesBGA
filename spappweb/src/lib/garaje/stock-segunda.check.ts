import assert from "node:assert/strict";
import { bikeStockKey, countStockSegundaMano } from "./stock-segunda.ts";

assert.equal(bikeStockKey(" A ", " B "), "A|B");

const counts = countStockSegundaMano([
  {
    id: "a",
    modelo: "M1",
    color: "NEGRO",
    condicion: "segunda_mano",
    estado: "disponible",
  },
  {
    id: "b",
    modelo: "M1",
    color: "NEGRO",
    condicion: "segunda_mano",
    estado: "en_garaje",
  },
  {
    id: "c",
    modelo: "M1",
    color: "NEGRO",
    condicion: "segunda_mano",
    estado: "vendida",
  },
  {
    id: "d",
    modelo: "M1",
    color: "NEGRO",
    condicion: "nueva",
    estado: "disponible",
  },
  {
    id: "e",
    modelo: "M2",
    color: "ROJO",
    condicion: "segunda_mano",
    estado: "en_mantenimiento",
  },
] as Parameters<typeof countStockSegundaMano>[0]);

assert.equal(counts["M1|NEGRO"], 2);
assert.equal(counts["M2|ROJO"], 1);
assert.equal(counts["M1|AZUL"], undefined);

console.log("stock-segunda.check: ok");
