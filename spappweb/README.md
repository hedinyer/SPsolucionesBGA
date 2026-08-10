# SP Admin (spappweb)

Panel administrativo Next.js para gestionar el pipeline de crédito, visitas y motos de la app Flutter.

## Requisitos

- Node.js 20+
- Proyecto Supabase con las migraciones del repo aplicadas
- Usuario en `users` con `status = 'admin'`

## Configuración local

```bash
cd spappweb
npm install
npm run dev
```

URL y anon key de Supabase están en `src/lib/supabase/public-env.ts` (proyecto **sp_SolucionesBGA**).

Crea `spappweb/.env.local` (gitignored) con la service role para operaciones admin (crear, editar, eliminar):

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Supabase → Settings → API → service_role
# opcional en local:
# SESSION_SECRET=una-cadena-secreta-de-al-menos-32-caracteres
```

Sin `SUPABASE_SERVICE_ROLE_KEY`, el panel queda en solo lectura efectiva (SELECT funciona; INSERT/UPDATE/DELETE fallan).

Abre [http://localhost:3000](http://localhost:3000) — redirige a login o bandeja.

## Marcar un usuario como admin

Tras aplicar las migraciones de `users.status`:

```sql
UPDATE public.users SET status = 'admin' WHERE "user" = 'tu_usuario_admin';
```

## Deploy en Vercel

1. Importa el repositorio en Vercel.
2. **Root Directory:** `spappweb`
3. **Environment Variables** (obligatoria):
   - `SUPABASE_SERVICE_ROLE_KEY` — Supabase Dashboard → Project Settings → API → **service_role** (secret). Aplicar a Production (y Preview si quieres).
   - Opcional: `SESSION_SECRET` — cadena de al menos 32 caracteres para firmar cookies de sesión admin.
   - Opcional: `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` (links que se copian/envían a clientes y visitadores; en producción usa la URL del deploy).
4. Deploy / redeploy.

Sin `SUPABASE_SERVICE_ROLE_KEY` en Vercel, crear/editar/eliminar en catálogo, inventario, garaje, visitadores y bandeja fallará en producción.

## Estructura (navegación por hubs)

- **Hoy** `/inbox` — Colas accionables del día (taller vía tarjeta → `/solicitudes`)
- **Clientes** `/clientes` — Personas y pipeline; crear con `?nuevo=1` (redirect desde `/crear-cliente`)
- **Motos** — `/garaje` (unidades), `/vendidas` (en calle), `/catalogo` (modelos), `/venta-contado` (contado)
- **Tienda** — `/venta` (repuestos y accesorios), `/caja`, `/inventario` (stock), `/productos-credito` (extras a crédito), `/historial-ventas`
- **Equipo** — `/visitadores`
- `/clientes/[userId]` — Pipeline del cliente con stepper
- `/solicitudes` — Taller (acceso desde Hoy, no en el menú principal)
## Integración con agentes IA (Hermes Agent)

El panel expone una capa de herramientas para agentes IA en `/api/agent/tools`
(catálogo `GET`, ejecución `POST`). **Abierta por defecto** (sin key) para integrar
fácil; el agente actúa como admin.

```bash
# Opcional (recomendado en producción): si se define, /api/agent/* exige
# Authorization: Bearer <AGENT_API_KEY>
AGENT_API_KEY=<cadena-secreta-larga>
```

- Contexto completo para el agente: [`AGENT_CONTEXT.md`](AGENT_CONTEXT.md)
- Plugin de Hermes + guía: [`integrations/hermes/README.md`](integrations/hermes/README.md)
- Las herramientas se definen en `src/lib/agent/registry.ts` (reusan las server
  actions y queries existentes). Añadir una entrada ahí la publica automáticamente.
