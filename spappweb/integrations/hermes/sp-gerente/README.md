# Plugin Hermes — SP Gerente (SolucionesBGA)

Lectura directa al proyecto Supabase **sp_SolucionesBGA** para la gerente:
inventarios, ventas de tienda, caja, cartera/mora, clientes y garaje.

| Sede | Empresa | Supabase |
| --- | --- | --- |
| `bga` | SolucionesBGA | `ngjpndqmkhhdqjjljfmp` |

**Solo lectura.** No aprueba créditos ni registra pagos.

## Instalar

```bash
cp -r integrations/hermes/sp-gerente ~/.hermes/plugins/sp-gerente
hermes plugins enable sp-gerente
```

Opcional — override de credenciales:

```bash
export SP_BGA_SUPABASE_URL="https://ngjpndqmkhhdqjjljfmp.supabase.co"
export SP_BGA_SUPABASE_ANON_KEY="..."
export SP_BGA_PANEL_URL="http://localhost:3000"
```

Por defecto usa las anon keys ya embebidas en `spappweb/src/lib/supabase/public-env.ts`
(mismas que el panel). Panel default: `http://localhost:3000`.

## Tools

| Tool | Uso |
| --- | --- |
| `sp_sedes` | Lista el PDV |
| `sp_informe_diario` | Caja + ventas + alertas stock + top mora |
| `sp_inventario` | Stock / bajo mínimo |
| `sp_ventas` | Productos + motos contado del día |
| `sp_caja` | Sesión de caja + egresos |
| `sp_cartera_mora` | Vista `atrasos` |
| `sp_buscar_cliente` | Cédula / nombre |
| `sp_cliente` | Ficha 360° (`sede` + `user_id`) |
| `sp_garaje` | Motos físicas por estado |

Parámetro común: `sede = bga` (default `bga`; aliases legacy `ambas|all|*` → `bga`).
Fechas: `YYYY-MM-DD` en `America/Bogota`.

## Prompts útiles (gerente)

- «Dame el informe diario.»
- «¿Qué hay bajo mínimo?»
- «Ventas de tienda de hoy.»
- «Top mora, solo ≥4 días.»
- «Busca el cliente 1097… y dame la ficha.»

## Self-check

```bash
python ~/.hermes/plugins/sp-gerente/__init__.py
# o desde el repo:
python integrations/hermes/sp-gerente/__init__.py
```

## Relación con el plugin `spappweb`

| Plugin | Canal | Para quién |
| --- | --- | --- |
| **sp-gerente** | Supabase REST (SolucionesBGA) | Gerente / reportes PDV |
| **spappweb** | `/api/agent/tools` (`SPAPP_BASE_URL`) | Operación admin (mutaciones) |

Para mutar (aprobar crédito, confirmar pago) usa `spappweb` apuntando al panel.
Para preguntar «cómo vamos hoy en el punto de venta» usa **sp-gerente**.
