export function normalizarPlaca(placa: string): string {
  return placa.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** Placas viejas con H final: ABC12H */
const PATRON_PLACA_MOTO_H = /[A-Z]{3}-?\d{2}H\b/gi;
/** ABC12 sin carácter final (no consume ABC12I) */
const PATRON_PLACA_CINCO = /[A-Z]{3}\d{2}(?![A-Z0-9])/gi;
/** ABC123 */
const PATRON_PLACA_LEGACY = /[A-Z]{3}\d{3}\b/gi;
/** ABC12I, CII17I (letra/dígito final distinto de solo el bloque de 5) */
const PATRON_PLACA_LETRA_FINAL = /[A-Z]{3}\d{2}[A-Z0-9]\b/gi;

/**
 * Variantes toleradas al buscar GPS.
 * Solo ABC12 ↔ ABC12H (formato viejo). Nunca colapsar ABC12I → ABC12.
 */
export function variantesPlaca(placa: string): string[] {
  const norm = normalizarPlaca(placa);
  if (!norm) return [];
  const variantes = new Set<string>([norm]);
  if (/^[A-Z]{3}\d{2}H$/.test(norm)) {
    variantes.add(norm.slice(0, -1));
  } else if (/^[A-Z]{3}\d{2}$/.test(norm)) {
    variantes.add(`${norm}H`);
  }
  return [...variantes];
}

function registrarPlaca(claves: Set<string>, placaRaw: string): void {
  const limpia = placaRaw.trim();
  if (!limpia) return;
  for (const variante of variantesPlaca(limpia)) {
    claves.add(variante);
  }
}

/** Placa cuando el nombre del dispositivo es la placa exacta (ej. CII17I). */
export function placaDesdeNombreDispositivo(nombre: string): string | null {
  const token = normalizarPlaca(
    String(nombre ?? "")
      .trim()
      .split(/\s+/)[0] ?? "",
  );
  if (!/^[A-Z0-9]{5,7}$/.test(token)) return null;
  if (
    /^[A-Z]{3}\d{2}[A-Z0-9]$/.test(token) ||
    /^[A-Z]{3}\d{3}$/.test(token) ||
    /^[A-Z]{3}\d{2}H?$/.test(token)
  ) {
    return token;
  }
  return null;
}

export function extraerPlacasDeTexto(texto: string): string[] {
  const raw = String(texto ?? "").toUpperCase();
  const encontradas = new Set<string>();

  // Letra final primero para no perder ABC12I como ABC12.
  for (const match of raw.matchAll(PATRON_PLACA_LETRA_FINAL)) {
    registrarPlaca(encontradas, match[0]);
  }
  for (const match of raw.matchAll(PATRON_PLACA_MOTO_H)) {
    registrarPlaca(encontradas, match[0]);
  }
  for (const match of raw.matchAll(PATRON_PLACA_CINCO)) {
    registrarPlaca(encontradas, match[0]);
  }
  for (const match of raw.matchAll(PATRON_PLACA_LEGACY)) {
    registrarPlaca(encontradas, match[0]);
  }

  const directa = placaDesdeNombreDispositivo(raw);
  if (directa) registrarPlaca(encontradas, directa);

  const primero = raw.trim().split(/\s+/)[0] ?? "";
  if (/^[A-Z]{3}-?\d{2,3}[A-Z0-9]?$/i.test(primero)) {
    registrarPlaca(encontradas, primero);
  }

  return [...encontradas];
}

/** ponytail: falla si el match flojo vuelve a colisionar I con H. */
export function runPlacaGpsSelfCheck(): void {
  const v = variantesPlaca("JQX32I");
  if (v.some((x) => x === "JQX32" || x === "JQX32H")) {
    throw new Error("variantesPlaca no debe colisionar JQX32I con JQX32/H");
  }
  const extraidas = extraerPlacasDeTexto("JQX32I");
  if (!extraidas.includes("JQX32I")) {
    throw new Error("extraerPlacasDeTexto debe reconocer JQX32I");
  }
  if (extraidas.includes("JQX32H")) {
    throw new Error("extraerPlacasDeTexto no debe inventar JQX32H desde JQX32I");
  }
  const h = variantesPlaca("ABC12H");
  if (!h.includes("ABC12") || !h.includes("ABC12H")) {
    throw new Error("variantesPlaca debe seguir tolerando sufijo H histórico");
  }
}
