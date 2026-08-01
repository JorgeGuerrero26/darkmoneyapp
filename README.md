# DarkMoney

App móvil de finanzas personales con estética **dark fintech premium**. Multi-workspace, multi-moneda, con detección automática de movimientos desde notificaciones bancarias (Android) y asistencia con IA.

> Backend compartido con la versión web vía Supabase. La lógica de dominio pura reutilizable vive en [`@darkmoney/shared`](https://github.com/JorgeGuerrero26/darkmoneyshare).

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Expo SDK 54 · React Native 0.81 · TypeScript |
| Navegación | Expo Router v6 (tabs + stacks, deep links) |
| Backend | Supabase (Postgres + RLS, Auth, Storage, Edge Functions) |
| Estado servidor | TanStack React Query v5 (caché persistido en AsyncStorage) |
| Sesión | Keystore del SO (`lib/secure-session-storage.ts`) + auto-refresh y recuperación de sesión stale |
| Detección Android | `NotificationListenerService` nativo en Kotlin |
| Releases | EAS Build (APK) + EAS Update (OTA, canal `preview`) |

## Módulos

- **Dashboard** — balance en moneda base, entradas/salidas del mes, alertas de presupuesto, próximos cobros, salud financiera.
- **Movimientos** — lista paginada con filtros tipados, quick create en 3 pasos, split de gastos, adjuntos, detección de duplicados con IA (Pro).
- **Cuentas** — balances multi-moneda, evolución, composición del net worth.
- **Créditos y deudas** — receivable/payable, pagos parciales, historial de eventos, compartir por invitación (solo lectura).
- **Presupuestos** — por scope (general, categoría, cuenta), barra de progreso, alertas configurables.
- **Suscripciones e ingresos fijos** — recordatorios y creación automática de movimientos.
- **Detección automática (Android)** — lee notificaciones de apps financieras (Yape, BCP, Interbank, Gmail…) y sugiere movimientos.
- **Más** — notificaciones, contactos, categorías, tipos de cambio, configuración.

## Arquitectura

```
app/                    # Rutas Expo Router: orquestan estado, queries y callbacks
  (auth)/               # Login, registro, recuperación
  (app)/                # Tabs: dashboard, movements, accounts, obligations, more
  movement/[id].tsx     # Detalles (stack)
components/ui/          # Componentes genéricos sin dominio ni queries
components/domain/      # Wrappers de dominio
features/*/lib/         # Filtros, presenters, builders de secciones (lógica pura testeada)
services/queries/       # Supabase + React Query: fetchers, mappers, invalidaciones
lib/                    # Auth, sesión, query client, utilidades
plugins/notification-detection/   # Fuente Kotlin del servicio de detección
supabase/migrations/    # Esquema (documentado en DATABASE_DICTIONARY.md local)
```

Reglas de capas: los componentes visuales reciben datos listos — no consultan Supabase ni calculan reglas financieras. Las pantallas tipo recurso usan `ResourceModuleTemplate` con componentes compartidos (`FilterToolbar`, `ActiveFilterBar`, `MetricSummaryBar`, `ResourceSectionList`, `FAB`). Tokens de diseño en `constants/theme.ts` (sin hex inline).

## Conceptos de dominio

- **Multi-workspace**: todo dato pertenece a un `workspace_id`; siempre se filtra por el workspace activo. Autorización por RLS en Postgres (el cliente usa solo la anon key).
- **Multi-moneda**: cada cuenta/movimiento tiene su moneda; los totales se convierten a la moneda base del workspace con `exchange_rates` (conversión de paridad en `@darkmoney/shared/currency`).
- **Snapshot**: `useWorkspaceSnapshotQuery` trae el estado inicial consolidado en una llamada; los módulos refrescan dominios puntuales con `refreshSnapshotDomains`.
- **Transferencias**: un `transfer` maneja cuenta origen y destino, con montos y monedas distintas y `fxRate`.

## Desarrollo

```bash
npm install
npm start                # Expo dev server
npm run typecheck        # genera tipos de rutas + tsc --noEmit  (obligatorio antes de cerrar tarea)
npm test                 # jest
npm run test:movements   # smoke tests por dominio (también :dashboard, :accounts, :analytics, :parity)
npm run lint
```

Variables de entorno: copiar `.env.example` a `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`).

## Releases

- **Cambios solo JS/assets** → OTA, sin rebuild:
  ```bash
  npx eas-cli update --channel preview --message "descripción"
  ```
  El teléfono lo descarga al abrir la app y lo aplica en el siguiente arranque.
- **Cambios nativos** (Kotlin, permisos, deps nativas) → APK nuevo con bump de `version` en `app.json`:
  ```bash
  npm run build:android   # preflight de versión nativa + EAS build (perfil preview)
  ```
  El APK instalable debe venir de EAS (keystore cloud); un build local de Gradle no puede actualizar la app instalada. Detalles en [`docs/BUILD_APK.md`](docs/BUILD_APK.md).

⚠️ El código Kotlin existe en dos rutas: se edita en `plugins/notification-detection/native-src/` y **debe copiarse** a `android/app/src/main/java/` (Gradle solo compila esta última). Ver `CLAUDE.md`.

## Documentación

Índice completo con estado de cada doc en [`docs/README.md`](docs/README.md).

| Doc | Contenido |
|---|---|
| [`docs/APP_DESIGN_AND_CODE_PATTERNS.md`](docs/APP_DESIGN_AND_CODE_PATTERNS.md) | Patrones de diseño y código |
| [`docs/DARKMONEY_PHASE_2_INCOMING_FEATURES.md`](docs/DARKMONEY_PHASE_2_INCOMING_FEATURES.md) | Roadmap Fase 2 (reportes, chat IA, insights) |
| [`docs/BUILD_APK.md`](docs/BUILD_APK.md) | Pipeline de build Android |
| [`docs/UNIVERSAL_LINKS.md`](docs/UNIVERSAL_LINKS.md) | Deep links e invitaciones |
| `CLAUDE.md` | Guía operativa del repo (arquitectura, validación, detección) |
