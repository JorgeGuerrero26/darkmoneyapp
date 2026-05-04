# Playbook de modularizacion: Creditos y Deudas

Este documento define como refactorizar el modulo sin cambiar comportamiento. Debe usarse como manual operativo para programadores.

## Estructura objetivo

```txt
features/
  obligations/
    components/
      ObligationSwipeRow.tsx
      ObligationCardContent.tsx
      ObligationFilterBar.tsx
      ObligationSectionHeader.tsx
      ObligationList.tsx
      ObligationSummaryHero.tsx
      ObligationEventHistory.tsx
      ObligationEventRow.tsx
      ObligationEventGroup.tsx
      ObligationRequestsPanel.tsx
      ObligationSharePanel.tsx
      form/
        ObligationFormSheet.tsx
        ObligationIdentityFields.tsx
        ObligationOriginSelector.tsx
        ObligationMoneyFields.tsx
        ObligationCounterpartyPicker.tsx
        ObligationAccountPickers.tsx
        ObligationScheduleFields.tsx
        ObligationShareFields.tsx
    hooks/
      useObligationsListController.ts
      useObligationDetailController.ts
      useObligationModalState.ts
      useObligationEventActions.ts
      useObligationHistoryFilters.ts
    lib/
      buildObligationSections.ts
      filterObligations.ts
      obligationPermissions.ts
      obligationPresenters.ts
      obligationEvents.ts
      obligationRequests.ts
    types.ts
services/
  queries/
    obligations/
      keys.ts
      mappings.ts
      obligations.ts
      obligation-events.ts
      obligation-shares.ts
      payment-requests.ts
      viewer-links.ts
lib/
  attachments/
    merge-preview-attachments.ts
  obligations/
    perspective.ts
    labels.ts
    events.ts
    money.ts
```

## Reglas de arquitectura

1. `app/*` no contiene componentes de dominio ni funciones puras extensas. Solo importa controller y componentes de `features`.
2. `components/ui/*` es generico y no conoce `ObligationSummary`.
3. `components/domain/*` puede mantenerse para componentes compartidos entre features, pero nuevos componentes especificos deben ir en `features/obligations/components`.
4. `services/queries/workspace-data.ts` puede seguir exportando compatibilidad temporal, pero la implementacion nueva debe moverse a `services/queries/obligations/*`.
5. Todo calculo que no use hooks debe vivir en `lib` o `features/obligations/lib`, no dentro de componentes.
6. Los controllers devuelven datos ya presentados y callbacks; los componentes renderizan.
7. No duplicar textos de direccion, estado, acciones o eventos. Usar presenters.

## Contratos de componentes

### `ObligationSwipeRow`

Uso: row swipeable para listas de obligaciones propias o compartidas.

Props minimas:

```ts
type ObligationSwipeRowProps = {
  obligation: ObligationSummary | SharedObligationSummary;
  share?: ObligationShareSummary | null;
  viewerMode: "owner" | "shared";
  pendingRequestCount?: number;
  actions: {
    open: () => void;
    primaryMoneyAction: () => void;
    secondaryAction?: () => void;
    analytics: () => void;
  };
  secondaryAction?: {
    label: string;
    tone: "danger" | "neutral";
    icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
    disabled?: boolean;
  };
};
```

Reglas:

1. No decide navegacion; recibe callbacks.
2. No consulta datos; todo llega por props.
3. Usa `obligationViewerActsAsCollector`, `obligationPerspectiveDirectionLabel` y `obligationSwipeActionLabel`.
4. No permite swipe destructivo en `viewerMode: "shared"`.

### `ObligationFilterBar`

Uso: chips horizontales y toggle de archivadas.

```ts
type ObligationFilterValue =
  | "all"
  | "receivable"
  | "payable"
  | "active"
  | "defaulted"
  | "draft"
  | "paid";

type ObligationFilterBarProps = {
  value: ObligationFilterValue;
  onChange: (value: ObligationFilterValue) => void;
  showArchived: boolean;
  onToggleArchived: () => void;
};
```

Reglas:

1. El componente no filtra data.
2. Debe usar haptic selection en cambio de filtro.
3. Debe usar tokens `GLASS`, `COLORS`, `RADIUS`, `SPACING`.

### `ObligationList`

Uso: `SectionList` comun para propias, compartidas y archivadas.

```ts
type ObligationListSectionKey =
  | "workspace"
  | "shared"
  | "archived-divider"
  | "workspace-archived"
  | "shared-archived";

type ObligationListProps = {
  sections: ObligationListSection[];
  loading: boolean;
  sharedLoading: boolean;
  refreshing: boolean;
  activeFilter: ObligationFilterValue;
  onRefresh: () => void;
  renderRow: ListRenderItem<ObligationListItem>;
  onCreateFirst: () => void;
};
```

Reglas:

1. Empty/loading/header/separator se estandarizan aqui.
2. La pantalla no debe repetir `EmptyState` ni skeletons para esta lista.

### `ObligationEventHistory`

Uso: historial agrupado por pagos/cobros y cambios de capital.

```ts
type ObligationEventHistoryProps = {
  obligation: ObligationSummary | SharedObligationSummary;
  events: ObligationEventSummary[];
  viewerMode: "owner" | "shared";
  linkedEventIds: Set<number>;
  viewerLinkByEventId: Map<number, ObligationEventViewerLink>;
  attachmentCounts: Record<number, number>;
  movementAttachmentCounts: Record<number, number>;
  filters: ObligationHistoryFilters;
  highlightedEventId?: number | null;
  onEventPress: (event: ObligationEventSummary) => void;
  onMovementPress: (movementId: number) => void;
  onAttachmentPress: (event: ObligationEventSummary) => void;
};
```

Reglas:

1. No muta eventos ni requests.
2. Calcula UI con presenters, no con strings hardcodeados.
3. Agrupacion por fecha vive en `features/obligations/lib/obligationEvents.ts`.

### `ObligationFormSheet`

Uso: shell del formulario. Las secciones internas reciben `state`, `errors` y `dispatch`.

Reglas:

1. Validacion en `useObligationFormController`.
2. Secciones visuales sin mutaciones directas a Supabase.
3. El submit construye `ObligationFormInput` en un mapper dedicado.
4. Compartir se extrae a `ObligationShareFields`.

## Hooks objetivo

### `useObligationsListController`

Responsabilidades:

1. Cargar snapshot, shares, shared obligations y pending request counts.
2. Manejar filtro, archivadas, refresh y focus invalidation.
3. Construir `sections`.
4. Orquestar delete con undo y archive.
5. Exponer estado de modales como `modalState`.

No debe:

1. Renderizar JSX.
2. Importar `StyleSheet`.
3. Formatear currency.

### `useObligationDetailController`

Responsabilidades:

1. Resolver obligacion owner/shared por id.
2. Cargar eventos remotos para shared viewer.
3. Cargar requests, notifications, viewer links y adjuntos.
4. Derivar permisos, capital overview, historial filtrado y estados de evento.
5. Exponer actions para aceptar/rechazar/link/edit/delete.

No debe:

1. Renderizar rows.
2. Crear estilos.
3. Duplicar presenters.

### `useObligationModalState`

Debe reemplazar multiples booleans con un discriminated union.

```ts
type ObligationModalState =
  | { type: "none" }
  | { type: "create" }
  | { type: "edit"; obligation: ObligationSummary | SharedObligationSummary }
  | { type: "payment"; obligation: ObligationSummary | SharedObligationSummary; event?: ObligationEventSummary }
  | { type: "adjustment"; obligation: ObligationSummary; mode: "increase" | "decrease"; event?: ObligationEventSummary }
  | { type: "paymentRequest"; obligation: SharedObligationSummary }
  | { type: "analytics"; obligation: ObligationSummary | SharedObligationSummary }
  | { type: "eventMenu"; event: ObligationEventSummary; obligation: ObligationSummary | SharedObligationSummary }
  | { type: "attachments"; event: ObligationEventSummary }
  | { type: "confirmDeleteEvent"; event: ObligationEventSummary };
```

## Funciones puras obligatorias

| Funcion | Entrada | Salida | Ubicacion |
|---|---|---|---|
| `filterObligations` | obligaciones + filtro | obligaciones filtradas | `features/obligations/lib/filterObligations.ts` |
| `buildObligationSections` | propias, compartidas, archivadas | secciones | `features/obligations/lib/buildObligationSections.ts` |
| `canDeleteObligation` | obligacion | boolean | `features/obligations/lib/obligationPermissions.ts` |
| `getObligationRowPresentation` | obligacion + viewer mode + share | colores, labels, flags | `features/obligations/lib/obligationPresenters.ts` |
| `groupEventsByDate` | eventos | grupos por fecha | `features/obligations/lib/obligationEvents.ts` |
| `splitPaymentAndCapitalEvents` | eventos | pagos + capital | `features/obligations/lib/obligationEvents.ts` |
| `mergePreviewAttachments` | adjuntos de evento + movimiento | union sin duplicados | `lib/attachments/merge-preview-attachments.ts` |

## Plan por fases

### Fase 0: seguridad

1. Ejecutar `npm run typecheck`.
2. Crear tests o snapshots minimos para funciones puras nuevas.
3. Documentar baseline visual con capturas antes del refactor.

### Fase 1: lista sin cambio visual

1. Mover `SwipeableObligationRow` a `features/obligations/components`.
2. Mover `FILTER_CHIPS` y barra de filtros.
3. Extraer `filterObligations` y `buildObligationSections`.
4. Extraer `useObligationsListController`.
5. Reemplazar `EventDeleteImpact` local por `ObligationEventDeleteImpact`.

Validacion:

1. Crear obligacion.
2. Filtrar por `Me deben`, `Debo`, estados.
3. Mostrar/ocultar archivadas.
4. Swipe pagar/cobrar.
5. Swipe eliminar con undo.
6. Swipe archivar si tiene eventos.
7. Abrir analiticas desde row.
8. Ver compartidas contigo.

### Fase 2: detalle

1. Extraer `ObligationSummaryHero`.
2. Extraer `ObligationEventRow`.
3. Extraer `ObligationEventGroup`.
4. Extraer `ObligationEventHistory`.
5. Extraer `ObligationRequestsPanel`.
6. Extraer `useObligationDetailController`.

Validacion:

1. Detalle owner y shared viewer.
2. Filtros de historial: mes, 3 meses, año, todo, custom.
3. Solicitud de pago desde viewer.
4. Aceptar/rechazar solicitud desde owner.
5. Link de evento a cuenta viewer.
6. Solicitud de editar/eliminar evento.
7. Focus desde notificacion con `eventId`.

### Fase 3: formularios

1. Extraer controller del formulario principal.
2. Dividir secciones visuales.
3. Extraer validacion y mapper de submit.
4. Reutilizar pickers/chips genericos.

Validacion:

1. Crear deuda manual sin impacto.
2. Crear credito por prestamo con salida de cuenta.
3. Crear deuda por prestamo con entrada de cuenta.
4. Editar metadata.
5. Compartir al crear.
6. Reasignar, reenviar y desvincular share.

### Fase 4: datos

1. Crear `services/queries/obligations/keys.ts`.
2. Mover mappers y fetchers.
3. Mover mutaciones por recurso.
4. Mantener exports en `workspace-data.ts` como re-export temporal.
5. Corregir mojibake en mensajes.
6. Eliminar codigo muerto despues de `return;` en delete request.

Validacion:

1. `npm run typecheck`.
2. `npm run lint`.
3. Regresion manual completa de owner/viewer.

## Checklist para cada PR

1. La PR no mezcla refactor visual con cambio funcional.
2. No se modifica contrato de Supabase sin migracion/documentacion.
3. No se cambia copy owner/viewer sin actualizar presenters.
4. No se agrega otro componente local reusable dentro de `app/*`.
5. La pantalla refactorizada queda mas corta que antes.
6. Las invalidaciones de React Query siguen cubriendo snapshot, movements, events, shares, requests, notifications y attachments segun corresponda.
7. Shared viewer y owner se prueban por separado.
8. Adjuntos se prueban en evento y movimiento vinculado.
9. Se ejecuta `npm run typecheck`.

## Ejemplo de pantalla objetivo

```tsx
export default function ObligationsScreenRoot() {
  return (
    <ErrorBoundary>
      <ObligationsRoute />
    </ErrorBoundary>
  );
}

function ObligationsRoute() {
  const controller = useObligationsListController();

  return (
    <GestureDetector gesture={controller.swipeGesture}>
      <View style={controller.screenStyle}>
        <ScreenHeader title="Creditos y Deudas" />
        <ObligationFilterBar {...controller.filterBarProps} />
        <ObligationList {...controller.listProps} />
        <ObligationModals state={controller.modalState} actions={controller.modalActions} />
        <FAB onPress={controller.actions.openCreate} bottom={controller.fabBottom} />
      </View>
    </GestureDetector>
  );
}
```

## Anti-patrones prohibidos

1. Definir otro `SwipeableObligationRow` dentro de una pantalla.
2. Calcular `Me deben` / `Yo debo` manualmente fuera de presenters.
3. Usar `status === "cancelled"` en UI sin nombrarlo como archivado en presenter.
4. Duplicar merge de adjuntos.
5. Llamar a Supabase directamente desde componentes visuales.
6. Agregar strings de notificaciones sin revisar encoding.
7. Crear booleans nuevos para modales cuando el flujo puede representarse con union state.
8. Hacer refactor y cambio de negocio en la misma PR.
