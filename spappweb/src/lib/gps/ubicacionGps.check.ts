import assert from "node:assert/strict";
import {
  etiquetaProveedorGps,
  gpsMotoDesdeProveedor,
  resolverProveedorGps,
  runUbicacionGpsSelfCheck,
} from "./ubicacionGps.ts";

runUbicacionGpsSelfCheck();

assert.equal(resolverProveedorGps("IOP GPS"), "iopgps");
assert.equal(resolverProveedorGps("ds_track"), "dstrack");
assert.equal(resolverProveedorGps("Traccar"), "dstrack");
assert.equal(gpsMotoDesdeProveedor("system_track"), "system track");
assert.equal(etiquetaProveedorGps("system_track"), "System Track");

console.log("ubicacionGps.check OK");
