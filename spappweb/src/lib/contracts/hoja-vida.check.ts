import assert from "node:assert";
import {
  buildDireccionNotificaciones,
  patchContratoDataFromHoja,
  type HojaVidaFormData,
} from "./hoja-vida-schema.ts";
import {
  blocksNewDocumentSubmission,
  formatBirthDateInput,
  isFullName,
  isHojaVidaComplete,
} from "./hoja-vida-validation.ts";

const base: HojaVidaFormData = {
  nombre_completo: "Juan Perez Lopez",
  tipo_identificacion: "cc",
  numero_identificacion: "1234567890",
  fecha_nacimiento: "01/01/1990",
  celular: "3001234567",
  direccion: "Calle 1",
  barrio: "Centro",
  correo: "a@b.co",
  trabaja_empresa: true,
  nombre_empresa: "Empresa SA",
  telefono_empresa: "",
  direccion_empresa: "",
  independiente: null,
  habilidad: "",
  estado_civil: "soltero",
  nombre_conyuge: "",
  celular_conyuge: "",
  referencias: [
    { nombre: "Ana Maria Gomez", celular: "3009876543" },
    { nombre: "Pedro Luis Diaz", celular: "3011111111" },
  ],
};

assert.strictEqual(isFullName("Juan Perez"), true);
assert.strictEqual(isFullName("Juan"), false);
assert.strictEqual(formatBirthDateInput("15031990"), "15/03/1990");
assert.strictEqual(isHojaVidaComplete(base), true);
assert.strictEqual(
  isHojaVidaComplete({ ...base, trabaja_empresa: false, habilidad: "" }),
  false,
);
assert.strictEqual(
  blocksNewDocumentSubmission({ estado_solicitud: "pendiente", betado: false }),
  "Ya tienes una solicitud en proceso.",
);
assert.strictEqual(blocksNewDocumentSubmission(null), null);

assert.strictEqual(
  buildDireccionNotificaciones(base),
  "Calle 1, barrio Centro",
);
const patched = patchContratoDataFromHoja(
  { moto_placa: "ABC123", nombre_contratante: "Viejo" },
  base,
);
assert.strictEqual(patched.nombre_contratante, "Juan Perez Lopez");
assert.strictEqual(patched.cedula_contratante, "1234567890");
assert.strictEqual(patched.tipo_documento_contratante, "cc");
assert.strictEqual(patched.direccion_notificaciones, "Calle 1, barrio Centro");
assert.strictEqual(patched.moto_placa, "ABC123");

console.log("hoja-vida.check OK");
