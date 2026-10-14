# Fase 3.1–3.3 — informe de cierre

2026-10-13. **Las tres etapas están implementadas y verdes en validación automatizada.**
P1/P2 registradas. Sin preguntas abiertas para este alcance ni etapa a medias.
3.4–3.6 y Fase 4 no se iniciaron; la integración de los nuevos módulos sigue pendiente.

## Resultado

- **3.1:** migración aditiva escrita y probada localmente en PGlite, documentada en el
  diccionario. Ocurrencias de ingresos readonly con updated_at; suscripciones leídas por padre.
- **3.2:** SQLite v2, lector/escritor genéricos para diez tablas, IDs del pool, outbox y
  relaciones SET NULL/CASCADE. Historial readonly y dinero exacto como texto.
- **3.3:** funciones puras con paridad exacta de presupuestos, historial/pendientes y calendario.
  Reutiliza las funciones del dueño. Respaldo del servidor cuando falten precisión, datos,
  paridad o queden efectos de triggers sin confirmar.
- **P1:** pagar/confirmar llegada y modificar pagos vinculados requieren internet. El camino
  local no inicia ni encola una mitad. Con red se usa el camino online existente; beta apagada
  conserva sus firmas/textos. Dos hooks recibieron solamente estas guardas.
- **P2:** ocurrencias nunca entran al escritor ni al pool. Un monto con fracción de centavo
  queda readonly. SQL devuelve como texto el numeric(18,4) antes de que JavaScript lo lea.

**Esto todavía no habilita CRUD offline de los catálogos y módulos en sus pantallas.**
El núcleo y las réplicas están preparados; conectarlos corresponde a 3.4–3.5. La migración
también sigue pendiente de despliegue por el dueño.

## Validación final — códigos reales y salida literal

### npm run typecheck — código 0

```text
> darkmoney@1.0.0 typecheck
> node scripts/generate-route-types.mjs && tsc --noEmit

OK: C:\Users\Adrian\Documents\DarkMoneyApp\.expo\types\router.d.ts (19549 bytes)
```

### npm test -- --runInBand — código 0

Salida final literal (el argumento solo serializa la misma suite):

```text
Test Suites: 185 passed, 185 total
Tests:       1544 passed, 1544 total
Snapshots:   0 total
Time:        31.103 s, estimated 47 s
Ran all test suites.
```

### npm run test:offline-e2e — código 0

```text
✔ descarga a escala (2276.2896ms)
ℹ tests 24
ℹ suites 8
ℹ pass 24
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 30224.8144
```

### git diff --check — código 0

Sin errores de whitespace. Git emitió avisos LF → CRLF en archivos modificados; el log
literal completo está en [.tmp/phase3-final-whitespace.log](C:/Users/Adrian/Documents/DarkMoneyApp/.tmp/phase3-final-whitespace.log:1).

Adicional: `npm run lint`, código 0; salida literal: `✖ 424 problems (0 errors, 424 warnings)`.
No se ejecutó --fix ni se reformateó el trabajo del dueño. Algunas ejecuciones anteriores de
Jest avisaron de handles abiertos; la última finalizó con código 0 sin ese aviso.

### Resultados por etapa y fallos intermedios

| Cierre | typecheck | Jest | PGlite | diff --check |
| --- | --- | --- | --- | --- |
| 3.1 | 0 | 183 suites / 1.507 tests; 0 | 21 tests / 7 suites / 0 fail; 0 | 0 |
| 3.2 | 0 | 184 suites / 1.518 tests; 0 | 24 tests / 8 suites / 0 fail; 0 | 0 |
| 3.3 final | 0 | 185 suites / 1.544 tests; 0 | 24 tests / 8 suites / 0 fail; 0 | 0 |

Se encontraron y corrigieron estos fallos, sin retirar pruebas:

1. TypeScript: acceso a metadata antes de estrechar el tipo JsonValue.
2. PGlite: borrado del padre recién insertado en el mismo lote daba edited_since. Ahora se
   confirma el prefijo y se rebasa la operación siguiente con la versión del servidor.
3. PGlite: RESTRICT dio SQLSTATE 23001; el cliente ahora lo clasifica como dependencia.
4. Paridad de calendario: el fixture del driver pg tenía IDs string y el JSON numéricos.
   Se normalizó la comparación del fixture. La captura inicial se corrigió además para
   consultar el cuarto argumento real day_of_month del calendario SQL.

Los logs por etapa permanecen en `.tmp/phase3-1-*`, `.tmp/phase3-2-*`, `.tmp/phase3-3-*`.
Los finales completos son `.tmp/phase3-final-{typecheck,jest,e2e,whitespace,lint}.log`.

## Evidencia de paridad

Captura real de 2026-10-13: 1.119 movimientos, 5 cuentas, 27 categorías, 9 contactos,
3 tipos de gasto, 5 presupuestos, 5 suscripciones, 9 ocurrencias y 2 tasas. Las lecturas
se hicieron dentro de BEGIN READ ONLY, siempre terminadas en ROLLBACK.

- Todos los campos de los **5 presupuestos** coinciden exactamente con v_budget_progress.
- Todas las filas de v_subscription_upcoming (**1 pendiente**) coinciden; los agregados
  de pendientes de las **5 suscripciones** coinciden con consultas SQL independientes.
- Próxima fecha: **5 suscripciones reales y 108 casos SELECT** (seis frecuencias, dos
  intervalos, anclas nula/31/4, fin de mes y bisiesto) coinciden con next_subscription_due.
- subscriptionStanding se reutiliza y se compara contra el presenter actual. No existe
  una vista SQL equivalente al texto de estado; no se anuncia como paridad de esa vista.
  Su dinero se contrasta con el agregado exacto del historial; si pierde centavos, se mantiene
  el estado previo. Las pruebas privadas se omiten en CI cuando falta el fixture.

## Archivos de esta tarea

### Creados

- [supabase/migrations/202610130001_sync_readonly_occurrences.sql](C:/Users/Adrian/Documents/DarkMoneyApp/supabase/migrations/202610130001_sync_readonly_occurrences.sql:1): Migración aditiva readonly; sin aplicar a producción.
- [lib/offline/money.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/money.ts:1): Texto decimal exacto, centavos y rechazo de fracciones.
- [lib/offline/resource-store.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/resource-store.ts:1): Lectura por workspace/usuario y relaciones de borrado.
- [lib/offline/resource-writes.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/resource-writes.ts:1): CRUD genérico con pool, transacción y outbox.
- [lib/offline/calculation.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/calculation.ts:1): Gate del cálculo y aritmética decimal con BigInt.
- [features/budgets/lib/offlineBudgetProgress.ts](C:/Users/Adrian/Documents/DarkMoneyApp/features/budgets/lib/offlineBudgetProgress.ts:1): Réplica pura de v_budget_progress.
- [features/subscriptions/lib/offlineSubscriptionState.ts](C:/Users/Adrian/Documents/DarkMoneyApp/features/subscriptions/lib/offlineSubscriptionState.ts:1): Vista, pendientes y reutilización de estado/calendario.
- [lib/offline/__tests__/resource-writes.test.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/__tests__/resource-writes.test.ts:1): Diez tablas, dinero, relaciones, migración v1→v2.
- [lib/offline/__tests__/phase3-calculations.test.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/__tests__/phase3-calculations.test.ts:1): Casos límite y paridad con captura real.
- [docs/OFFLINE_PHASE3_REPORT.md](C:/Users/Adrian/Documents/DarkMoneyApp/docs/OFFLINE_PHASE3_REPORT.md:1): Este informe.

### Modificados

- [lib/offline/schema.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/schema.ts:1): Lista blanca y SQLite v2; SQL v1 intacto.
- [lib/offline/movement-store.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/movement-store.ts:65): Espejos nuevos con dinero como texto y efectos de borrado.
- [lib/offline/outbox.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/outbox.ts:64): Conservar insert de padre antes de borrarlo después de sus hijos.
- [lib/offline/sync-types.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/sync-types.ts:1): Contrato opcional de lectura de ocurrencias por padre.
- [lib/offline/supabase-transport.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/supabase-transport.ts:1): RPC nuevo y compatibilidad con servidor anterior.
- [lib/offline/sync-engine.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/sync-engine.ts:1): Pool, pull, hidratación por tabla, lotes y rechazos.
- [lib/offline/runtime.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/runtime.ts:311): API genérica y flujos compuestos online-only.
- [lib/offline/status-copy.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/status-copy.ts:1): Aviso claro y rechazo por dependencias.
- [services/queries/subscriptions-recurring-income.ts](C:/Users/Adrian/Documents/DarkMoneyApp/services/queries/subscriptions-recurring-income.ts:429): Guarda mínima antes de pagar suscripción.
- [services/queries/workspace-data.ts](C:/Users/Adrian/Documents/DarkMoneyApp/services/queries/workspace-data.ts:3157): Guarda mínima antes de confirmar llegada.
- [lib/offline/__tests__/runtime.test.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/__tests__/runtime.test.ts:1): Beta, recursos hidratados y cero escrituras de compuesto offline.
- [lib/offline/__tests__/sync-engine.e2e.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/__tests__/sync-engine.e2e.ts:1): Contrato de migración, hijos readonly, causalidad y RESTRICT.
- [lib/offline/__tests__/helpers/pglite-server.ts](C:/Users/Adrian/Documents/DarkMoneyApp/lib/offline/__tests__/helpers/pglite-server.ts:1): Harness de ocurrencias y opción de servidor antiguo.
- [docs/OFFLINE_ENGINE_DESIGN.md](C:/Users/Adrian/Documents/DarkMoneyApp/docs/OFFLINE_ENGINE_DESIGN.md:1): Estado real y alcance actual.
- [docs/OFFLINE_PHASE1_PLAN.md](C:/Users/Adrian/Documents/DarkMoneyApp/docs/OFFLINE_PHASE1_PLAN.md:1): Estado real de la Fase 1; cambios del diagnóstico 3.0.
- [docs/OFFLINE_PHASE3_PLAN.md](C:/Users/Adrian/Documents/DarkMoneyApp/docs/OFFLINE_PHASE3_PLAN.md:176): P1/P2, etapas, hallazgos, resultados y requisitos de integración.
- [docs/OFFLINE_PHASE4_PLAN.md](C:/Users/Adrian/Documents/DarkMoneyApp/docs/OFFLINE_PHASE4_PLAN.md:8): Requisito atómico del dueño, sin diseñarlo.
- [docs/OFFLINE_DEVICE_TEST.md](C:/Users/Adrian/Documents/DarkMoneyApp/docs/OFFLINE_DEVICE_TEST.md:78): Casos nuevos; prueba nativa pendiente.

Los planes 3/4 ya existían como archivos sin tracking; se editaron, no se stagearon.

### Locales gitignored

- [DATABASE_DICTIONARY.md](C:/Users/Adrian/Documents/DarkMoneyApp/DATABASE_DICTIONARY.md:1): tipos corregidos en
  el diagnóstico y documentación de la nueva migración, índice/trigger/RPC/rollback.
- [.tmp/offline-fixtures/phase3-schema-readonly.mjs](C:/Users/Adrian/Documents/DarkMoneyApp/.tmp/offline-fixtures/phase3-schema-readonly.mjs:1): inspección SELECT de esquema.
- [.tmp/offline-fixtures/phase3-parity-readonly.mjs](C:/Users/Adrian/Documents/DarkMoneyApp/.tmp/offline-fixtures/phase3-parity-readonly.mjs:1): captura SELECT de tablas/vistas/calendario.
- `.tmp/offline-fixtures/phase3-schema.json` y `phase3-parity.json`: evidencia privada local;
  no incluirlos en un commit. Credenciales leídas de .env solo en memoria, nunca impresas/copias.
- `.tmp/write-phase3-server.py`, `.tmp/register-phase3-decisions.py`,
  `.tmp/close-phase3-report.py` y `.tmp/phase3-published-hashes.json`: auxiliares de esta tarea.
- `.tmp/offline-tests/**` y `.expo/types/router.d.ts`: salidas regeneradas de los comandos.

No se editaron los cambios previos del dueño en app/subscriptions.tsx, features/subscriptions
(archivos existentes), lib/subscription-helpers.ts, features/notifications, app/(app)/more.tsx,
db-backup.yml o RESTORE_BACKUP.md. Se añadió un archivo nuevo en features/subscriptions/lib;
las funciones existentes del dueño solo se importan.

## Qué probar en el teléfono — pendiente

La guía ampliada está en [OFFLINE_DEVICE_TEST.md](C:/Users/Adrian/Documents/DarkMoneyApp/docs/OFFLINE_DEVICE_TEST.md:78).
**No se probó el iPhone/Android ni expo-sqlite real.** No hay OTA/build publicado con esta entrega.
Después del despliegue aprobado y, para CRUD nuevos, de integrar 3.4–3.5:

1. Actualización de SQLite v1 a v2 con filas/outbox pendientes, cierre y reapertura sin red.
2. Beta apagada y binario sin SQLite: mismo comportamiento online anterior.
3. Pagar/confirmar llegada y editar/anular/borrar pagos vinculados sin red: aviso, formulario
   conservado y cero escrituras parciales. Con red, mismo flujo online.
4. Crear catálogo → movimiento → borrar catálogo; rechazo por RESTRICT, bandeja y referencias
   restauradas; apagar/encender red y comprobar un solo envío.
5. CRUD de presupuesto/definiciones/plantillas/metas, aislamiento de usuario/workspace,
   IDs agotados y persistencia tras cerrar la app.
6. Historial readonly con cuatro decimales; presupuesto convertido con tasas persistidas,
   límites/fechas y respaldo del servidor; suscripciones con ancla 31 y meses saltados.
7. Swipe de filas 1, 2 y 4 al alternar Movimientos → Cuentas → Movimientos, segundo plano,
   filtros y scroll. detachInactiveScreens no se tocó.

## Riesgos y supuestos

- Migración escrita **sin aplicar a producción**. Servidor viejo: conserva caché de historiales
  desconocidos y no los marca hidratados. El dueño debe desplegar servidor compatible primero.
- La integración debe llenar defaults reales, preservar firmas y calcular readiness por todas
  las tablas/tasas necesarias. Debe activar serverEffectsPending para definiciones con triggers
  sin confirmar; las réplicas no generan ocurrencias ni avanzan fechas/períodos.
- Paridad de fechas presupuestarias verificada con zona SQL UTC. Otra zona conserva el valor
  del servidor. La captura real es limitada a esos datos/contratos; no cubre toda combinación
  posible ni verifica native SQLite, almacenamiento/segundo plano o gestos del teléfono.
- El harness PGlite usa relaciones/políticas representativas; no reproduce todos los triggers
  financieros de producción. Las pruebas de compuestos demuestran que el lote actual admite
  fallos parciales; **no es atómico**. P1 los mantiene online-only en esta fase.
- Fase 4 requiere operación atómica de grupo con rollback/reintento/bandeja; quedó anotado,
  sin diseño ni implementación. Fuera de alcance: permisos compartidos/viewers/obligaciones.
- Más pools y lectura de IDs del historial aumentan coste de descarga; medir en dispositivo.
- Cambios previos del dueño permanecen mezclados en el árbol; no agruparlos al commitear.

No se ejecutó git add, commit ni push. No se aplicó DDL a la base real ni se publicó OTA/EAS.
Los tres archivos de migraciones publicadas verificaron el mismo SHA-256; el SQL de SQLite v1
también tiene hash inmutable comprobado en Jest. No se anunció una función nueva en changelog.
