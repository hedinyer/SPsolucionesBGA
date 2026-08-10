import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marca request-scoped que indica que la ejecución actual proviene de la capa de
 * agente IA (ruta `/api/agent/tools`). Permite que `requireAdminSession()` otorgue
 * permisos admin a las server actions invocadas por el agente, sin cookie ni token,
 * SIN abrir ese permiso al resto de la app (el flag solo vive dentro de
 * `runAsAgent`).
 *
 * Se mantiene fuera del grafo estático de `middleware` (edge): `session.ts` lo
 * importa dinámicamente solo en runtime Node.
 */
const storage = new AsyncLocalStorage<boolean>();

export function runAsAgent<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run(true, fn);
}

export function isInAgentContext(): boolean {
  return storage.getStore() === true;
}
