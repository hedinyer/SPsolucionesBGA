/**
 * Claves personales para firmar ediciones/eliminaciones de inventario.
 * Agregar aquí nuevos códigos cuando entren más personas.
 */
export const INVENTARIO_EDITOR_CODIGOS = {
  "0929": "Olga Pinilla",
  "0655": "Yenifer",
} as const satisfies Record<string, string>;

export type InventarioEditorCodigo = keyof typeof INVENTARIO_EDITOR_CODIGOS;

export function resolveInventarioEditorCodigo(
  codigo: string,
): string | null {
  const key = codigo.trim();
  if (!key) return null;
  return (
    (INVENTARIO_EDITOR_CODIGOS as Record<string, string>)[key] ?? null
  );
}
