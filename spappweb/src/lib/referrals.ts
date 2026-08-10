/** Fuentes de captación con link propio de hoja de vida (comisiones). */
export const REFERRAL_SOURCES = [
  { slug: "punto-de-venta", label: "Punto de venta" },
  { slug: "guillen", label: "Guillen" },
  { slug: "yhosmer", label: "Yhosmer" },
  { slug: "fabian", label: "Fabian" },
  { slug: "olga", label: "Olga" },
  { slug: "neisalinas", label: "Neisalinas" },
  { slug: "sebastianbateca", label: "Sebastián" },
  { slug: "amormio", label: "Amormio" },
  { slug: "mauricio", label: "Mauricio" },
  { slug: "call-center", label: "Call center" },
] as const;

export type ReferralSlug = (typeof REFERRAL_SOURCES)[number]["slug"];

/**
 * Captadores especiales (métricas/equipo/listas Guillen).
 * El link ?ref=guillen sigue guardando referral_source.
 */
export const HIDDEN_REFERRAL_SLUGS = ["guillen"] as const;

/** Captadores de otros PDV: no links ni ranking en Equipo de SolucionesBGA. */
export const HIDDEN_EQUIPO_SLUGS = ["yhosmer"] as const;

/**
 * Guillen creado antes de este instante va a "Clientes (Guillen)".
 * Desde aquí en adelante entra a "Revisar solicitudes" como el resto.
 */
export const GUILLEN_INBOX_CUTOFF_ISO = "2026-08-04T18:00:00.000Z";

export function isHiddenReferral(raw: string | null | undefined): boolean {
  const slug = raw?.trim().toLowerCase();
  return (
    !!slug &&
    (HIDDEN_REFERRAL_SLUGS as readonly string[]).includes(slug)
  );
}

export function isHiddenEquipoReferral(raw: string | null | undefined): boolean {
  const slug = raw?.trim().toLowerCase();
  return (
    !!slug &&
    ((HIDDEN_REFERRAL_SLUGS as readonly string[]).includes(slug) ||
      (HIDDEN_EQUIPO_SLUGS as readonly string[]).includes(slug))
  );
}

/** Guillen legacy (antes del corte) → cola propia; Guillen nuevo → flujo normal. */
export function isSegregatedInboxReferral(
  raw: string | null | undefined,
  createdAt: string | null | undefined,
): boolean {
  if (!isHiddenReferral(raw)) return false;
  if (!createdAt) return true;
  return new Date(createdAt).getTime() < new Date(GUILLEN_INBOX_CUTOFF_ISO).getTime();
}

const KNOWN = new Set(REFERRAL_SOURCES.map((s) => s.slug));

/** Solo acepta slugs conocidos (ignora basura en la URL). */
export function parseReferralSource(
  raw: string | null | undefined,
): string | null {
  const slug = raw?.trim().toLowerCase();
  if (!slug || !KNOWN.has(slug as ReferralSlug)) return null;
  return slug;
}

/**
 * Sin `ref` (URL /hojadevida) = punto de venta.
 * También vale ?ref=punto-de-venta.
 * ?ref=guillen se guarda como guillen (cola propia solo si es anterior al corte).
 */
export function resolveReferralSource(
  raw: string | null | undefined,
): ReferralSlug {
  return (parseReferralSource(raw) as ReferralSlug | null) ?? "punto-de-venta";
}

/** Ranking de compras: Guillen suma a punto de venta. Hojas/link siguen omitiéndolo. */
export function purchaseLeaderboardReferral(
  raw: string | null | undefined,
): ReferralSlug {
  return isHiddenReferral(raw) ? "punto-de-venta" : resolveReferralSource(raw);
}

export function referralLabel(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const found = REFERRAL_SOURCES.find((s) => s.slug === slug);
  return found?.label ?? slug;
}

/** Referidos cuya visita solo puede ir al visitador con el mismo nombre. */
export const REFERRAL_LOCKED_VISITADOR_SLUGS = ["yhosmer"] as const;

function normalizeVisitadorSlug(nombre: string): string {
  return nombre
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "-");
}

export function visitadorMatchesReferral(
  visitadorNombre: string,
  referralSlug: ReferralSlug,
): boolean {
  return normalizeVisitadorSlug(visitadorNombre) === referralSlug;
}

/** Punto de venta / Fabian / Guillen → todos; Yhosmer → solo el visitador homónimo. */
export function filterVisitadoresForReferral<T extends { nombre: string }>(
  visitadores: T[],
  referralSource: string | null | undefined,
): T[] {
  const slug = resolveReferralSource(referralSource);
  if (
    !(REFERRAL_LOCKED_VISITADOR_SLUGS as readonly string[]).includes(slug)
  ) {
    return visitadores;
  }
  return visitadores.filter((v) => visitadorMatchesReferral(v.nombre, slug));
}

export function assertVisitadorAllowedForReferral(
  visitadorNombre: string,
  referralSource: string | null | undefined,
): void {
  const slug = resolveReferralSource(referralSource);
  if (
    !(REFERRAL_LOCKED_VISITADOR_SLUGS as readonly string[]).includes(slug)
  ) {
    return;
  }
  if (!visitadorMatchesReferral(visitadorNombre, slug)) {
    const label = referralLabel(slug) ?? slug;
    throw new Error(
      `Este cliente fue referido por ${label}. La visita solo puede asignarse a ${label}.`,
    );
  }
}

export type LeaderboardRow = {
  slug: string;
  label: string;
  count: number;
  rank: number;
};

export type ReferralLeaderboardRow = LeaderboardRow;

/** Empates comparten rango. */
export function rankLeaderboard(
  rows: { slug: string; label: string; count: number }[],
): LeaderboardRow[] {
  const sorted = [...rows].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  let rank = 0;
  let prev = -1;
  return sorted.map((row, i) => {
    if (row.count !== prev) {
      rank = i + 1;
      prev = row.count;
    }
    return { ...row, rank };
  });
}

/** Ranking por clientes captados; empates comparten rango. */
export function buildReferralLeaderboard(
  counts: Record<string, number>,
): ReferralLeaderboardRow[] {
  return rankLeaderboard(
    REFERRAL_SOURCES.filter((s) => !isHiddenEquipoReferral(s.slug)).map(
      (s) => ({
        slug: s.slug,
        label: s.label,
        count: counts[s.slug] ?? 0,
      }),
    ),
  );
}

/**
 * Ciclos intercalados (Bogotá, extremos inclusive):
 * 20 del mes → 5 del siguiente, luego 5 → 20 del mismo mes, y así.
 * key = fecha de inicio YYYY-MM-DD (día 05 o 20).
 */
export type CommissionPeriod = {
  key: string;
  startIso: string;
  endExclusiveIso: string;
  label: string;
};

type PeriodStartDay = 5 | 20;

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function bogotaYmd(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? NaN);
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** Instantáneo Bogotá → ISO UTC. */
function bogotaDayStartIso(y: number, m: number, d: number) {
  return new Date(
    `${y}-${pad2(m)}-${pad2(d)}T00:00:00.000-05:00`,
  ).toISOString();
}

function addCalendarMonths(y: number, m: number, delta: number) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

const MONTH_LABEL = new Intl.DateTimeFormat("es-CO", {
  month: "short",
  timeZone: "UTC",
});

function monthShort(y: number, m: number) {
  return MONTH_LABEL.format(new Date(Date.UTC(y, m - 1, 1))).replace(/\.$/, "");
}

function buildCommissionPeriod(
  y: number,
  m: number,
  startDay: PeriodStartDay,
): CommissionPeriod {
  if (startDay === 20) {
    const next = addCalendarMonths(y, m, 1);
    return {
      key: `${y}-${pad2(m)}-20`,
      startIso: bogotaDayStartIso(y, m, 20),
      // inclusive hasta el 5 → fin exclusivo = 6
      endExclusiveIso: bogotaDayStartIso(next.y, next.m, 6),
      label: `20 ${monthShort(y, m)} – 5 ${monthShort(next.y, next.m)} ${next.y}`,
    };
  }
  return {
    key: `${y}-${pad2(m)}-05`,
    startIso: bogotaDayStartIso(y, m, 5),
    // inclusive hasta el 20 → fin exclusivo = 21
    endExclusiveIso: bogotaDayStartIso(y, m, 21),
    label: `5 ${monthShort(y, m)} – 20 ${monthShort(y, m)} ${y}`,
  };
}

export function commissionPeriodFromKey(key: string): CommissionPeriod | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (full) {
    const y = Number(full[1]);
    const month = Number(full[2]);
    const day = Number(full[3]);
    if (month < 1 || month > 12) return null;
    if (day !== 5 && day !== 20) return null;
    return buildCommissionPeriod(y, month, day as PeriodStartDay);
  }
  // Compat: YYYY-MM = ciclo que empieza el 20 de ese mes.
  const legacy = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!legacy) return null;
  const y = Number(legacy[1]);
  const month = Number(legacy[2]);
  if (month < 1 || month > 12) return null;
  return buildCommissionPeriod(y, month, 20);
}

/** Periodo vigente para `now` (Bogotá). */
export function currentCommissionPeriod(now = new Date()): CommissionPeriod {
  const { y, m, d } = bogotaYmd(now);
  if (d >= 20) return buildCommissionPeriod(y, m, 20);
  if (d >= 5) return buildCommissionPeriod(y, m, 5);
  const prev = addCalendarMonths(y, m, -1);
  return buildCommissionPeriod(prev.y, prev.m, 20);
}

/** Avanza/retrocede periodos intercalados (20→5, 5→20, …). */
export function shiftCommissionPeriod(
  key: string,
  deltaSteps: number,
): CommissionPeriod | null {
  const cur = commissionPeriodFromKey(key);
  if (!cur || deltaSteps === 0) return cur;
  const parts = /^(\d{4})-(\d{2})-(05|20)$/.exec(cur.key);
  if (!parts) return null;
  let y = Number(parts[1]);
  let m = Number(parts[2]);
  let day = Number(parts[3]) as PeriodStartDay;
  const dir = deltaSteps > 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(deltaSteps); i++) {
    if (dir > 0) {
      if (day === 20) {
        const next = addCalendarMonths(y, m, 1);
        y = next.y;
        m = next.m;
        day = 5;
      } else {
        day = 20;
      }
    } else if (day === 5) {
      const prev = addCalendarMonths(y, m, -1);
      y = prev.y;
      m = prev.m;
      day = 20;
    } else {
      day = 5;
    }
  }
  return buildCommissionPeriod(y, m, day);
}
