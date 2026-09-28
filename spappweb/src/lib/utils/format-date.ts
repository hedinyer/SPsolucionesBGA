const TZ_BOGOTA = "America/Bogota";
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.\d+)?(?:Z|[+-]00:00)?)?$/;
/** Node ICU usa NBSP/NNBSP en "p. m."; el browser usa espacio normal. */
const LOCALE_SPACE = /[\u00a0\u202f]/g;

function formatLocale(value: string): string {
  return value.replace(LOCALE_SPACE, " ");
}

/** Fecha de calendario YYYY-MM-DD (sin corrimiento UTC→Bogotá). */
export function parseDateOnlyYmd(
  value: string | Date | null | undefined,
): { y: number; m: number; d: number } | null {
  if (!value) return null;
  const raw = typeof value === "string" ? value.trim() : "";
  if (raw) {
    const match = DATE_ONLY.exec(raw);
    if (match) {
      return {
        y: Number(match[1]),
        m: Number(match[2]),
        d: Number(match[3]),
      };
    }
  }
  const instant = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(instant.getTime())) return null;
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ_BOGOTA }).format(
    instant,
  );
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

function formatEsCoDate(y: number, m: number, d: number): string {
  return formatLocale(
    new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeZone: TZ_BOGOTA,
    }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0))),
  );
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return formatLocale(
    new Intl.DateTimeFormat("es-CO", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: TZ_BOGOTA,
    }).format(d),
  );
}

export function formatDateOnly(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const parts = parseDateOnlyYmd(date);
  if (!parts) return "—";
  return formatEsCoDate(parts.y, parts.m, parts.d);
}
