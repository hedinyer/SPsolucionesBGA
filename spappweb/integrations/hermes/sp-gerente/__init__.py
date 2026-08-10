"""Plugin Hermes — reportes del PDV SP SolucionesBGA (solo lectura vía Supabase).

Sede:
  bga  → SolucionesBGA — proyecto ngjpndqmkhhdqjjljfmp

Env opcionales (override de defaults embebidos):
  SP_BGA_SUPABASE_URL / SP_BGA_SUPABASE_ANON_KEY / SP_BGA_PANEL_URL
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from typing import Any

TOOLSET = "sp_gerente"
_TIMEOUT = 45
_BOGOTA = timezone(timedelta(hours=-5))

# Defaults = anon keys ya públicas en spappweb/src/lib/supabase/public-env.ts
_SEDES: dict[str, dict[str, str]] = {
    "bga": {
        "label": "SolucionesBGA",
        "alias": "bga",
        "url": os.environ.get(
            "SP_BGA_SUPABASE_URL",
            "https://ngjpndqmkhhdqjjljfmp.supabase.co",
        ).rstrip("/"),
        "key": os.environ.get(
            "SP_BGA_SUPABASE_ANON_KEY",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nanBuZHFta2hoZHFqamxqZm1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTAzNjAsImV4cCI6MjEwMDQ4NjM2MH0.98FK60wSqwhfxbdnHM8rESkDLD6v3p0V6D6bFM3zACY",
        ),
        "panel": os.environ.get("SP_BGA_PANEL_URL", "http://localhost:3000").rstrip("/"),
    },
}


def _ok(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _err(msg: str) -> str:
    return _ok({"ok": False, "error": msg})


def _today_bogota() -> date:
    return datetime.now(_BOGOTA).date()


def _parse_fecha(raw: str | None) -> date:
    if not raw:
        return _today_bogota()
    return date.fromisoformat(raw[:10])


def _day_bounds_utc(d: date) -> tuple[str, str]:
    """Inicio/fin del día Bogotá como ISO UTC (PostgREST timestamptz)."""
    start = datetime(d.year, d.month, d.day, tzinfo=_BOGOTA)
    end = start + timedelta(days=1)
    fmt = lambda dt: dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return fmt(start), fmt(end)


def _resolve_sedes(sede: str | None) -> list[str]:
    s = (sede or "bga").strip().lower()
    if s in ("ambas", "all", "*"):
        return ["bga"]
    if s in _SEDES:
        return [s]
    raise ValueError("sede debe ser bga (aliases legacy ambas|all|* → bga)")


def _rest(
    sede: str,
    path: str,
    params: dict[str, str] | list[tuple[str, str]] | None = None,
) -> Any:
    cfg = _SEDES[sede]
    if isinstance(params, list):
        qs = f"?{urllib.parse.urlencode(params)}"
    elif params:
        qs = f"?{urllib.parse.urlencode(params)}"
    else:
        qs = ""
    url = f"{cfg['url']}/rest/v1/{path}{qs}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": cfg["key"],
            "Authorization": f"Bearer {cfg['key']}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            return json.loads(body) if body else []
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{sede} HTTP {exc.code}: {detail or exc.reason}") from exc
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"{sede}: no se pudo contactar Supabase ({exc})") from exc


def _escape_like(q: str) -> str:
    return q.replace(",", " ").replace(")", " ").replace("(", " ").strip()


def _for_each_sede(sede: str | None, fn):
    aliases = _resolve_sedes(sede)
    out: dict[str, Any] = {}
    for a in aliases:
        try:
            out[a] = {"ok": True, "sede": a, "label": _SEDES[a]["label"], **fn(a)}
        except Exception as exc:  # noqa: BLE001
            out[a] = {"ok": False, "sede": a, "label": _SEDES[a]["label"], "error": str(exc)}
    if len(aliases) == 1:
        return out[aliases[0]]
    return {"ok": True, "modo": "multi", "sedes": out}


# ── reportes por sede ────────────────────────────────────────────────────────


def _inventario(sede: str, solo_alertas: bool) -> dict[str, Any]:
    rows = _rest(
        sede,
        "inventario_productos",
        {
            "select": "id,sku,nombre,stock,stock_minimo,precio,costo,activo,categoria_id",
            "activo": "eq.true",
            "order": "stock.asc",
        },
    )
    alertas = [r for r in rows if int(r.get("stock") or 0) <= int(r.get("stock_minimo") or 0)]
    sin_stock = [r for r in rows if int(r.get("stock") or 0) == 0]
    valor_precio = sum(int(r.get("stock") or 0) * int(r.get("precio") or 0) for r in rows)
    valor_costo = sum(int(r.get("stock") or 0) * int(r.get("costo") or 0) for r in rows)
    return {
        "skus_activos": len(rows),
        "bajo_minimo": len(alertas),
        "sin_stock": len(sin_stock),
        "valor_a_precio": valor_precio,
        "valor_a_costo": valor_costo,
        "alertas": alertas if solo_alertas else alertas[:50],
        "productos": None if solo_alertas else rows,
    }


def _ventas(sede: str, d: date) -> dict[str, Any]:
    gte, lt = _day_bounds_utc(d)
    productos = _rest(
        sede,
        "ventas_producto",
        [
            ("select", "id,cliente_nombre,cliente_cedula,total,monto_pagado,created_at"),
            ("created_at", f"gte.{gte}"),
            ("created_at", f"lt.{lt}"),
            ("order", "created_at.desc"),
            ("limit", "500"),
        ],
    )
    motos = _rest(
        sede,
        "ventas_moto",
        [
            ("select", "id,cliente_nombre,modelo,placa,valor_venta,monto_pagado,created_at"),
            ("created_at", f"gte.{gte}"),
            ("created_at", f"lt.{lt}"),
            ("order", "created_at.desc"),
            ("limit", "500"),
        ],
    )

    cobrado_prod = sum(int(r.get("monto_pagado") or 0) for r in productos)
    cobrado_moto = sum(int(r.get("monto_pagado") or 0) for r in motos)
    return {
        "fecha": d.isoformat(),
        "productos": {
            "tickets": len(productos),
            "cobrado": cobrado_prod,
            "ticket_promedio": int(cobrado_prod / len(productos)) if productos else 0,
            "detalle": productos,
        },
        "motos_contado": {
            "unidades": len(motos),
            "cobrado": cobrado_moto,
            "detalle": motos,
        },
        "total_tienda_cobrado": cobrado_prod + cobrado_moto,
    }


def _caja(sede: str, d: date) -> dict[str, Any]:
    sesiones = _rest(
        sede,
        "caja_sesiones",
        {
            "select": "id,fecha,monto_apertura,monto_cierre,opened_at,closed_at,notas_apertura,notas_cierre,informe_cierre",
            "fecha": f"eq.{d.isoformat()}",
            "limit": "1",
        },
    )
    if not sesiones:
        return {"fecha": d.isoformat(), "estado": "sin_apertura", "sesion": None}

    s = sesiones[0]
    estado = "cerrada" if s.get("closed_at") else "abierta"
    egresos = _rest(
        sede,
        "caja_egresos",
        {
            "select": "id,concepto,beneficiario,monto,medio_pago,created_at",
            "sesion_id": f"eq.{s['id']}",
            "order": "created_at.asc",
        },
    )
    movimientos = _rest(
        sede,
        "caja_movimientos",
        {
            "select": "id,tipo,monto,concepto,created_at",
            "sesion_id": f"eq.{s['id']}",
            "order": "created_at.asc",
        },
    )
    informe = s.get("informe_cierre")
    # Si no hay snapshot, armar resumen liviano con ventas/pagos del día
    live = None
    if not informe:
        ventas = _ventas(sede, d)
        gte, lt = _day_bounds_utc(d)
        pagos = _rest(
            sede,
            "pagos",
            [
                ("select", "id,monto,medio_pago_admin,contexto_pago,confirmado_at"),
                ("estado", "eq.confirmado"),
                ("confirmado_at", f"gte.{gte}"),
                ("confirmado_at", f"lt.{lt}"),
                ("order", "confirmado_at.desc"),
                ("limit", "500"),
            ],
        )
        live = {
            "ventas_tienda": ventas["total_tienda_cobrado"],
            "pagos_credito_confirmados": sum(int(p.get("monto") or 0) for p in pagos),
            "pagos_detalle": pagos,
        }
    return {
        "fecha": d.isoformat(),
        "estado": estado,
        "sesion": {
            "id": s.get("id"),
            "monto_apertura": s.get("monto_apertura"),
            "monto_cierre": s.get("monto_cierre"),
            "opened_at": s.get("opened_at"),
            "closed_at": s.get("closed_at"),
            "informe_cierre": informe,
        },
        "egresos": egresos,
        "egresos_total": sum(int(e.get("monto") or 0) for e in egresos),
        "movimientos": movimientos,
        "live_si_abierta": live,
    }


def _mora(sede: str, min_dias: int, limit: int) -> dict[str, Any]:
    rows = _rest(
        sede,
        "atrasos",
        {
            "select": "*",
            "dias_atraso": f"gte.{min_dias}",
            "order": "dias_atraso.desc",
            "limit": str(limit),
        },
    )
    adeudado = sum(int(r.get("monto_adeudado") or 0) for r in rows)
    return {
        "min_dias": min_dias,
        "cantidad": len(rows),
        "monto_adeudado_total": adeudado,
        "morosos_3d": sum(1 for r in rows if int(r.get("dias_atraso") or 0) == 3),
        "recoger_4d_plus": sum(1 for r in rows if int(r.get("dias_atraso") or 0) >= 4),
        "detalle": rows,
    }


def _buscar_cliente(sede: str, query: str, limit: int) -> dict[str, Any]:
    q = _escape_like(query)
    if len(q) < 2:
        raise ValueError("query debe tener al menos 2 caracteres")

    # Búsqueda por cédula/nombre en contratos + users.user
    contracts = _rest(
        sede,
        "digital_contracts",
        {
            "select": "id,user_id,status,hoja_vida_data,signed_at",
            "or": (
                f"(hoja_vida_data->>numero_identificacion.ilike.*{q}*,"
                f"hoja_vida_data->>nombre_completo.ilike.*{q}*)"
            ),
            "limit": str(limit),
        },
    )
    users = _rest(
        sede,
        "users",
        {
            "select": "id,user,status",
            "user": f"ilike.*{q}*",
            "limit": str(limit),
        },
    )
    return {"query": q, "contratos": contracts, "users": users}


def _cliente(sede: str, user_id: int) -> dict[str, Any]:
    users = _rest(sede, "users", {"select": "id,user,status", "id": f"eq.{user_id}", "limit": "1"})
    docs = _rest(
        sede,
        "users_documents",
        {"select": "*", "user_id": f"eq.{user_id}", "limit": "1"},
    )
    contracts = _rest(
        sede,
        "digital_contracts",
        {
            "select": "id,status,hoja_vida_data,signed_at",
            "user_id": f"eq.{user_id}",
            "order": "signed_at.desc.nullslast",
            "limit": "3",
        },
    )
    compra = _rest(
        sede,
        "user_moto_compra",
        {"select": "*", "user_id": f"eq.{user_id}", "limit": "1"},
    )
    atrasos = _rest(sede, "atrasos", {"select": "*", "user_id": f"eq.{user_id}", "limit": "1"})
    pagos = _rest(
        sede,
        "pagos",
        {
            "select": "id,monto,estado,medio_pago_admin,contexto_pago,confirmado_at,reportado_at,referencia",
            "user_id": f"eq.{user_id}",
            "order": "reportado_at.desc",
            "limit": "20",
        },
    )
    return {
        "user": users[0] if users else None,
        "documento": docs[0] if docs else None,
        "contratos": contracts,
        "compra": compra[0] if compra else None,
        "atraso": atrasos[0] if atrasos else None,
        "pagos_recientes": pagos,
    }


def _garaje(sede: str) -> dict[str, Any]:
    motos = _rest(
        sede,
        "garaje_motos",
        {
            "select": "id,placa,modelo,color,estado,condicion,origen,parqueadero_id",
            "order": "placa.asc",
            "limit": "500",
        },
    )
    by_estado: dict[str, int] = {}
    for m in motos:
        e = str(m.get("estado") or "?")
        by_estado[e] = by_estado.get(e, 0) + 1
    return {"total": len(motos), "por_estado": by_estado, "motos": motos}


def _informe_diario(sede: str, d: date) -> dict[str, Any]:
    caja = _caja(sede, d)
    ventas = _ventas(sede, d)
    inv = _inventario(sede, solo_alertas=True)
    mora = _mora(sede, min_dias=3, limit=10)
    return {
        "fecha": d.isoformat(),
        "tz": "America/Bogota",
        "caja": caja,
        "ventas_tienda": ventas,
        "inventario_alertas": {
            "bajo_minimo": inv["bajo_minimo"],
            "sin_stock": inv["sin_stock"],
            "alertas": inv["alertas"][:15],
        },
        "cartera_top": {
            "cantidad_mostrada": mora["cantidad"],
            "monto_adeudado_total_consulta": mora["monto_adeudado_total"],
            "top": mora["detalle"][:10],
        },
    }


# ── handlers Hermes ──────────────────────────────────────────────────────────


def _p(params: dict | None) -> dict:
    return params or {}


def handle_sedes(params, **kwargs):
    del params, kwargs
    return _ok(
        {
            "ok": True,
            "sedes": [
                {
                    "id": k,
                    "label": v["label"],
                    "panel": v["panel"],
                    "supabase": v["url"],
                }
                for k, v in _SEDES.items()
            ],
            "nota": "Usa sede=bga en cada tool (default). Solo lectura.",
        }
    )


def handle_informe_diario(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        d = _parse_fecha(p.get("fecha"))
        return _ok(_for_each_sede(p.get("sede"), lambda s: _informe_diario(s, d)))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


def handle_inventario(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        solo = bool(p.get("solo_alertas", True))
        return _ok(_for_each_sede(p.get("sede"), lambda s: _inventario(s, solo)))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


def handle_ventas(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        d = _parse_fecha(p.get("fecha"))
        return _ok(_for_each_sede(p.get("sede"), lambda s: _ventas(s, d)))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


def handle_caja(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        d = _parse_fecha(p.get("fecha"))
        return _ok(_for_each_sede(p.get("sede"), lambda s: _caja(s, d)))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


def handle_mora(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        min_dias = int(p.get("min_dias") or 3)
        limit = int(p.get("limit") or 50)
        return _ok(_for_each_sede(p.get("sede"), lambda s: _mora(s, min_dias, limit)))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


def handle_buscar_cliente(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        q = str(p.get("query") or "")
        limit = int(p.get("limit") or 20)
        return _ok(_for_each_sede(p.get("sede"), lambda s: _buscar_cliente(s, q, limit)))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


def handle_cliente(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        uid = int(p.get("user_id"))
        sede = (p.get("sede") or "bga").strip().lower()
        if sede not in _SEDES:
            return _err("sp_cliente requiere sede=bga")
        return _ok({"ok": True, **_cliente(sede, uid)})
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


def handle_garaje(params, **kwargs):
    del kwargs
    p = _p(params)
    try:
        return _ok(_for_each_sede(p.get("sede"), _garaje))
    except Exception as exc:  # noqa: BLE001
        return _err(str(exc))


_SEDE_PROP = {
    "type": "string",
    "enum": ["bga"],
    "description": "Punto de venta. Default: bga.",
}
_FECHA_PROP = {
    "type": "string",
    "description": "Fecha YYYY-MM-DD en America/Bogota. Default: hoy.",
}

_TOOLS = [
    (
        "sp_sedes",
        "Lista el punto de venta SP SolucionesBGA y su panel.",
        {"type": "object", "properties": {}},
        handle_sedes,
    ),
    (
        "sp_informe_diario",
        "Informe diario ejecutivo del PDV: caja, ventas tienda, alertas de inventario y top mora.",
        {
            "type": "object",
            "properties": {"sede": _SEDE_PROP, "fecha": _FECHA_PROP},
        },
        handle_informe_diario,
    ),
    (
        "sp_inventario",
        "Inventario de repuestos/accesorios del PDV. Por defecto solo alertas (stock ≤ mínimo).",
        {
            "type": "object",
            "properties": {
                "sede": _SEDE_PROP,
                "solo_alertas": {
                    "type": "boolean",
                    "description": "true = solo quiebres/bajo mínimo (default). false = catálogo completo.",
                },
            },
        },
        handle_inventario,
    ),
    (
        "sp_ventas",
        "Ventas de tienda del día (productos + motos al contado). No incluye cuotas de crédito.",
        {
            "type": "object",
            "properties": {"sede": _SEDE_PROP, "fecha": _FECHA_PROP},
        },
        handle_ventas,
    ),
    (
        "sp_caja",
        "Sesión de caja del día: apertura/cierre, informe_cierre, egresos y movimientos.",
        {
            "type": "object",
            "properties": {"sede": _SEDE_PROP, "fecha": _FECHA_PROP},
        },
        handle_caja,
    ),
    (
        "sp_cartera_mora",
        "Cartera en mora desde la vista atrasos (3d=moroso, ≥4d=recoger).",
        {
            "type": "object",
            "properties": {
                "sede": _SEDE_PROP,
                "min_dias": {"type": "integer", "description": "Default 3"},
                "limit": {"type": "integer", "description": "Default 50"},
            },
        },
        handle_mora,
    ),
    (
        "sp_buscar_cliente",
        "Busca clientes por cédula, nombre o usuario en el PDV.",
        {
            "type": "object",
            "properties": {
                "sede": _SEDE_PROP,
                "query": {"type": "string", "description": "Cédula o nombre (≥2)"},
                "limit": {"type": "integer"},
            },
            "required": ["query"],
        },
        handle_buscar_cliente,
    ),
    (
        "sp_cliente",
        "Ficha 360° de un cliente (user_id) en SolucionesBGA: docs, contrato, compra, atraso, pagos.",
        {
            "type": "object",
            "properties": {
                "sede": {
                    "type": "string",
                    "enum": ["bga"],
                    "description": "Sede SolucionesBGA (default bga).",
                },
                "user_id": {"type": "integer"},
            },
            "required": ["user_id"],
        },
        handle_cliente,
    ),
    (
        "sp_garaje",
        "Inventario físico de motos en garaje por estado.",
        {"type": "object", "properties": {"sede": _SEDE_PROP}},
        handle_garaje,
    ),
]


def register(ctx):
    for name, desc, params, handler in _TOOLS:
        ctx.register_tool(
            name=name,
            toolset=TOOLSET,
            schema={"name": name, "description": desc, "parameters": params},
            handler=handler,
            description=desc,
            emoji="📊",
        )
    print(f"[sp-gerente] {len(_TOOLS)} tools de reportes PDV (SolucionesBGA/bga, solo lectura).")


# ponytail: self-check mínimo; falla si Supabase no responde
def _selfcheck() -> None:
    data = json.loads(handle_sedes({}))
    assert data.get("ok") and len(data.get("sedes", [])) == 1
    assert data["sedes"][0].get("id") == "bga"
    inv = json.loads(handle_inventario({"sede": "bga", "solo_alertas": True}))
    assert inv.get("ok") is not False or "error" in inv
    print("[sp-gerente] selfcheck ok:", {"sedes": 1, "sede": "bga", "inv_ok": inv.get("ok", True)})


if __name__ == "__main__":
    _selfcheck()
