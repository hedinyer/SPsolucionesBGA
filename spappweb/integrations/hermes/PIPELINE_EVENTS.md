# Eventos del pipeline → WhatsApp (Hermes Agent)

Cuando el equipo avanza un cliente en el pipeline del panel (`/clientes/[userId]`),
SPapp registra un **evento** en la tabla `pipeline_events`. Hermes Agent (en su
entorno separado) consulta esa cola vía API o tools MCP y envía los WhatsApp a los
clientes.

## Pasos del pipeline

Orden visual en el stepper (puede variar si `entrega_antes_visita`):

**Crédito → Moto → Contrato → Pago → Visita → Entrega**

## Flujo recomendado para Hermes

1. Cada 1–5 minutos (o tras una acción del panel), llama `list_pipeline_events`.
2. Por cada evento con `payload.celular`, envía WhatsApp usando `whatsappHint` como
   base (puedes personalizar el tono).
3. Tras enviar, llama `ack_pipeline_events` con los `id` procesados.

```bash
# Listar pendientes (REST)
curl -s "$SPAPP_BASE_URL/api/agent/events" | jq .

# Confirmar envío
curl -s -X POST "$SPAPP_BASE_URL/api/agent/events" \
  -H "Content-Type: application/json" \
  -d '{"eventIds":["uuid-1","uuid-2"],"ackedBy":"hermes"}'
```

Equivalente vía tools (auto-descubiertas por el plugin):

- `list_pipeline_events` — `{ "limit": 50 }`
- `ack_pipeline_events` — `{ "eventIds": ["..."], "ackedBy": "hermes" }`

## Tipos de evento (`kind`)

| kind | Paso | Cuándo se emite |
| --- | --- | --- |
| `solicitud_recibida` | Crédito | Cliente envía solicitud pública (documentos + hoja de vida) |
| `credito_aprobado` | Crédito | Admin/agente aprueba el crédito |
| `credito_rechazado` | Crédito | Admin/agente rechaza el crédito (`payload.motivo`) |
| `moto_asignada` | Moto | Se asigna moto con placa y chasis (`payload.moto`, `payload.contractUrl`) |
| `contrato_firmado` | Contrato | Cliente firma el contrato digital |
| `pago_completo` | Pago | Primer pago completo (inicial + cuota) → compra en `lista_retiro` |
| `visita_asignada` | Visita | Se programa visita con visitador (`fechaProgramada`, `visitadorNombre`) |
| `visita_completada` | Visita | Visita marcada como completada |
| `visita_cancelada` | Visita | Visita cancelada |
| `entrega_marcada` | Entrega | Moto marcada como entregada |
| `compra_cancelada` | Entrega | Compra cancelada |

## Formato de cada evento

```json
{
  "id": "uuid",
  "userId": 42,
  "kind": "moto_asignada",
  "stepId": "moto",
  "payload": {
    "displayName": "Juan Pérez",
    "celular": "573001234567",
    "cedula": "1234567890",
    "stepId": "moto",
    "stepLabel": "Moto",
    "moto": { "modelo": "AKT", "color": "Rojo", "placa": "ABC123", "chasis": "..." },
    "contractId": "uuid-contrato",
    "contractUrl": "https://tu-panel.vercel.app/contrato/uuid-contrato"
  },
  "whatsappHint": "Hola Juan Pérez, tu moto AKT Rojo fue asignada...",
  "createdAt": "2026-07-02T12:00:00.000Z",
  "ackedAt": null,
  "ackedBy": null
}
```

- **`payload.celular`**: dígitos con prefijo `57` (Colombia) cuando es posible.
  Si es `null`, no hay celular en hoja de vida ni en visita — no envíes WhatsApp
  o pide el número al equipo.
- **`whatsappHint`**: texto sugerido en español; Hermes puede usarlo tal cual o
  adaptarlo.

## Endpoints REST

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/agent/events` | Eventos pendientes. Query: `limit`, `since` (ISO), `all=true` |
| `POST` | `/api/agent/events` | Body: `{ eventIds, ackedBy? }` |

Misma autenticación que `/api/agent/tools`: abierta por defecto; con `AGENT_API_KEY`
en el servidor, header `Authorization: Bearer <key>`.

## Código fuente (para leer en GitHub)

| Archivo | Rol |
| --- | --- |
| `src/lib/agent/pipeline-events.ts` | Emisión, listado, ack y plantillas WhatsApp |
| `src/lib/pipeline/step-logic.ts` | Lógica de pasos del stepper |
| `src/lib/admin/credit-ops.ts` | Eventos de crédito |
| `src/lib/admin/moto-contract-ops.ts` | Evento moto asignada |
| `src/lib/actions/contract-actions.ts` | Evento contrato firmado |
| `src/lib/actions/payment-comprobante-actions.ts` | Evento pago completo |
| `src/lib/actions/admin-actions.ts` | Visitas, entrega, cancelación |
| `src/lib/actions/client-actions.ts` | Solicitud recibida |
| `supabase/migrations/20260702100000_create_pipeline_events.sql` | Tabla y Realtime |

## Realtime (opcional)

La tabla `pipeline_events` está en la publicación `supabase_realtime`. Si Hermes tiene
acceso a Supabase, puede suscribirse a `INSERT` en lugar de hacer polling REST.

## Prompt sugerido para Hermes

> Eres el agente de notificaciones WhatsApp de Soluciones Garrido. Cada pocos minutos
> ejecuta `list_pipeline_events`. Para cada evento con `payload.celular`, envía el
> mensaje al número usando `whatsappHint`. Luego `ack_pipeline_events` con los ids
> enviados. Si `celular` es null, registra el fallo y no hagas ack hasta que el
> equipo actualice los datos del cliente.

Ver también [`README.md`](README.md) y [`../../AGENT_CONTEXT.md`](../../AGENT_CONTEXT.md).
