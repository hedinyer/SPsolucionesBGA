export function normalizeReferencia(referencia: string): string {
  return referencia.trim().toUpperCase();
}

export function isReferenciaDuplicada(
  referencia: string,
  usadas: Iterable<string>,
): boolean {
  const normalizada = normalizeReferencia(referencia);
  if (!normalizada) return false;

  for (const item of usadas) {
    if (normalizeReferencia(item) === normalizada) return true;
  }

  return false;
}
