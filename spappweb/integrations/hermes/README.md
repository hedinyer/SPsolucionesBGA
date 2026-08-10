# Integración Hermes Agent ↔ SPapp (spappweb)

Este plugin conecta [Hermes Agent](https://hermes-agent.nousresearch.com) con el
panel administrativo SPapp. Hermes descubre **dinámicamente** todas las
herramientas que la web expone en `GET /api/agent/tools` y puede ejecutarlas
(aprobar créditos, asignar visitas, confirmar pagos, registrar entregas, gestionar
catálogo/inventario/garaje/taller, consultar el pipeline 360° de un cliente, etc.).

Cuando agregas una nueva tool en `src/lib/agent/registry.ts`, aparece
automáticamente en Hermes — no hay que tocar el plugin.

## Modo fácil: sin keys

Por defecto `/api/agent/tools` está **abierta** (no requiere ninguna key). No tienes
que configurar nada en el servidor. La app sigue usando cookies iron-session para
los humanos; el agente actúa con permisos de **admin**.

> Opcional (recomendado en producción): si defines `AGENT_API_KEY` en el servidor,
> los endpoints pasan a exigir `Authorization: Bearer <AGENT_API_KEY>` y debes poner
> ese mismo valor en `SPAPP_AGENT_API_KEY` para el plugin.

## Instalar el plugin en Hermes

Copia la carpeta `spappweb/` (la que contiene `plugin.yaml` y `__init__.py`) a tu
directorio de plugins de Hermes:

```bash
cp -r spappweb/integrations/hermes/spappweb ~/.hermes/plugins/spappweb
```

(O usa un plugin de proyecto bajo `./.hermes/plugins/` con
`HERMES_ENABLE_PROJECT_PLUGINS=true`.)

Si tu panel NO corre en `http://localhost:3000`, indica la URL:

```bash
export SPAPP_BASE_URL="https://tu-panel.vercel.app"   # sin slash final
# export SPAPP_AGENT_API_KEY="..."   # solo si configuraste AGENT_API_KEY
```

Habilita el plugin:

```bash
hermes plugins enable spappweb
```

Inicia Hermes. Verás en consola: `[spappweb] N herramientas registradas...`.

## 3. Uso

El modelo ya puede llamar las tools por su nombre (`get_client_pipeline`,
`approve_credit`, `inbox_queues`, ...). Recomendado dar a Hermes el contexto de
[`AGENT_CONTEXT.md`](../../AGENT_CONTEXT.md) para que entienda el dominio.

**Informes PDV SolucionesBGA** (inventario, ventas, clientes, diario/caja): ver el
playbook [`HERMES_DUAL_PLAYBOOK.md`](HERMES_DUAL_PLAYBOOK.md) (este clone es
**single-sede `bga`**; el dual Garrido/Pinilla no es el default aquí).

**Gerente / PDV vía Supabase (solo lectura, sede `bga`):** plugin
[`sp-gerente/`](sp-gerente/) — tools `sp_informe_diario`, `sp_ventas`, `sp_caja`, etc.
Env: `SP_BGA_SUPABASE_URL` / `SP_BGA_SUPABASE_ANON_KEY` / `SP_BGA_PANEL_URL`.

### Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/agent/tools` | Catálogo de tools (schemas function-calling) |
| `POST` | `/api/agent/tools` | Ejecuta una tool. Body: `{ "tool": "...", "args": { ... } }` |
| `GET` | `/api/agent/events` | Cola de eventos del pipeline para WhatsApp (ver abajo) |
| `POST` | `/api/agent/events` | Confirma eventos procesados. Body: `{ "eventIds": [...] }` |

En modo abierto no requieren auth; si configuraste `AGENT_API_KEY`, añade
`Authorization: Bearer <AGENT_API_KEY>`.

### Notificaciones WhatsApp del pipeline

Cuando avanzas un cliente en el stepper (Crédito → Moto → Contrato → Pago → Visita →
Entrega), SPapp encola eventos para que Hermes envíe WhatsApp. Tools:

- `list_pipeline_events` — cola pendiente con `celular` y `whatsappHint`
- `ack_pipeline_events` — marcar como enviados

Guía completa: [`PIPELINE_EVENTS.md`](PIPELINE_EVENTS.md)

### Ejemplo manual (modo abierto)

```bash
curl -s http://localhost:3000/api/agent/tools | jq '.tools[].name'

curl -s -X POST http://localhost:3000/api/agent/tools \
  -H "Content-Type: application/json" \
  -d '{"tool":"get_client_pipeline","args":{"userId":3}}'
```

## 4. Alternativa sin plugin (MCP / config)

Si prefieres no instalar el plugin Python, puedes envolver estos endpoints REST en
cualquier cliente HTTP o exponerlos como servidor MCP y declararlo en
`~/.hermes/config.yaml` bajo `mcp_servers`. El plugin es la vía más directa porque
auto-descubre el catálogo.

## Notas de seguridad

- En **modo abierto** (sin `AGENT_API_KEY`) cualquiera que conozca la URL puede
  ejecutar las tools, incluyendo acciones de admin (aprobar créditos, registrar
  pagos, borrar registros). Úsalo solo en local o detrás de una red privada; en
  producción define `AGENT_API_KEY` o protege el endpoint a nivel de red.
- El agente actúa con permisos de **admin**.
- Las tablas de Supabase tienen **RLS deshabilitado** (ver `AGENT_CONTEXT.md`).
