export async function retryAsync<T>(
  fn: () => Promise<T>,
  opts?: {
    attempts?: number;
    delayMs?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  let delay = opts?.delayMs ?? 1000;
  let lastError: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (i < attempts) {
        opts?.onRetry?.(i, e);
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  throw lastError;
}
