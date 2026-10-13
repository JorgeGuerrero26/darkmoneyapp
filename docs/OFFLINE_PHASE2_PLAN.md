# Motor offline — Fase 2: SQLite, motor de sync y piloto de movimientos

Estado: **implementada y probada en automático (2026-10-12); pendiente de la prueba en iPhone/Android**
(`docs/OFFLINE_DEVICE_TEST.md`). Diseño: [OFFLINE_ENGINE_DESIGN.md](OFFLINE_ENGINE_DESIGN.md).
Servidor (Fase 1, ya en producción): [OFFLINE_PHASE1_PLAN.md](OFFLINE_PHASE1_PLAN.md).

## 1. Objetivo y alcance

Que **registrar, editar, anular y borrar movimientos** sea instantáneo y funcione sin red, y que se
sincronice solo (red recuperada, primer plano, tras cada guardado) más un botón manual. Piloto
acotado a **movimientos** (lectura y escritura); cuentas, categorías y contrapartes solo se
reflejan en local como espejo de lectura para mostrar nombres y calcular saldos.

**Entra:** motor propio (cola, pull, push, pool de IDs, bandeja de rechazos), SQLite por usuario,
lectura local de la lista y del detalle de movimientos, escritura local-first de las 4 mutaciones,
saldos de cuentas calculados en local, indicador de estado + botón "Sincronizar" + bandeja,
interruptor beta, build de iOS.

**No entra (Fases 3-5):** escritura offline de catálogos, presupuestos, suscripciones, obligaciones,
adjuntos, resumen filtrado con conversión de monedas offline, cifrado en reposo, migración del
caché de React Query.

## 2. Decisiones de ejecución

1. **Apagado por defecto, detrás de un interruptor** (Más → "Modo sin conexión (beta)"). Con el
   interruptor apagado el comportamiento es **idéntico al actual**; es la red de seguridad para
   una app que ya usan personas de verdad.
2. **Módulo nativo opcional.** `expo-sqlite` se carga con `require` protegido: en un binario
   viejo (APK 1.0.x, IPA 1.0.8) que reciba el JS por OTA, el motor queda "no disponible" y la app
   sigue como hoy. Mismo patrón que `lib/speech-recognition-safe.ts`.
3. **Punto de integración mínimo.** Se intercepta en `mutationFn` de las 4 mutaciones y en el
   `queryFn` de `usePaginatedMovements`/`useMovementQuery`. Las 5 pantallas que crean movimientos
   (formulario, asistente, dashboard, detección, plantillas) lo heredan sin cambios.
4. **Filtros idénticos a los del servidor.** `applyMovementFilters` recibe un constructor que
   acumula cláusulas SQL en vez de llamar a PostgREST: misma función, misma semántica.
5. **Saldos desde el espejo local** (`opening + entradas posted − salidas posted`, centavos
   enteros), validado contra `v_account_balances` con los fixtures reales. El refetch del
   servidor no puede pisar el saldo local mientras haya operaciones pendientes.
6. **Sin red y sin pool de IDs** (más de ~200 altas offline seguidas) se cae al camino online de
   hoy con su error; no se inventan IDs.
7. **Motor probado contra el servidor real (SQL de la Fase 1).** Las pruebas de integración usan
   PGlite con las migraciones reales + dos "dispositivos" (SQLite en memoria): alta offline de
   10 movimientos, reintentos, conflictos, borrado propagado, rechazos.

## 3. Estructura

```
lib/offline/
  sql-driver.ts        interfaz SqlDriver + serializador (mutex)
  expo-driver.ts       adaptador expo-sqlite (carga protegida, nombre de BD por usuario)
  schema.ts            migraciones de SQLite (PRAGMA user_version)
  outbox.ts            cola con fusión de operaciones consecutivas
  id-pool.ts           bloques de IDs reservados
  movement-store.ts    espejo + consultas locales + saldos
  sql-filter-builder.ts constructor SQL para applyMovementFilters
  sync-engine.ts       push → pull → ids vigentes, de una sola pasada y reentrante
  supabase-transport.ts RPC de la Fase 1
  runtime.ts           ciclo de vida, disparadores, estado observable, bandeja
  flag.ts              interruptor beta
components/ui o features/offline/  indicador, pantalla de estado y bandeja
```

## 4. Disparadores de sincronización

Tras cada escritura local (debounce 1 s) · al recuperar red (NetInfo) · al volver a primer plano ·
cada 5 min con la app abierta · botón manual · reintento con backoff 5 s → 5 min. Sincronización
con la app cerrada **no se promete** (iOS la limita y Android no es fiable).

## 5. Validación

| Qué | Cómo |
|---|---|
| Lógica del motor, cola, fusión, pool, filtros SQL, saldos | Jest con SQLite en memoria (`node:sqlite`) |
| Motor contra el SQL real de la Fase 1 | Jest + PGlite con las migraciones |
| Paridad de saldos y filtros con el servidor | Fixtures reales del workspace 1 |
| Tipos y regresión | `npm run typecheck`, `npm test`, `git diff --check` |
| **iPhone** | **Solo en dispositivo**, desde el IPA: protocolo en `docs/OFFLINE_DEVICE_TEST.md`. Las pruebas con gestos simulados no verifican el teléfono (lección del swipe, 2026-09-26) |

## 6. Despliegue

- Dependencia nativa → `version` 1.0.10 → **1.1.0** (runtime nuevo) y `versionCode` 12.
- IPA: workflow de GitHub Actions en runner macOS (el repo es público: minutos gratis) que corre
  `expo prebuild`, vacía entitlements (cuenta gratis), compila Release sin firmar y verifica que
  `ExpoSQLite` entró al binario. Se firma e instala con Sideloadly desde la PC.
  Requiere **tu autorización para el push** y dos secretos de GitHub (URL y clave anónima de
  Supabase). Ver `docs/BUILD_IPA_GITHUB.md`.
- `LEGACY_RUNTIMES` del publicador OTA: el runtime 1.0.10 y el 1.0.9/1.0.8 existentes no reciben
  el motor (no tienen SQLite); no se tocan.

## 7. Resultado de la ejecución (2026-10-12)

**Hecho y probado en automático**

| Qué | Cómo se probó | Resultado |
|---|---|---|
| Núcleo: cola con fusión, pool de IDs, filtros SQL, saldos en centavos, almacén | Jest (SQLite en memoria) | 33 pruebas |
| Runtime: encendido/apagado, sin módulo nativo, sin red, cierre de sesión, cambio de usuario, nudge | Jest con servidor falso | 13 pruebas |
| Motor contra el SQL real de la Fase 1: diez altas sin red, respuesta perdida sin duplicar, dos dispositivos, conflictos, borrado propagado, rechazos, 2.500 filas | `npm run test:offline-e2e` (PGlite + migraciones) | 17 pruebas |
| Paridad con **datos reales**: saldos = `v_account_balances`; 12 combinaciones de filtros y orden = implementación independiente | Jest sobre `.tmp/offline-fixtures` (local, no corre en CI) | 13 pruebas |
| Motor completo contra la **base real**, en una transacción revertida | `.tmp/offline-fixtures/engine-vs-prod.mjs` | descarga 1.159 filas en 2,2 s; 10 altas locales en 22 ms; envío en 2,0 s; ciclo sin cambios 0,2 s; saldos locales = servidor; conteos idénticos tras el rollback |
| Regresión de la app | `npm test` completo, `npm run typecheck`, paquete de iOS con `expo export` | 182 suites / 1.492 pruebas; el paquete trae el motor |

**Pendiente — requiere tu teléfono**

- Todo `docs/OFFLINE_DEVICE_TEST.md` (expo-sqlite real, red real, segundo plano en iOS).
- Prueba de swipe tras alternar Movimientos → Cuentas → Movimientos (regla de CLAUDE.md): la
  lista de Movimientos cambió de origen de datos. **Resultado: pendiente.**
- Primera ejecución del workflow del IPA (nunca corrió; ver errores conocidos en `docs/BUILD_IPA_GITHUB.md`).

**Limitaciones conocidas de esta fase (a propósito)**

- Solo **movimientos** se escriben offline. Cuentas, categorías, contactos, presupuestos,
  suscripciones y obligaciones siguen necesitando internet (Fases 3 y 4).
- **Inicio/Dashboard**: lo que viene de consultas propias (movimientos recientes, analíticas,
  presupuestos, historial por categoría) se pone al día al enviar; sin internet queda como estaba.
  Los **saldos** sí se actualizan al instante.
- El **resumen** de la lista (total de ingresos y gastos del filtro) lo calcula el servidor; sin
  internet muestra el último valor conocido.
- Los **comprobantes** (fotos) siguen necesitando internet.
- Si se agotan los ~200 IDs reservados estando sin red, guardar vuelve a pedir internet.
