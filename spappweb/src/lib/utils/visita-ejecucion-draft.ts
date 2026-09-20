import type {
  VisitaEvidenciaFoto,
  VisitaEvidenciaVideo,
  VisitaUbicacionVerificada,
} from "@/lib/pipeline/types";

export type VisitaEjecucionDraft = {
  fotos: VisitaEvidenciaFoto[];
  videos: VisitaEvidenciaVideo[];
  ubicacion: VisitaUbicacionVerificada | null;
  notas: string;
  savedAt: string;
};

function draftKey(visitaId: string) {
  return `visita-draft:${visitaId}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }
}

function fallbackStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function writeTo(store: Storage, key: string, raw: string) {
  store.setItem(key, raw);
}

export function loadVisitaEjecucionDraft(
  visitaId: string,
): VisitaEjecucionDraft | null {
  const key = draftKey(visitaId);
  const primary = storage();
  const secondary = fallbackStorage();

  for (const store of [primary, secondary]) {
    if (!store) continue;
    try {
      const raw = store.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as Partial<VisitaEjecucionDraft>;
      if (!Array.isArray(parsed.fotos) || !Array.isArray(parsed.videos)) {
        continue;
      }
      return {
        fotos: parsed.fotos,
        videos: parsed.videos,
        ubicacion: parsed.ubicacion ?? null,
        notas: typeof parsed.notas === "string" ? parsed.notas : "",
        savedAt:
          typeof parsed.savedAt === "string"
            ? parsed.savedAt
            : new Date().toISOString(),
      };
    } catch {
      // ignore corrupt draft
    }
  }
  return null;
}

export function saveVisitaEjecucionDraft(
  visitaId: string,
  draft: Omit<VisitaEjecucionDraft, "savedAt">,
): void {
  const key = draftKey(visitaId);
  const payload: VisitaEjecucionDraft = {
    ...draft,
    savedAt: new Date().toISOString(),
  };
  const raw = JSON.stringify(payload);
  const primary = storage();
  const secondary = fallbackStorage();

  try {
    if (primary) writeTo(primary, key, raw);
  } catch {
    try {
      if (secondary) writeTo(secondary, key, raw);
    } catch {
      // quota / private mode
    }
  }
}

export function clearVisitaEjecucionDraft(visitaId: string): void {
  const key = draftKey(visitaId);
  for (const store of [storage(), fallbackStorage()]) {
    try {
      store?.removeItem(key);
    } catch {
      // ignore
    }
  }
}
