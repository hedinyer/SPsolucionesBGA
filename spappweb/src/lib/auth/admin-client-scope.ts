/**
 * Admins con vista de clientes limitada a un referral_source.
 *
 * Cada captador (Olga, Neisalinas, …) solo ve clientes de su ?ref= hasta entrega.
 * Todos ellos además ven y gestionan solicitudes/clientes Guillen.
 * Después de entregada/saldada ya no los ve (mora/recoger queda para admin pleno).
 * Inventario/tienda/garaje siguen completos. adminBogota ve todo de principio a fin.
 */
const ADMIN_CLIENT_REFERRAL_SCOPE: Record<number, string> = {
  174: "olga", // Opinilla
  184: "neisalinas",
  185: "sebastianbateca",
  186: "amormio",
  187: "mauricio",
};

const ADMIN_CLIENT_REFERRAL_SCOPE_BY_USER: Record<string, string> = {
  opinilla: "olga",
  neisalinas: "neisalinas",
  "sebastiánbateca": "sebastianbateca",
  sebastianbateca: "sebastianbateca",
  amormio: "amormio",
  mauricio: "mauricio",
};

/** Colas post-entrega que un admin scoped no ve. */
export const SCOPED_ADMIN_HIDDEN_QUEUES = ["morosos", "recoger"] as const;

/** Extras compartidos por todo captador scoped (además de su ?ref=). */
export const SCOPED_ADMIN_SHARED_EXTRAS = ["guillen"] as const;

/** Referrals extras por scope (además de SCOPED_ADMIN_SHARED_EXTRAS). */
export const SCOPED_ADMIN_EXTRA_REFERRALS: Record<string, readonly string[]> =
  {};

export const SCOPED_ADMIN_POST_DELIVERY_ESTADOS = [
  "entregada",
  "saldada",
] as const;

export function referralMatchesAdminScope(
  referralSource: string | null | undefined,
  scope: string | null,
): boolean {
  if (!scope) return true;
  return (referralSource ?? "").trim().toLowerCase() === scope;
}

/** Scope propio + extras compartidos (Guillen) + extras por captador. */
export function referralAllowedForScopedAdmin(
  referralSource: string | null | undefined,
  scope: string | null,
): boolean {
  if (!scope) return true;
  const slug = (referralSource ?? "").trim().toLowerCase();
  if (slug === scope) return true;
  if ((SCOPED_ADMIN_SHARED_EXTRAS as readonly string[]).includes(slug)) {
    return true;
  }
  return (SCOPED_ADMIN_EXTRA_REFERRALS[scope] ?? []).includes(slug);
}

export function isPostDeliveryCompraEstado(
  estado: string | null | undefined,
): boolean {
  return (
    !!estado &&
    (SCOPED_ADMIN_POST_DELIVERY_ESTADOS as readonly string[]).includes(estado)
  );
}

export function resolveAdminClientReferralScope(session: {
  isLoggedIn?: boolean;
  userId?: number;
  username?: string;
}): string | null {
  if (!session.isLoggedIn) return null;
  if (session.userId != null && ADMIN_CLIENT_REFERRAL_SCOPE[session.userId]) {
    return ADMIN_CLIENT_REFERRAL_SCOPE[session.userId];
  }
  const username = session.username?.trim().toLowerCase();
  if (username && ADMIN_CLIENT_REFERRAL_SCOPE_BY_USER[username]) {
    return ADMIN_CLIENT_REFERRAL_SCOPE_BY_USER[username];
  }
  return null;
}

/** null = ve todos los clientes (admin pleno). */
export async function getAdminClientReferralScope(): Promise<string | null> {
  try {
    const { getSession } = await import("@/lib/auth/session");
    return resolveAdminClientReferralScope(await getSession());
  } catch {
    return null;
  }
}
