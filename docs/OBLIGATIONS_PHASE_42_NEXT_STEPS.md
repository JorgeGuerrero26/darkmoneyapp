# Fase 4.2 — Pendientes de modularización de obligations

Continuación del plan de **Fase 4 parte 2** (corte físico del megafile
`services/queries/workspace-data.ts`). Lo entregado hasta hoy:

- **4.1** — `services/queries/obligations.ts` creado como shim de re-exports (48 símbolos). 15 callers migrados.
- **4.2-a** — Dedup payload helpers: `eventDeletePayload`, `eventEditPayload`, `readEventDeletePayload`, `readEventEditPayload`, tipos `EventDeleteRequestPayload`/`EventEditRequestPayload` movidos a `lib/obligation-event-payloads.ts`. `workspace-data.ts` bajó ~180 líneas.

Lo que queda son cinco sub-pasos en orden de riesgo creciente. Cada uno debe
dejar `npm run typecheck` + `git diff --check` verdes antes de seguir.

---

## 4.2-b — Exportar helpers compartidos

**Objetivo:** que `services/queries/obligations-impl.ts` (a crear en 4.2-c) pueda importar todos los helpers que comparte con otros dominios sin redefinirlos.

**Helpers a marcar `export` en `services/queries/workspace-data.ts`** (sin moverlos todavía):

| Helper | Ubicación aprox | Usado por (obligations) |
|---|---:|---|
| `toNum` | l. 66 | mapObligation, fetchObligationWorkspaceId, rowToPaymentRequest |
| `joinNotes` | l. 72 | payment/principal mutations |
| `formatAmountWithCurrency` | l. 79 | notification copy generators |
| `formatSupabaseError` | l. 86 | mutations con manejo de error específico |
| `isDuplicateConstraintMessage` | l. 97 | insertObligationPaymentEventWithFallback |
| `runBackgroundQueryRefresh` | l. 165 | TODAS las mutations onSuccess |
| `invokeEdgeFunction` | l. 4730 | useCreateObligationShareInviteMutation, useUnlinkObligationShareMutation, fetchSharedObligations |
| `createOrRefreshNotificationRow` | l. 3843 | event mutations que emiten notificaciones |
| `markNotificationReadByEntity` | l. 3638 | resolve*Notification helpers |
| `createMovement` | l. 2222 | useCreateObligationPaymentMutation (vía payload directo, NO llamada) |

**Tipos privados a marcar `export`:**

| Tipo | Ubicación | Razón |
|---|---:|---|
| `ObligationEventRow` | búsqueda directa | mapObligationEventRowsToSummaries |
| `ObligationSummaryRow` | búsqueda directa | mapObligation, obligationRowFromUnknown |
| `ViewerEventLinkRow` | l. 3316 | fetchViewerLinksForEvent, deleteViewerLinksForEvent |
| `NotificationRefreshInput` | búsqueda directa | createOrRefreshNotificationRow callers |
| `OwnerMovementLookupRow` | l. 3324 | resolveOwnerMovementIdForObligationEvent |
| `MovementType` | búsqueda en types/domain | viewerLinkedEventMovementConfig |
| `AttachmentLike` | búsqueda directa | ObligationPaymentInput |

**Cambio único en el archivo:** prefijar `export` a cada `function` y `type`
listado arriba. Cero cambio de runtime. Cero cambio en callers existentes
porque seguirán importando desde donde sea que ya importen.

**Validación:** `npm run typecheck` debe seguir verde sin tocar nada más.

---

## 4.2-c — Mover el cluster de SHARES a obligations-impl.ts

**Objetivo:** primer corte físico real. Cluster autónomo, no toca mutations CRUD de obligations.

**Crear `services/queries/obligations-impl.ts`** con:

- Imports desde `./workspace-data` (los símbolos exportados en 4.2-b).
- Tipos exportados: `ObligationShareInviteInput`, `ObligationShareInviteResult`, `UnlinkObligationShareInput`.
- Helpers privados a mover: `mapObligationShareRow` (l. 5182), `copyIfMissing` (l. 5255), `obligationShareRecordToSnake` (l. 5260).
- Hooks/queries a mover:
  - `useObligationActiveShareQuery` (l. 5204)
  - `useObligationSharesQuery` (l. 5232)
  - `usePendingObligationShareInvitesQuery` (l. 5489)
  - `useCreateObligationShareInviteMutation` (l. 5582)
  - `useUnlinkObligationShareMutation` (l. 5624)

**Borrar** las definiciones movidas de `workspace-data.ts`.

**Cambiar `services/queries/obligations.ts`** (el shim de 4.1) para que estos 5 hooks vengan de `./obligations-impl` en vez de `./workspace-data`.

**Validación adicional al typecheck:** smoke manual del flujo de compartir obligación → invitar a un email → aceptar como viewer → desvincular.

---

## 4.2-d — Mover el cluster de SHARED OBLIGATIONS

**Objetivo:** parsing remoto desde edge function `list-shared-obligations`.

**Mover a `obligations-impl.ts`:**

- Helpers privados: `obligationRowFromUnknown` (l. 5278), `eventRowFromUnknown` (l. 5346), `parseSharedObligationItem` (l. 5373), `fetchSharedObligations` (l. 5421).
- Funciones públicas:
  - `useSharedObligationsQuery` (l. 5451)
  - `mergeWorkspaceAndSharedObligations` (l. 5462)

**Cuidado con:** estos helpers dependen de `mapObligationShareRow` ya movido en 4.2-c, y de tipos como `SharedObligationSummary`, `ObligationEventSummary` (de `types/domain`).

**Validación adicional:** smoke como viewer compartido en una obligación de otra cuenta — debe cargar el snapshot con el evento history correcto.

---

## 4.2-e — Mover el cluster de VIEWER LINKS y PAYMENT REQUESTS

**Objetivo:** el cluster más interconectado pero todavía sin mutations CRUD core.

**Helpers privados a mover:**

- `viewerLinkedEventMovementConfig` (l. 6220)
- `fetchViewerLinksForEvent` (l. 3490)
- `deleteViewerLinksForEvent` (l. 3500)
- `rowToPaymentRequest` (l. 5671)

**Hooks/mutations a mover:**

- `useObligationEventViewerLinksQuery` (l. 6170)
- `useLinkEventToAccountMutation` (l. 6300)
- `useUpsertLinkEventToAccountMutation` (l. 6378)
- `useDeleteViewerEventLinkMutation` (l. 6504)
- `useCreatePaymentRequestMutation` (l. 5781)
- `useAcceptPaymentRequestMutation` (l. 5935)
- `useRejectPaymentRequestMutation` (l. 6079)
- `usePendingPaymentRequestCountsQuery` (l. 5696)
- `useObligationPaymentRequestsQuery` (l. 5743)
- `useViewerPaymentRequestsQuery` (l. 5720)

**Tipos públicos:** `PaymentRequestInput`, `AcceptPaymentRequestInput`, `LinkEventToAccountInput`, `DeleteViewerEventLinkInput`.

**Cuidado con:** `useUpsertLinkEventToAccountMutation` invoca `mirrorObligationEventAttachmentsToMovement` (de `services/queries/attachments.ts`) — verificar import path desde el nuevo archivo.

**Validación:** smoke completo de flujo bilateral: viewer crea payment request → owner acepta con cuenta seleccionada → verificar movement espejo en cuenta del viewer → viewer cambia cuenta asociada → verificar reasignación.

---

## 4.2-f — Mover el cluster CORE de mutations (el más grande)

**Objetivo:** ~1,200 líneas que arrastran el resto.

**Helpers privados a mover:**

- `fetchNextObligationInstallmentNo` (l. 334)
- `insertObligationPaymentEventWithFallback` (l. 350)
- `mapObligation` (l. 637)
- `mapObligationEventRowsToSummaries` (l. 694)
- `fetchObligationEventsByObligationId` (l. 713)
- `fetchObligationWorkspaceId` (l. 2652)
- `resolveMovementAccountId` (l. 2906)
- `syncViewerLinkedMovementsForEvent` (l. 2923)
- `notifyAcceptedViewersObligationEventUpdated` (l. 3019)
- `updateObligationEventAndSyncMovements` (l. 3089)
- `movementTypeForObligationEvent` (l. 3522)
- `readMovementMetadataEventId` (l. 3535)
- `attachMovementToObligationEvent` (l. 3545)
- `resolveOwnerMovementIdForObligationEvent` (l. 3560)
- `resolveViewerDeletePendingNotification` (l. 3654)
- `resolveOwnerDeleteRequestNotification` (l. 3698)
- `resolveViewerEditPendingNotification` (l. 3742)
- `resolveOwnerEditRequestNotification` (l. 3786)

**Hooks/mutations a mover:**

- `useDeleteObligationMutation` (l. 2486)
- `useArchiveObligationMutation` (l. 2516)
- `useCreateObligationMutation` (l. 2540)
- `useUpdateObligationMutation` (l. 2605)
- `useCreateObligationPaymentMutation` (l. 2665)
- `useLinkMovementToObligationMutation` (l. 2742)
- `useCreatePrincipalAdjustmentMutation` (l. 2806)
- `useUpdateObligationEventMutation` (l. 3244)
- `useDeleteObligationEventMutation` (l. 3891)
- `useCreateObligationEventDeleteRequestMutation` (l. 4072)
- `useRejectObligationEventDeleteRequestMutation` (l. 4225)
- `useCreateObligationEventEditRequestMutation` (l. 4343)
- `useAcceptObligationEventEditRequestMutation` (l. 4403)
- `useRejectObligationEventEditRequestMutation` (l. 4502)
- `useObligationEventsQuery` (l. 5475)

**Tipos públicos:** `ObligationFormInput`, `ObligationPaymentInput`, `PrincipalAdjustmentInput`, `UpdateObligationEventInput`, `DeleteObligationEventInput`, `CreateObligationEventDeleteRequestInput`, `RejectObligationEventDeleteRequestInput`, `CreateObligationEventEditRequestInput`, `AcceptObligationEventEditRequestInput`, `RejectObligationEventEditRequestInput`.

**Bloqueo crítico:** `mapObligation` se usa **dentro de `fetchWorkspaceSnapshot`** (línea ~1120). Después de moverlo a `obligations-impl.ts`, `workspace-data.ts` debe importarlo de vuelta: `import { mapObligation } from "./obligations-impl"`. Verificar que no se forma una dependencia circular (no debería: `obligations-impl` importa helpers de `workspace-data`, pero `mapObligation` no llama a esos helpers de vuelta).

**Validación crítica:** smoke completo del módulo entero (todas las acciones del flujo de obligaciones), porque cualquier cosa que cargue snapshot pasa por `mapObligation`.

---

## 4.2-g — Limpieza final

**Después de 4.2-f**, el shim `services/queries/obligations.ts` debe re-exportar
todo desde `./obligations-impl` (no desde `./workspace-data`). Sólo si `workspace-data`
todavía necesita algún símbolo (probable: `mapObligation`), lo importa desde `obligations-impl`.

**Estimación de tamaños finales:**

- `services/queries/workspace-data.ts`: ~6,350 → ~4,400 líneas.
- `services/queries/obligations-impl.ts`: nuevo, ~1,800 líneas.
- `services/queries/obligations.ts`: 86 → 86 líneas (shim sin cambios estructurales).

---

## Convenciones para todas las sub-fases

- **Una sub-fase = un commit potencial**. Si el typecheck falla, no avanzar.
- **No cambiar firmas** de hooks/funciones. Solo mover ubicación física.
- **No cambiar comportamiento runtime**. Si detectas un bug al leer el código, anótalo en este archivo y trátalo aparte.
- **Cache keys de React Query**: mantener idénticos (`["workspace-snapshot"]`, `["obligation-events", id]`, etc.).
- **Edge function names**: idénticos (`list-shared-obligations`, `create-obligation-share-invite`, `unlink-obligation-share`).
