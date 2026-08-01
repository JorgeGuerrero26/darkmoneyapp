# Fluidez: partir el snapshot en núcleo + diferido

> **Estado: IMPLEMENTADO** en `ce35dbb` (2026-07-30), publicado por OTA al canal `preview`.
> Se conserva por el contexto del diseño y por la sección "Fuera de alcance", que sigue
> pendiente. Dos desviaciones respecto de lo planeado:
>
> 1. **El paso 4 (opt-out `deferred: false` por pantalla) se descartó**: `app/_layout.tsx`
>    consume obligaciones y presupuestos para los recordatorios, así que la query diferida
>    queda habilitada desde la raíz y React Query la comparte por key. El opt-out por
>    pantalla no habría evitado ninguna consulta — habría sido código inerte.
> 2. **Apareció un sitio de cache no previsto**: `services/queries/budgets.ts` también
>    parchea el snapshot por prefijo (pin y borrado de presupuesto) y hubo que reapuntarlo
>    a la entrada diferida.
>
> Además hizo falta bumpear el `buster` de `lib/query-client.ts` (`2026-07-30-v1`): el
> snapshot persistido cambió de forma y un caché viejo habría hecho que el generador de
> notificaciones diera por cargadas obligaciones y presupuestos rancios.

## Contexto

Un guardado de movimiento de S/ 5 (2026-07-30, 12:25) tardó visiblemente. El log mostró 5
consultas secundarias de Créditos, Deudas y Presupuestos pendientes >8s justo en ese momento,
pese a que el usuario nunca abrió esos módulos.

Causa: `fetchWorkspaceSnapshot` ([workspace-data.ts:852-940](services/queries/workspace-data.ts#L852-L940))
dispara **14 consultas en paralelo** bajo una sola query key, y después encadena una **15ª
secuencial** (`obligation_events`, [workspace-data.ts:968-978](services/queries/workspace-data.ts#L968-L978))
que espera a que vuelvan las obligaciones para saber qué IDs pedir. Ese snapshot lo consumen
dashboard y movimientos por igual, así que abrir la app paga siempre el costo de obligaciones
y presupuestos, y esas consultas compiten con el POST del movimiento.

Esto es el "snapshot monolítico" que en el plan de fluidez original se dejó pendiente a falta
de evidencia. Ya hay evidencia.

Resultado buscado: el primer render y el camino de guardado dejan de esperar por
obligaciones/presupuestos, sin cambiar lo que ve el usuario en esos módulos.

## Diseño

Partir en dos queries que **comparten prefijo de key**:

- Núcleo `["workspace-snapshot", wsId, profileId]` — las 10 consultas restantes.
- Diferido `["workspace-snapshot", wsId, profileId, "deferred"]` — las 4 pesadas
  (`v_budget_progress`, `v_obligation_summary`, `obligations` texto, `obligation_events`),
  devuelve `{ budgets, obligations }`.

Compartir prefijo es deliberado: hay ~40 llamadas a
`invalidateQueries({ queryKey: ["workspace-snapshot"] })` repartidas por la app; con prefijo
común siguen invalidando ambas partes sin tocar ninguna de esas líneas. El precio es que los
sitios que manipulan el cache directamente ahora hacen match con las dos entradas y hay que
protegerlos (abajo).

`useWorkspaceSnapshotQuery` mantiene su firma y sigue devolviendo un objeto con forma
`WorkspaceSnapshot`; solo cambia *cuándo* se llenan `budgets` y `obligations`.

## Pasos

### 1. `services/queries/workspace-data.ts`

- Sacar de `fetchWorkspaceSnapshot` las 4 consultas pesadas y su mapeo (`mapBudget`,
  `mapObligation`, `mapObligationEventRowsToSummaries`) a `fetchWorkspaceDeferred(workspaceId, counterpartyMap)`.
  `mapObligation` ([obligations-impl.ts:1431](services/queries/obligations-impl.ts#L1431)) necesita
  el `Map<number,string>` de contrapartes, que se queda en el núcleo.
- `WorkspaceSnapshot.budgets` y `.obligations` pasan a opcionales (`?`). Esto es intencional:
  el typecheck enumera exactamente los consumidores que asumen "ya cargó".
- Nueva `useWorkspaceDeferredQuery(profile, wsId, enabled)`: lee el snapshot núcleo del cache
  para el mapa de contrapartes, `enabled: Boolean(core.data) && enabled`, mismo `staleTime`
  (`STALE.short`) y política de retry que el núcleo.
- `useWorkspaceSnapshotQuery(profile, wsId, options?: { deferred?: boolean })` compone ambas
  con `useMemo` y devuelve además `deferredLoading`. `deferred` por defecto `true`.

### 2. Blindar los sitios que tocan el cache por prefijo

Ahora hacen match con la entrada diferida y reventarían al leer campos del núcleo. Añadir un
guard `isCoreSnapshot(data)` (p.ej. `data && "accounts" in data`) en:

- `refreshSnapshotDomains` ([workspace-data.ts:1338](services/queries/workspace-data.ts#L1338)) —
  el `.find(([, data]) => data)` puede elegir la entrada equivocada. Además el dominio
  `"budgets"` debe escribir su patch en la entrada diferida, no en el núcleo.
- `patchSnapshotObligationPayment` ([snapshot-cache.ts:88](services/queries/snapshot-cache.ts#L88)) —
  hoy lee `old.workspaces` y escribe `old.obligations`; reapuntar a la key diferida y tomar la
  moneda base del núcleo.
- `patchSnapshotWithCreatedMovement` ([snapshot-cache.ts:25](services/queries/snapshot-cache.ts#L25)).
- `setQueriesData`/`getQueriesData` en
  [subscriptions-recurring-income.ts:166-179 y 340-352](services/queries/subscriptions-recurring-income.ts#L166-L179).

### 3. Ajustar consumidores (guiado por typecheck)

El patrón dominante ya es tolerante (`snapshot?.budgets ?? []` en
[dashboard.tsx:564](app/(app)/dashboard.tsx#L564), [MovementForm.tsx:342](components/forms/MovementForm.tsx#L342))
y no requiere cambios. Los que sí:

- `hooks/useNotificationGenerator.ts` — accede directo a `snapshot.budgets` / `snapshot.obligations`
  (líneas 178-306). No debe correr con la mitad de los datos: gatearlo hasta que el diferido cargó,
  o generaría un ciclo de alertas sin obligaciones ni presupuestos.
- `app/(app)/obligations.tsx:100` y `app/(app)/budgets.tsx:97` — el `isLoading` del skeleton debe
  incluir `deferredLoading`, si no se ve un vacío ("no tienes obligaciones") antes de los datos.
- `app/_layout.tsx:477-502` ya usa `if (!snapshot?.obligations) return;` → correcto sin tocar,
  siempre que "no cargado" sea `undefined` y no `[]`.

### 4. Optar por no cargar el diferido donde no se usa

`deferred: false` en pantallas que no leen obligaciones ni presupuestos:
`accounts.tsx`, `settings.tsx`, `categories.tsx`, `notification-detection.tsx`.

`movements.tsx` es el caso del incidente: la lista no los necesita, pero `MovementForm` sí usa
`budgets` para el impacto en presupuesto. Activar el diferido solo cuando el formulario está
montado, siguiendo el patrón de gating que ya introdujo `fix(startup): defer hidden queries`
(d543630) en ese mismo archivo.

El dashboard mantiene `deferred: true` (sus widgets los muestran), pero ya no bloquea el primer
render ni compite con el guardado.

## Fuera de alcance (siguiente tarea)

Adelgazar el diferido: `v_obligation_summary` usa `select("*")`, y la consulta extra a
`obligations` por `description/notes` puede ser redundante con la vista
([workspace-data.ts:904](services/queries/workspace-data.ts#L904) dice "a veces no incluye").
Verificar contra el esquema antes de tocar.

## Verificación

- `npm run typecheck` — es la red principal: al volver opcionales los dos campos, cada
  consumidor no adaptado sale como error.
- `npx jest __tests__/first-paint-query-gates.test.ts __tests__/workspace-loading-errors.test.ts lib/__tests__/query-refresh-coalescer.test.ts`
  (los tres tocan justo este camino; los dos primeros nacieron de los commits de arranque/fanout).
- Añadir caso a `__tests__/first-paint-query-gates.test.ts`: el núcleo resuelve sin esperar al
  diferido, y `movements` no dispara el diferido hasta abrir el formulario.
- `git diff --check`.

Prueba manual: abrir la app en el dashboard y registrar un movimiento pequeño enseguida —
el guardado no debe quedarse esperando. Luego entrar a Créditos y Deudas y a Presupuestos y
confirmar que cargan con skeleton (no con estado vacío) y que un pago de obligación sigue
reflejándose al instante.

## Commits

1. `refactor(snapshot): split deferred obligations and budgets` — pasos 1 y 2.
2. `fix(startup): defer obligations and budgets queries` — pasos 3 y 4 + tests.

## Riesgos

- **Estado vacío en vez de skeleton** si se escapa algún consumidor: mitigado por volver los
  campos opcionales (el typecheck los caza) y por el gate de `isLoading`.
- **Patches de cache apuntando a la entrada equivocada**: es el riesgo real del prefijo
  compartido; el paso 2 es obligatorio, no opcional.
- `useNotificationGenerator` corriendo con datos parciales podría emitir o resolver alertas mal;
  por eso se gatea explícitamente.
