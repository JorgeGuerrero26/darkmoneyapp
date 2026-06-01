# Fase 4.2 — Pendientes de modularización de obligations

Continuación del plan de **Fase 4 parte 2** (corte físico del megafile
`services/queries/workspace-data.ts`).

## Estado actual (commit `92be1d47`)

- ✅ **4.1** — `services/queries/obligations.ts` creado como shim público (90 líneas).
- ✅ **4.2-a** — Dedup payload helpers a `lib/obligation-event-payloads.ts`.
- ✅ **4.2-b** — Helpers compartidos + tipos privados marcados `export` en workspace-data.ts: `toNum`, `joinNotes`, `formatAmountWithCurrency`, `formatSupabaseError`, `isDuplicateConstraintMessage`, `runBackgroundQueryRefresh`, `invokeEdgeFunction`, `createOrRefreshNotificationRow`, `markNotificationReadByEntity`, `createMovement`, `ObligationSummaryRow`, `ObligationEventRow`, `ViewerEventLinkRow`, `OwnerMovementLookupRow`, `NotificationRefreshInput`. `MovementType` y `AttachmentLike` ya venían de `types/domain`.
- ✅ **4.2-c** — Cluster SHARES movido a `obligations-impl.ts`: 5 hooks (`useObligationActiveShareQuery`, `useObligationSharesQuery`, `usePendingObligationShareInvitesQuery`, `useCreateObligationShareInviteMutation`, `useUnlinkObligationShareMutation`), 3 tipos, 3 helpers privados (`mapObligationShareRow`, `copyIfMissing`, `obligationShareRecordToSnake`).
- ✅ **4.2-d** — Cluster SHARED-OBLIGATIONS movido: `obligationRowFromUnknown`, `eventRowFromUnknown`, `parseSharedObligationItem`, `fetchSharedObligations`, `useSharedObligationsQuery`, `mergeWorkspaceAndSharedObligations`.
- ✅ **4.2-e** — Cluster PAYMENT REQUESTS + VIEWER LINKS movido: 4 helpers, 4 tipos, 10 hooks. Exports temporales en workspace-data para `mapObligation`, `insertObligationPaymentEventWithFallback`, `attachMovementToObligationEvent` (consumidos por obligations-impl, se revertirán en 4.2-f).

**Tamaños actuales:**
- `workspace-data.ts`: 6,535 líneas (objetivo final: ~4,400).
- `obligations-impl.ts`: 1,375 líneas (objetivo final: ~1,800).
- `obligations.ts`: 90 líneas (shim, no cambia).

**Duplicación física inerte en workspace-data**: las funciones de los clusters 4.2-c/d/e siguen físicamente en workspace-data como código muerto porque el script de extracción falló y se hizo el restore por exports. **NO se ejecutan** (el shim apunta a obligations-impl). Se limpiarán en 4.2-f junto con el resto.

## Reglas obligatorias para 4.2-f

Lecciones aprendidas de fases anteriores:

1. **Un commit por sub-bloque movido**, NO uno solo al final de 4.2-f. Mínimo 4 commits internos. Cada uno con `npm run typecheck` verde antes del siguiente. Mensaje sugerido: `refactor(obligations): fase 4.2-f.N - <qué bloque>`.
2. **NO usar scripts Node con regex para mover código en bloque** — el intento anterior con `endOfBlock()` y brace-counting falló y se perdieron 4 sub-fases. Hacer cada bloque con `Edit` tool, anclas textuales únicas por símbolo.
3. **NUNCA `git checkout` ni `git restore`** sobre archivos uncommitted. Si un cambio sale mal, revertir con `Edit`.
4. **Antes de mover `mapObligation`**: confirmar que `fetchWorkspaceSnapshot` (línea ~1,120) sigue siendo el único caller en workspace-data. Después de moverlo, importarlo de vuelta desde `./obligations-impl`. No es ciclo init-time, solo función — OK.
5. **Cache keys de React Query**: idénticos.
6. **Edge function names**: idénticos.
7. **No cambiar firmas** ni comportamiento runtime.

---

## 4.2-f — Mover el cluster CORE (~1,200 líneas)

Línea numbers son al momento del commit base `92be1d47`. Verificar con `Grep` antes de cada bloque por si cambiaron.

### f.1 — Helpers de lookup y sync (commit propio)

**Mover a `obligations-impl.ts`:**

- `fetchNextObligationInstallmentNo` (l. 334) — privado en workspace-data, ya consumido internamente.
- `mapObligation` (l. 637) — **bloqueo crítico**: lo usa `fetchWorkspaceSnapshot` en l. ~1,120. Después de mover: `import { mapObligation } from "./obligations-impl"` en workspace-data y quitar el `export` temporal.
- `mapObligationEventRowsToSummaries` (l. 694) — privado.
- `fetchObligationEventsByObligationId` (l. 713) — privado, consumido por `useObligationEventsQuery` (que se mueve en f.4).
- `fetchObligationWorkspaceId` (l. 2655) — privado, consumido por payment/principal mutations.
- `resolveMovementAccountId` (l. 2909) — privado, consumido por update/accept-edit mutations.
- `syncViewerLinkedMovementsForEvent` (l. 2926) — privado, consumido por update mutation. Internamente llama `fetchViewerLinksForEvent` y `viewerLinkedEventMovementConfig` (ya en obligations-impl desde 4.2-e).
- `notifyAcceptedViewersObligationEventUpdated` (l. 3022) — privado, consumido por update mutation.
- `movementTypeForObligationEvent` (l. 3525), `readMovementMetadataEventId` (l. 3538) — privados, consumidos por resolveOwnerMovementId.
- `resolveOwnerMovementIdForObligationEvent` (l. 3563) — privado, consumido por delete mutation.
- `attachMovementToObligationEvent` (l. 3548) — público temporal, ya marcado `export` en 4.2-e. Mover, quitar el `export` temporal en workspace-data.

**Validación f.1**: typecheck verde. Smoke: abrir cuentas + dashboard (porque `mapObligation` cambió de archivo).

### f.2 — Helpers de notificación delete/edit + mutations CRUD básicas (commit propio)

**Mover a `obligations-impl.ts`:**

- `resolveViewerDeletePendingNotification` (l. 3657)
- `resolveOwnerDeleteRequestNotification` (l. 3701)
- `resolveViewerEditPendingNotification` (l. 3745)
- `resolveOwnerEditRequestNotification` (l. 3789)
- `insertObligationPaymentEventWithFallback` (l. 350) — público temporal desde 4.2-e. Mover, quitar `export` temporal.
- Tipo `ObligationFormInput` (búsqueda directa).
- `useDeleteObligationMutation` (l. 2489), `useArchiveObligationMutation` (l. 2519), `useCreateObligationMutation` (l. 2543), `useUpdateObligationMutation` (l. 2608).

**Validación f.2**: typecheck verde. Smoke: crear/archivar/editar/eliminar una obligación.

### f.3 — Mutations de event update + payment + principal (commit propio)

**Mover a `obligations-impl.ts`:**

- Tipo `ObligationPaymentInput` y `PrincipalAdjustmentInput` (búsqueda directa).
- `useCreateObligationPaymentMutation` (l. 2668)
- `useLinkMovementToObligationMutation` (l. 2745)
- `useCreatePrincipalAdjustmentMutation` (l. 2809)
- Tipo `UpdateObligationEventInput` (búsqueda directa).
- `updateObligationEventAndSyncMovements` (l. 3092) — privado, llama a `syncViewerLinkedMovementsForEvent` y `notifyAcceptedViewersObligationEventUpdated` (ya movidos en f.1).
- `useUpdateObligationEventMutation` (l. 3247)

**Validación f.3**: typecheck verde. Smoke: registrar pago + editar evento + ajuste de principal.

### f.4 — Mutations de delete/edit request + useObligationEventsQuery + cleanup (commit propio, = 4.2-g integrado)

**Mover a `obligations-impl.ts`:**

- Tipo `DeleteObligationEventInput`, `CreateObligationEventDeleteRequestInput`, `RejectObligationEventDeleteRequestInput`, `CreateObligationEventEditRequestInput`, `AcceptObligationEventEditRequestInput`, `RejectObligationEventEditRequestInput`.
- `useDeleteObligationEventMutation` (l. 3894)
- `useCreateObligationEventDeleteRequestMutation` (l. 4075)
- `useRejectObligationEventDeleteRequestMutation` (l. 4228)
- `useCreateObligationEventEditRequestMutation` (l. 4346)
- `useAcceptObligationEventEditRequestMutation` (l. 4406)
- `useRejectObligationEventEditRequestMutation` (l. 4505)
- `useObligationEventsQuery` (l. 5478)

**Limpieza final (parte del mismo commit):**

- Borrar de workspace-data las definiciones físicas duplicadas de los clusters 4.2-c/d/e que quedaron como código muerto (`mapObligationShareRow` l. 5185 y todo el bloque relacionado).
- En `obligations.ts` (shim), revisar que todos los re-exports vengan de `./obligations-impl`. Si workspace-data necesita algún símbolo (probable: ninguno excepto `mapObligation`), importarlo desde obligations-impl.
- Revertir exports temporales en workspace-data: cualquier `export` agregado en 4.2-b/c/d/e que ya no tenga callers (después de los moves de f.1-f.4) debe volver a `function` privada.

**Validación f.4**: typecheck verde. Smoke completo:
1. Owner crea obligación → registra pago → ajuste de principal → edita evento → elimina evento.
2. Owner comparte → viewer acepta.
3. Viewer pide pago → owner acepta → verificar movement espejo.
4. Viewer pide edit/delete → owner acepta/rechaza con motivo.
5. Owner desvincula.

**Tamaños finales esperados:**
- `workspace-data.ts`: ~4,400 líneas.
- `obligations-impl.ts`: ~2,400 líneas (mayor a la estimación inicial porque se acumuló duplicación física de fases anteriores).
- `obligations.ts`: 90 líneas.

---

## Convenciones para todas las sub-fases

- **Una sub-fase = un commit potencial**. Si typecheck falla, no avanzar.
- **No cambiar firmas** de hooks/funciones. Solo mover ubicación física.
- **No cambiar comportamiento runtime**. Si detectas un bug al leer el código, anótalo aquí y trátalo aparte.
- **Cache keys de React Query**: mantener idénticos.
- **Edge function names**: idénticos.
- **Sin scripts Node con regex** para mover bloques. Usar `Edit` con anclas textuales.
- **Sin `git checkout`/`git restore`** sobre archivos uncommitted. Revertir con `Edit`.
