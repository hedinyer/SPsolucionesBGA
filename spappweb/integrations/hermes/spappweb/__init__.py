"""Plugin de Hermes Agent para el panel SPapp (spappweb).

Descubre dinámicamente las herramientas publicadas por la web en
`GET {SPAPP_BASE_URL}/api/agent/tools` y registra cada una como una tool de
Hermes. Cada llamada se ejecuta vía `POST {SPAPP_BASE_URL}/api/agent/tools`.

Solo usa la librería estándar (urllib) — sin dependencias externas.

Variables de entorno:
    SPAPP_BASE_URL        ej. https://tu-panel.vercel.app (default http://localhost:3000)
    SPAPP_AGENT_API_KEY   OPCIONAL. Solo si el servidor tiene AGENT_API_KEY puesta.
"""

import json
import os
import urllib.error
import urllib.request

TOOLSET = "spappweb"
_TIMEOUT = 30
_DEFAULT_BASE_URL = "http://localhost:3000"


def _base_url() -> str:
    return (os.environ.get("SPAPP_BASE_URL") or _DEFAULT_BASE_URL).rstrip("/")


def _api_key() -> str:
    return (os.environ.get("SPAPP_AGENT_API_KEY") or "").strip()


def _endpoint() -> str:
    return f"{_base_url()}/api/agent/tools"


def _request(method: str, payload=None):
    """HTTP request (Bearer opcional). Devuelve (status, body_dict)."""
    data = None
    headers = {}
    key = _api_key()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(_endpoint(), data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(body)
        except json.JSONDecodeError:
            return exc.code, {"error": body or exc.reason}
    except Exception as exc:  # noqa: BLE001 - cualquier fallo de red
        return 0, {"error": f"No se pudo contactar SPapp: {exc}"}


def _fetch_catalog():
    status, body = _request("GET")
    if status != 200 or not isinstance(body, dict):
        return []
    return body.get("tools", []) or []


def _make_handler(tool_name: str):
    def handle(params, **kwargs):
        del kwargs
        status, body = _request("POST", {"tool": tool_name, "args": params or {}})
        if status == 200 and isinstance(body, dict) and body.get("ok"):
            return json.dumps(body.get("result"), ensure_ascii=False, default=str)
        error = body.get("error") if isinstance(body, dict) else str(body)
        return json.dumps({"error": error or f"Fallo HTTP {status}"}, ensure_ascii=False)

    return handle


def register(ctx):
    """Punto de entrada del plugin: registra todas las tools de SPapp."""
    catalog = _fetch_catalog()
    if not catalog:
        print(
            "[spappweb] No se pudo descubrir el catálogo de herramientas. "
            "Verifica que la web esté arriba y la API key sea correcta."
        )
        return

    for entry in catalog:
        name = entry.get("name")
        if not name:
            continue
        schema = {
            "name": name,
            "description": entry.get("description", ""),
            "parameters": entry.get("parameters", {"type": "object", "properties": {}}),
        }
        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema=schema,
            handler=_make_handler(name),
            description=entry.get("description", ""),
            emoji="🏍️",
        )

    print(f"[spappweb] {len(catalog)} herramientas registradas desde {_base_url()}.")
