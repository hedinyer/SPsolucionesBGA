export function readDraft<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeDraft<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(data));
  } catch {
    // sessionStorage full — ignore
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(key);
}
