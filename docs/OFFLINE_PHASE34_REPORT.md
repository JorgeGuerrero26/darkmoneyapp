# Fases 3 y 4 del modo sin conexión — informe de cierre

2026-10-14. Rama local **`offline-fase3-4`** (17 commits sobre `main` en `7b04ed29`). Sin push, sin migraciones a
producción, sin OTA/EAS, sin lanzar el workflow del IPA. **Nada de esto se probó en un teléfono.**

## 1. Qué quedó hecho

**Fase 3 (3.4–3.6): completa en automático.** Con el interruptor encendido, cuentas, categorías, contactos, tipos de gasto,
plantillas, presupuestos y las definiciones de suscripciones e ingresos recurrentes se crean, editan y borran por la base local y
se sincronizan solos, con las mismas validaciones del camino online. Pagar una suscripción y confirmar la llegada de un ingreso
siguen en línea (decisión P1). Detalle: [docs/OFFLINE_PHASE3_PLAN.md](OFFLINE_PHASE3_PLAN.md) sección 9.

**Fase 4: ejecutada con el alcance que permite la decisión del dueño (pagos y flujos compuestos en línea, sin operación atómica de
grupo).** Obligaciones como definiciones sincronizables (crear, editar, archivar), todos los espacios del usuario sincronizados,
y obligaciones compartidas contigo guardadas para leerlas sin red. Detalle y lo que queda fuera:
[docs/OFFLINE_PHASE4_PLAN.md](OFFLINE_PHASE4_PLAN.md) sección 6.

Además se corrigieron dos fallos de la Fase 2 que salieron del análisis y de tu prueba en el iPhone:

1. **Saldo duplicado mientras había cambios pendientes** (+1 se veía como +2): el parche optimista volvía a sumar un movimiento
   que la base local ya había contado. Corregido en [snapshot-cache.ts](../services/queries/snapshot-cache.ts) y
   [workspace-data.ts](../services/queries/workspace-data.ts). *No verificado en el teléfono: el IPA instalado no lo trae.*
2. **Cambios guardados en un espacio que no se enviaban al pasar a otro**: el envío era por espacio abierto. Ahora el runtime
   sincroniza todos los espacios y cuenta lo pendiente de todos ([runtime.ts](../lib/offline/runtime.ts)).

## 2. Qué tienes que hacer tú (en este orden)

1. **Revisar la rama** `offline-fase3-4` (`git log main..offline-fase3-4`). `main` se movió en paralelo (otros commits tuyos); el
   merge se resuelve con `git merge` o un PR cuando decidas.
2. **Migraciones de servidor, en orden, solo cuando lo apruebes:**
   `202610130001_sync_readonly_occurrences.sql` (**redefine `pull_changes`**, la función que usa el motor de movimientos que ya
   probaste) y `202610140001_sync_obligations.sql`. Existe también `202610130002_detected_movement_split.sql`, que es de otro
   trabajo tuyo y no tiene relación. Tras aplicar la primera, comprobar con el cliente 1.1.0 ya instalado que sigue sincronizando
   igual. El cliente es tolerante a un servidor sin ellas (probado), así que el orden seguro es servidor primero.
3. **Compilar/entregar el cliente**: solo JS y esquema SQLite local (v2→v3 al arrancar con el interruptor encendido) → llega al
   runtime 1.1.0 por OTA (`npm run ota`). El OTA empaqueta lo que haya en la carpeta: hacerlo desde la rama ya mezclada.
4. **Probar en el iPhone** con [docs/OFFLINE_DEVICE_TEST.md](OFFLINE_DEVICE_TEST.md): secciones A–F (Fase 3) y G–L (Fase 4). Incluye
   la prueba de swipe de CLAUDE.md: se tocó el slot `context` de varias listas.
5. **Decidir las preguntas abiertas** (sección 5).

## 3. Archivos principales (63 en total; el resto son pruebas y documentos)

**Servidor (sin aplicar)**
- [202610130001_sync_readonly_occurrences.sql](../supabase/migrations/202610130001_sync_readonly_occurrences.sql): historial de
  ingresos de solo lectura, lectura de ocurrencias de suscripciones por el padre.
- [202610140001_sync_obligations.sql](../supabase/migrations/202610140001_sync_obligations.sql): `obligations` como tabla sincronizable.

**Motor**
- [schema.ts](../lib/offline/schema.ts) (SQLite v2 y v3), [resource-store.ts](../lib/offline/resource-store.ts),
  [resource-writes.ts](../lib/offline/resource-writes.ts), [money.ts](../lib/offline/money.ts), [runtime.ts](../lib/offline/runtime.ts),
  [local-rows.ts](../lib/offline/local-rows.ts), [sync-engine.ts](../lib/offline/sync-engine.ts).

**Integración**
- Lectura y cache: [offline-snapshot.ts](../services/queries/offline-snapshot.ts), [offline-budgets.ts](../services/queries/offline-budgets.ts),
  [offline-obligations.ts](../services/queries/offline-obligations.ts), [offline-writes.ts](../services/queries/offline-writes.ts),
  [useOfflineBridge.ts](../hooks/useOfflineBridge.ts).
- Hooks con la base local primero: [accounts.ts](../services/queries/accounts.ts), [categories-counterparties.ts](../services/queries/categories-counterparties.ts),
  [spend-types.ts](../services/queries/spend-types.ts), [budgets.ts](../services/queries/budgets.ts), [movement-templates.ts](../services/queries/movement-templates.ts),
  [subscriptions-recurring-income.ts](../services/queries/subscriptions-recurring-income.ts), [obligations-impl.ts](../services/queries/obligations-impl.ts).
- Lógica pura: [offlineObligations.ts](../features/obligations/lib/offlineObligations.ts), [offlineBudgetProgress.ts](../features/budgets/lib/offlineBudgetProgress.ts),
  [offlineSubscriptionState.ts](../features/subscriptions/lib/offlineSubscriptionState.ts).
- UI: [OfflineSyncNotice.tsx](../components/offline/OfflineSyncNotice.tsx) (`OfflineContextSlot`) en Cuentas, Presupuestos, Categorías, Contactos,
  Tipos de gasto, Ingresos recurrentes y Obligaciones. **No** en Suscripciones: ese archivo tiene cambios tuyos sin commitear.
- Persistencia: [query-client.ts](../lib/query-client.ts) (`shouldPersistQueryRoot`).

## 4. Etapas

| Etapa | Estado |
|---|---|
| Fase 3: 3.0–3.3 (Codex), 3.4 integración, 3.5 aviso en pantallas, 3.6 pruebas | hechas (en automático) |
| Fase 4: 4.0 verificación, 4.1 servidor, 4.2 varios espacios, 4.3 núcleo, 4.5 integración, 4.6 invitados, 4.7 pruebas | hechas con el alcance de la sección 1 |
| Fase 4: 4.4 réplica de `v_obligation_summary` | **no aplica** (ver plan de la Fase 4, preguntas 2) |
| Operación atómica de grupo (pagos de obligaciones, apertura de obligación con movimiento) | **no implementada**, a propósito |
| Prueba en iPhone/Android | **pendiente** |

## 5. Preguntas abiertas

1. **Operación atómica de grupo** en el servidor (evento + movimiento, obligación + movimiento de apertura): sin ella, esos flujos no
   se pueden ofrecer sin conexión. Es la decisión más importante pendiente y toca dinero.
2. **Espejar `obligation_events` de solo lectura** para poder borrar obligaciones y replicar `v_obligation_summary` con paridad.
3. **Metas y roles de contacto** (`workspace_financial_goals`, `counterparty_roles`) están en el motor pero la app no tiene pantalla
   que las use; no se integró nada.

## 6. Validación — salidas literales de esta ejecución

`npm run typecheck` — código 0:

```text
> darkmoney@1.0.0 typecheck
> node scripts/generate-route-types.mjs && tsc --noEmit

OK: C:\Users\Adrian\Documents\DarkMoneyApp\.expo\types\router.d.ts (19549 bytes)
```

`npm test -- --runInBand --forceExit` — código 0 (sin `--forceExit` los resultados son los mismos pero el proceso no termina solo
por manejadores abiertos de Jest, un aviso que ya existía antes de estos cambios):

```text
Test Suites: 196 passed, 196 total
Tests:       1634 passed, 1634 total
Snapshots:   0 total
Time:        51.253 s
Ran all test suites.
```

`npm run test:offline-e2e` — código 0:

```text
ℹ tests 33
ℹ suites 10
ℹ pass 33
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 61341.0213
```

`git diff --check` (árbol de trabajo) y `git diff --check <base>..HEAD` (rama) — ambos código 0, sin errores de espacios
(solo avisos LF→CRLF de Git en Windows).

## 7. Qué probar a mano en el iPhone

Ver [docs/OFFLINE_DEVICE_TEST.md](OFFLINE_DEVICE_TEST.md), sección 8: A–F (catálogos, presupuesto, suscripciones; saldo sin
duplicar), G–L (obligaciones sin red, apertura con movimiento, contacto con deudas, pagos en línea, varios espacios), más los
casos extendidos. Imprescindible: la prueba de swipe Movimientos → Cuentas → Movimientos (varios ciclos, con y sin scroll).

## 8. Riesgos y supuestos

- **La migración `202610130001` reemplaza `pull_changes`.** Está probada contra las migraciones reales en PGlite, pero no contra
  producción ni con el IPA real. Aplicarla es lo que primero conviene vigilar.
- **Varios espacios**: cada espacio reserva ~200 IDs por tabla escribible (13 tablas) y descarga su copia completa la primera vez.
  Con tus 7 espacios es poco, pero no está medido en un teléfono.
- **Avance de presupuestos** calculado en el teléfono solo con cambios pendientes y asumiendo zona horaria del servidor UTC; ante
  cualquier duda cae al valor del servidor. Paridad verificada con tus datos reales, no con todos los casos posibles.
- **Obligaciones**: la lista local de una obligación recién creada sin red muestra pendiente = principal; el servidor puede
  normalizar campos al sincronizar y el valor definitivo es el suyo.
- **Datos de otras personas en disco**: `shared-obligations` se guarda sin cifrar mientras el modo esté encendido, igual que el
  resto del cache. El cifrado en reposo sigue siendo trabajo de una Fase 5.
- **No verificado en dispositivo**: expo-sqlite real, el arreglo del saldo duplicado, el comportamiento al ir a segundo plano con
  varios espacios, ni gestos.
- **Árbol de trabajo**: tus cambios sin commitear (suscripciones, notificaciones, `db-backup`, `RESTORE_BACKUP`) y los de otro
  trabajo en curso (`features/detected-movements/**`, `202610130002_*`, `docs/DETECTED-SPLIT-ATOMIC-PHASE1.md`) no se tocaron ni
  entraron en ningún commit.
