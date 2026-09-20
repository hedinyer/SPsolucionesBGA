export type ConductorInfo = {
  nombre: string;
  cedula: string;
  celular: string | null;
  notas: string | null;
  cedula_url: string | null;
  foto_url: string | null;
  updated_at: string;
};

export function parseConductorInfo(
  adminData: Record<string, unknown> | null | undefined,
): ConductorInfo | null {
  if (!adminData || typeof adminData !== "object") return null;
  const raw = adminData.conductor;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const c = raw as Record<string, unknown>;
  const nombre = typeof c.nombre === "string" ? c.nombre.trim() : "";
  const cedula = typeof c.cedula === "string" ? c.cedula.trim() : "";
  if (!nombre && !cedula && !c.cedula_url && !c.foto_url) return null;

  return {
    nombre,
    cedula,
    celular:
      typeof c.celular === "string" && c.celular.trim()
        ? c.celular.trim()
        : null,
    notas:
      typeof c.notas === "string" && c.notas.trim() ? c.notas.trim() : null,
    cedula_url:
      typeof c.cedula_url === "string" && c.cedula_url.trim()
        ? c.cedula_url.trim()
        : null,
    foto_url:
      typeof c.foto_url === "string" && c.foto_url.trim()
        ? c.foto_url.trim()
        : null,
    updated_at:
      typeof c.updated_at === "string" && c.updated_at
        ? c.updated_at
        : new Date().toISOString(),
  };
}
