import "server-only";

/**
 * Autenticación de la capa de agente IA (Hermes / MCP).
 *
 * El panel usa cookies iron-session; un agente externo no tiene cookie, así que
 * se autentica con un Bearer token estático en el header `Authorization`,
 * comparado contra la variable de entorno `AGENT_API_KEY`.
 */
export function getAgentApiKey(): string {
  return process.env.AGENT_API_KEY?.trim() ?? "";
}

export function hasAgentApiKey(): boolean {
  return getAgentApiKey().length > 0;
}

function extractBearer(authHeader: string | null | undefined): string {
  if (!authHeader) return "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

/** Valida el header `Authorization: Bearer <AGENT_API_KEY>`. */
export function isAgentAuthorized(authHeader: string | null | undefined): boolean {
  const key = getAgentApiKey();
  if (!key) return false;
  const token = extractBearer(authHeader);
  return token.length > 0 && token === key;
}
