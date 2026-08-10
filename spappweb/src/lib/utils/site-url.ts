export const DEFAULT_SITE_URL = "https://sp-bucaramanga.vercel.app";

export function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  return DEFAULT_SITE_URL;
}

export function visitadorPortalUrl(username?: string | null) {
  const base = `${getSiteUrl()}/visitador/login`;
  const user = username?.trim();
  if (!user) return base;
  return `${base}?u=${encodeURIComponent(user)}`;
}

/** Link público de hoja de vida; `ref` solo si hay que atribuir comisión. */
export function hojaVidaUrl(ref?: string | null) {
  const base = `${getSiteUrl()}/hojadevida`;
  const slug = ref?.trim();
  if (!slug) return base;
  return `${base}?ref=${encodeURIComponent(slug)}`;
}
