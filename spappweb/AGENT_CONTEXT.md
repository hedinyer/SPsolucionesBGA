# SPapp (spappweb) — Contexto completo para agentes IA

> Documento de contexto para **Hermes Agent** (y cualquier otro agente IA). Resume
> arquitectura, funcionalidades, lógica de negocio, esquema de Supabase y el
> catálogo de herramientas expuesto en `/api/agent/tools`.

---

## 1. ¿Qué es SPapp?

SPapp es el sistema de una empresa colombiana que **financia/renta motocicletas**.
Los clientes solicitan un crédito desde una app Flutter; este repositorio
(`spappweb`) es el **panel administrativo web** (Next.js) donde el equipo:

1. Revisa y aprueba/rechaza solicitudes de **crédito**.
2. Gestiona el **contrato digital** y la **hoja de vida** del cliente.
3. Registra la **moto comprada**, confirma **pagos** (inicial + cuotas) y la **entrega**.
4. Programa **visitas domiciliarias** de verificación con **visitadores**.
5. Hace seguimiento de **mora** (atrasos), clientes **morosos** y **motos para recoger**.
6. Administra **catálogo** de motos, **inventario** de repuestos, **garaje** físico y **solicitudes de taller**.

Moneda: **COP** (pesos colombianos, montos enteros). Zona horaria de negocio:
`America/Bogota`.

---

## 2. Stack y arquitectura

| Capa | Tecnología |
| --- | --- |
| Framework | **Next.js 16** (App Router, React 19, Server Components + Server Actions). Versión con breaking changes; ver `AGENTS.md`. |
| Lenguaje | TypeScript |
| UI | Tailwind CSS v4, Radix UI / shadcn, lucide-react, sonner |
| Backend de datos | **Supabase** (Postgres 17 + Storage + Realtime) |
| Validación | **Zod v4** |
| Sesiones | **iron-session** (cookies httpOnly) |
| OCR de comprobantes | tesseract.js + sharp |

- **No usa Supabase Auth.** El login es propio (RPC Postgres + cookie iron-session).
- Toda la lógica de mutación vive en **server actions** (`src/lib/actions/*`), con
  validación Zod y `revalidatePath`. La lógica de lectura vive en
  `src/lib/pipeline/queries.ts`.
- Cliente Supabase del servidor: `createAdminClient()` usa `service_role` si está
  configurada (`SUPABASE_SERVICE_ROLE_KEY`), si no cae a anon.

### Capa de agente IA (lo que usa Hermes)

```
Hermes Agent ──HTTP(Bearer AGENT_API_KEY)──▶ /api/agent/tools ──▶ src/lib/agent/registry.ts
                                                                      │
                                          reusa server actions + queries (única fuente de verdad)
                                                                      ▼
                                                                  Supabase
```

- `GET /api/agent/tools` → catálogo de herramientas (schemas function-calling).
- `POST /api/agent/tools` con `{ tool, args }` → ejecuta la herramienta.
- `GET /api/agent/events` → cola de eventos del pipeline para WhatsApp.
- `POST /api/agent/events` con `{ eventIds }` → confirma eventos procesados.
- Auth: **abierta por defecto** (sin key). Si se define `AGENT_API_KEY` en el
  servidor, se exige `Authorization: Bearer <AGENT_API_KEY>`. El agente actúa como
  **admin** (vía contexto request-scoped, no debilita el resto de la app).

---

## 3. Modelo de autenticación

| Rol | `users.status` | Login | Sesión |
| --- | --- | --- | --- |
| Admin (panel) | `admin` | RPC `verify_admin_login(p_user, p_password)` | cookie `spapp_admin_session` |
| Visitador | `visitador` | RPC `verify_visitador_login(p_user, p_password)` | cookie `spapp_visitador_session` |
| Cliente | `normal` | Sin login en el panel; se crea por cédula | — |
| **Agente IA** | (admin efectivo) | Abierta (o Bearer `AGENT_API_KEY` si se define) | contexto request-scoped |

Las contraseñas se guardan en texto plano en `users.password` (login por RPC).
El cliente nuevo se crea con `user = password = cédula`.

---

## 4. El pipeline de crédito

Orden de pasos (`STEP_ORDER`): **credito → contrato → moto → pago → entrega → visita**.
Cada paso tiene estado visual: `completado | actual | pendiente | bloqueado | error`.

| Paso | Se completa cuando… | Bloqueado si… |
| --- | --- | --- |
| **credito** | `users_documents.estado_solicitud = 'aceptada'` (error si `rechazada`) | nunca |
| **contrato** | `digital_contracts.status = 'firmado'` | crédito no aprobado |
| **moto** | existe `user_moto_compra` | contrato no firmado |
| **pago** | `pago_inicial_confirmado && pago_cuota_confirmado` y compra en `lista_retiro`/`entregada` | no hay compra |
| **entrega** | `user_moto_compra.estado = 'entregada'` (error si `cancelada`) | no pagado y no `lista_retiro` |
| **visita** | `visitas.estado = 'completada'` (error si `cancelada`) | no entregada |

> La **visita domiciliaria** puede ir antes o después de la entrega según
> `admin_data.entrega_antes_visita` en la compra.

`getClientPipeline(userId)` (tool `get_client_pipeline`) devuelve el agregado 360°
con: user, document, contract, visita, compra, tracking, tarifas, moroso, recoger,
atraso, resumen de renting, historial de pagos y los `steps`. **Úsalo siempre antes
de actuar sobre un cliente.**

### 4.1 Notificaciones WhatsApp (Hermes)

Cada avance relevante del pipeline inserta una fila en `pipeline_events` con el
celular del cliente, el paso (`stepId`) y un `whatsappHint` sugerido.

**Flujo:** `list_pipeline_events` → enviar WhatsApp → `ack_pipeline_events`.

| kind | Disparador |
| --- | --- |
| `solicitud_recibida` | Nueva solicitud pública |
| `credito_aprobado` / `credito_rechazado` | Aprobar/rechazar crédito |
| `moto_asignada` | Asignar moto (placa + chasis) |
| `contrato_firmado` | Cliente firma contrato |
| `pago_completo` | Primer pago completo → `lista_retiro` |
| `visita_asignada` / `visita_completada` / `visita_cancelada` | Gestión de visitas |
| `entrega_marcada` / `compra_cancelada` | Entrega o cancelación |

Detalle: [`integrations/hermes/PIPELINE_EVENTS.md`](integrations/hermes/PIPELINE_EVENTS.md).

---

## 5. Pagos, tarifas, mora y renting

- **Primer pago**: dos conceptos acumulables por abonos parciales — `inicial`
  (`cuota_inicial_monto`) y `cuota_adelantada` (`monto_cuota_periodo`). Cuando ambos
  flags (`pago_inicial_confirmado`, `pago_cuota_confirmado`) están en true, la compra
  pasa a `lista_retiro` (vía triggers).
- **Tarifas de renting** (`tarifas_pagadas`): se generan automáticamente al marcar la
  entrega (`generate_tarifas_on_entrega`). Frecuencias: `diario | semanal | quincenal
  | mensual`. Estados: `pendiente | pagada | vencida`.
- **Pagos** (`pagos`): cada pago confirmado se aplica a tarifas vía triggers
  (`aplicar_pago_confirmado`, `pago_tarifa_aplicaciones`). **Referencia única por
  cliente** (constraint → error `23505`). En efectivo sin referencia se genera
  `EF-<timestamp>`.
- **Mora**: la vista `atrasos` es la **fuente de verdad** (calcula días de atraso y
  monto adeudado en `America/Bogota`). Umbrales de bandeja:
  - `dias_atraso ∈ [3, 4)` → **moroso** (cola `morosos`).
  - `dias_atraso ≥ 4` → **moto para recoger** (cola `recoger`).
- `resolveMoroso` solo regulariza si no quedan tarifas `vencida`.

---

## 6. Storage (Supabase Storage)

| Bucket | Contenido | Convención de ruta |
| --- | --- | --- |
| `user-documents` | Cédula frente/reverso + selfie del cliente | `{userId|pending/uuid}/{tipo}_{ts}.jpg` |
| `pagos-comprobantes` | Comprobantes de pago | `{userId}/{compraId}/{ts}.ext` |
| `visita-evidencias` | Fotos/videos de visitas | `{visitadorId}/{visitaId}/fotos|videos/{ts}.ext` |
| `visitador-fotos` | Fotos de visitadores | — |
| `bike-images` | Imágenes del catálogo | — |
| `inventario-imagenes` | Imágenes de repuestos | — |
| `garaje-imagenes` | Fotos de placa/motos del garaje | — |

URL pública: `{SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}`.

> El agente IA no sube archivos binarios por estas tools; trabaja con URLs ya
> subidas (p. ej. en `submit_public_application`).

---

## 7. Esquema de la base de datos (Supabase / Postgres `public`)

19 tablas, todas con **RLS deshabilitado** (ver §10). Claves primarias: `bigint`
identidad o `uuid`. `created_at/updated_at` con triggers `set_*_updated_at`.

### `users` — credenciales
`id` (bigint PK), `user` (text), `password` (text, plano), `status`
(`normal|admin|visitador`, default `normal`).

### `users_documents` — solicitud de crédito + documentos
`id` (PK), `user_id`→users, `document_front_url`, `document_back_url`, `selfie_url`,
`estado_solicitud` (`pendiente|aceptada|rechazada`, default pendiente),
`motivo_rechazo`, `betado` (bool, veto), `ubicacion_solicitud` (jsonb
`{lat,lng,accuracy?,captured_at}`), `hora_actualizacion`, `created_at`.

### `digital_contracts` — contrato + hoja de vida
`id` (uuid PK), `user_id`, `users_documents_id`, `status`
(`borrador|completado|firmado`), `hoja_vida_data` (jsonb), `contrato_data` (jsonb),
`admin_data` (jsonb), `signature_path`, `hoja_vida_pdf_path`, `contrato_pdf_path`,
`signed_at`. Búsquedas JSON: `hoja_vida_data->>numero_identificacion`,
`->>nombre_completo`, `contrato_data->>cedula_contratante`.

### `user_moto_compra` — la compra/crédito de la moto (núcleo)
`id` (uuid PK), `user_id` (unique), `digital_contract_id`, `bike_id`→bike_table,
`modelo`, `color`, `frecuencia_pago` (`diario|semanal|quincenal|mensual`),
`cuota_inicial_monto`, `monto_cuota_periodo`, `monto_total_primer_pago`,
`estado` (`pendiente_pago|lista_retiro|entregada|cancelada`),
`pago_inicial_confirmado` / `pago_cuota_confirmado` (+ `_at`),
`placa`, `chasis`, `referencia`, `fecha_entrega` (date),
`estado_fisico` (`activa|recogida|robada|en_transito|en_patio`),
`admin_data` (jsonb), `seleccionado_at`.

### `tarifas_pagadas` — cuotas de renting
`id` (uuid PK), `user_moto_compra_id`, `user_id`, `numero_periodo` (>0),
`fecha_vencimiento` (date), `monto_esperado` (>0), `monto_pagado`,
`estado` (`pendiente|pagada|vencida`), `pagada_at`, `confirmada_por`, `notas`.

### `pagos` — pagos registrados
`id` (uuid PK), `user_moto_compra_id`, `user_id`, `monto` (>0), `dias_cubiertos`,
`medio_pago_usuario` (`nequi|davivienda|efectivo`),
`medio_pago_admin` (`nequi_nicolas|nequi_pedro|nequi_marisol|davivienda|efectivo`),
`referencia` (única por cliente), `comprobante_url`,
`origen` (`usuario|admin`), `estado` (`pendiente_confirmacion|confirmado|rechazado`),
`reportado_at`, `confirmado_at`, `confirmado_por`, `rechazado_at`, `motivo_rechazo`,
`fecha_comprobante`, `tarifa_objetivo_id`→tarifas_pagadas,
`contexto_pago` (`tarifa|inicial|cuota_adelantada`), `notas_admin`.

### `pago_tarifa_aplicaciones` — aplicación de pagos a tarifas
`id` (uuid PK), `pago_id`→pagos, `tarifa_id`→tarifas_pagadas, `monto_aplicado` (>0).

### `morosos` — clientes en mora (3 días)
`id` (uuid PK), `user_moto_compra_id` (unique), `user_id`, `tarifa_vencida_id`,
`dias_atraso` (≥3), `monto_adeudado`, `estado` (`activo|regularizado`),
`fecha_ingreso`.

### `motos_para_recoger` — recuperación (4+ días)
`id` (uuid PK), `user_moto_compra_id` (unique), `moroso_id`, `user_id`,
`dias_atraso` (≥4), `monto_adeudado`, `estado`
(`pendiente|asignada|recogida|cancelada`), `fecha_ingreso`, `fecha_recogida`, `notas`.

### `visitas` — visitas domiciliarias
`id` (uuid PK), `user_id` (unique), `digital_contract_id`, `visitador_id`,
`estado` (`pendiente_asignacion|asignada|completada|cancelada`),
`cliente_nombre`, `cliente_celular`, `direccion_visita`, `barrio`,
`fecha_programada`, `notas`, `evidencia_fotos` (jsonb[]), `evidencia_videos`
(jsonb[]), `ubicacion_verificada` (jsonb), `fecha_completada`, `notas_visita`.

### `visitadores`
`id` (PK), `nombre`, `foto_url`, `telefono`, `activo` (bool), `user_id` (unique)→users.

### `users_tracking` — seguimiento GPS
`id` (PK), `user_id` (unique), `seguimiento` (bool), `ubicacion_1..11` (jsonb,
rotación nocturna vía `rotate_nightly_location`).

### `bike_table` — catálogo de motos
`id` (PK), `modelo`, `color`, `imagen_url`, `stock` (≥0), `cuota_inicial`,
`cuota_diaria` (default 38000), `descripcion`, `activo`.

### `inventario_categorias`
`id` (PK), `nombre`, `slug` (unique), `descripcion`, `activo`, `orden`.

### `inventario_productos`
`id` (PK), `categoria_id`→categorias, `sku` (unique), `nombre`, `descripcion`,
`precio` (≥0), `stock` (≥0), `stock_minimo` (≥0), `imagen_url`,
`compatible_modelos` (text[]), `activo`.

### `solicitudes_taller`
`id` (uuid PK), `user_id`, `user_moto_compra_id`,
`tipo` (`repuestos|reparacion|cambio_aceite`),
`estado` (`pendiente|en_proceso|completada|cancelada`),
`notas_cliente`, `notas_admin`, `fecha_preferida`, `descripcion_falla`,
`total_estimado` (≥0).

### `solicitud_repuesto_items`
`id` (uuid PK), `solicitud_id`→solicitudes_taller, `producto_id`→inventario_productos,
`cantidad` (>0), `precio_unitario` (≥0), `subtotal` (≥0).

### `garaje_parqueaderos`
`id` (PK), `nombre` (unique), `slug` (unique), `activo`, `orden`.

### `garaje_motos` — inventario físico de motos
`id` (uuid PK), `parqueadero_id`→parqueaderos, `placa`, `placa_foto_url`,
`referencia`, `modelo`, `color`, `origen` (`manual|recuperacion`),
`condicion` (`nueva|segunda_mano|recuperada`),
`estado` (`en_garaje|disponible|vendida|baja`), `moto_para_recoger_id` (unique),
`user_moto_compra_id`, `notas`.

### Vista `atrasos` (solo lectura — fuente de verdad de la mora)
Por cada `user_moto_compra` con `estado='entregada'` calcula: `dias_atraso`,
`monto_adeudado`, `periodos_debidos/pagados`, `monto_esperado/pagado`,
`tarifa_vencida_id` y `estado` (`al_dia | vencido | moroso`). Usa la fecha de inicio
(`fecha_entrega` o `signed_at` o `seleccionado_at`) y `tarifa_period_config` para los
intervalos.

### Funciones RPC y triggers relevantes
- **Login**: `verify_admin_login`, `verify_visitador_login`, `verify_login`.
- **Visitas**: `get_visitas_asignadas(p_visitador_id)`,
  `complete_visita_visitador(...)`, triggers `ensure_visita_on_signed/on_entrega`.
- **Tarifas/pagos**: `generate_tarifas_for_compra`, `generate_tarifas_on_entrega`
  (trigger), `aplicar_pago_confirmado`, `aplicar_monto_sobre_tarifa`,
  `sync_compra_pago_flags`, `sync_compra_estado_on_pago`, `validate_pago`.
- **Mora**: `evaluar_mora_diaria`, `sync_mora_for_compra`, `sync_mora_on_tarifa_pagada`.
- **Otros**: `get_user_credit_count`, `create_solicitud_repuestos`,
  `decrement_stock_on_solicitud_completada`, `ensure_users_tracking_on_signed`,
  `rotate_nightly_location`, `sync_garaje_on_moto_recogida`,
  `sync_compra_to_contract_admin_data`.

> Mucha lógica está en **triggers**: al confirmar pagos/tarifas o marcar entregas, el
> estado de mora, tarifas y flags se sincroniza solo. No dupliques esa lógica.

---

## 8. Rutas del panel (referencia)

Navegación admin en **5 hubs** (mismas URLs de datos):

| Hub | Rutas |
| --- | --- |
| **Hoy** | `/inbox` (9 colas); taller → `/solicitudes` |
| **Clientes** | `/clientes`, `/clientes/[userId]`; alta en `/clientes?nuevo=1` (`/crear-cliente` redirige) |
| **Motos** | `/garaje`, `/garaje/nueva`, `/vendidas` (en calle), `/catalogo` (modelos), `/venta-contado` |
| **Tienda** | `/venta` (repuestos y accesorios), `/caja`, `/inventario` (stock), `/productos-credito` (extras a crédito), `/historial-ventas` |
| **Equipo** | `/visitadores` |

**Visitador** (`/visitador/login`, `/visitador/mis-visitas`, `/visitador/visitas/[id]`) ·
**Cliente** (`/hojadevida`).

La bandeja `/inbox` tiene 9 colas: `creditos`, `pagos`, `retiro`, `entrega`,
`visitas_sin_asignar`, `visitas_programadas`, `morosos`, `recoger`,
`solicitudes_taller`.

---

## 9. Catálogo de herramientas del agente

`GET /api/agent/tools` devuelve el schema vivo. Resumen por categoría:

### Lectura
| Tool | Args | Devuelve |
| --- | --- | --- |
| `inbox_queues` | — | Las 9 colas con conteo |
| `inbox_list` | `queueId` | Items pendientes de una cola |
| `search_clients` | `query` (≥2) | Clientes que coinciden |
| `get_client_pipeline` | `userId` | Vista 360° del cliente |
| `list_pipeline_events` | `limit?`, `since?`, `includeAcked?` | Cola WhatsApp del pipeline |
| `ack_pipeline_events` | `eventIds`, `ackedBy?` | Marcar eventos como enviados |
| `list_bikes` | — | Catálogo de motos |
| `list_categorias` / `list_productos` | — | Inventario |
| `list_solicitudes_taller` | — | Solicitudes de taller |
| `list_visitadores` / `list_active_visitadores` | — | Visitadores |
| `list_garaje_parqueaderos` / `list_garaje_motos` / `list_vendidas` | — | Garaje y vendidas |

### Crédito
`approve_credit {documentId,userId}` · `reject_credit {documentId,userId,motivo,betado}`

### Visitas
`assign_visit {visitaId,userId,visitadorId,fechaProgramada}` · `complete_visit
{visitaId,userId}` · `cancel_visit {visitaId,userId}` · `save_visitador {...}` ·
`delete_visitador {id}`

### Pagos
`confirm_payment_flag {compraId,userId,field,value}` · `confirm_tarifa_pago
{tarifaId,userId,notas?}` · `register_payment {userId,compraId,contexto,monto,
medioPagoAdmin,bancoOrigen,...}` · `check_referencia_usada {userId,referencia}` ·
`remove_pago_abono {pagoId,userId}`

### Entrega
`update_delivery {compraId,userId,placa,chasis,fechaEntrega,referencia?}` ·
`mark_delivered {compraId,userId}` · `cancel_compra {compraId,userId}` ·
`update_vendida_estado_fisico {compraId,userId,estadoFisico}` · `delete_vendida_moto
{compraId,userId}`

### Mora / tracking
`set_tracking {userId,seguimiento}` · `resolve_moroso {morosoId,userId}` ·
`mark_moto_recogida {recogerId,userId}`

### Clientes
`create_client {cedula}` · `submit_public_application
{documentFrontUrl,documentBackUrl,selfieUrl,hojaVida}`

### Catálogo / inventario / garaje / taller
`save_bike` / `delete_bike` · `save_categoria` / `delete_categoria` · `save_producto`
/ `delete_producto` · `update_solicitud_estado` · `save_garaje_parqueadero` /
`delete_garaje_parqueadero` · `save_garaje_moto` / `delete_garaje_moto`

> Cada tool valida sus argumentos con Zod y delega en la server action/query real, así
> que se respetan todas las guardas de negocio y triggers de Supabase. Los errores se
> devuelven como `{ "ok": false, "error": "..." }`.

---

## 10. Seguridad — IMPORTANTE

- **RLS está deshabilitado** en las 19 tablas `public`. Cualquiera con la `anon key`
  puede leer/escribir todo. Considera habilitar RLS con políticas adecuadas
  (Supabase Dashboard → Database → Policies).
- `/api/agent/tools` está **abierta por defecto** (sin key). En producción define
  `AGENT_API_KEY` o protege el endpoint a nivel de red: el **agente actúa como
  admin** y puede aprobar créditos, registrar pagos y borrar registros (acciones
  destructivas: `delete_*`, `cancel_*`).
- Contraseñas en texto plano en `users.password`.

---

## 11. Cómo conectar Hermes (resumen)

1. Copia `integrations/hermes/spappweb/` a `~/.hermes/plugins/spappweb/`.
2. Si el panel no corre en `http://localhost:3000`, exporta `SPAPP_BASE_URL`.
3. Ejecuta `hermes plugins enable spappweb` e inicia Hermes.

(Opcional para producción: define `AGENT_API_KEY` en el servidor y
`SPAPP_AGENT_API_KEY` para el plugin.)

Detalle en [`integrations/hermes/README.md`](integrations/hermes/README.md).
