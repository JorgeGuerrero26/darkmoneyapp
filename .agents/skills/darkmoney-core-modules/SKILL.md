---
name: darkmoney-core-modules
description: Reference for implementing, extending, or fixing features in the three core DarkMoney transactional modules: Movimientos (app/(app)/movements.tsx), Cuentas (app/(app)/accounts.tsx), and Créditos y Deudas (app/(app)/obligations.tsx). Covers filters, sections, summary bars, swipe actions, bulk selection, navigation, and module-specific patterns.
---

# DarkMoney Core Modules Reference

Use this skill when adding features, fixing bugs, or extending Movimientos, Cuentas, or Créditos y Deudas. These three modules are the canonical reference implementations for `ResourceModuleTemplate`.

## Module Files

| Módulo | Screen | Feature lib |
|---|---|---|
| Movimientos | `app/(app)/movements.tsx` | `features/movements/lib/` |
| Cuentas | `app/(app)/accounts.tsx` | `features/accounts/lib/` |
| Créditos y Deudas | `app/(app)/obligations.tsx` | `features/obligations/lib/` |

Detail screens: `app/movement/[id].tsx`, `app/account/[id].tsx`, `app/obligation/[id].tsx`

---

## Filters

### Movimientos
Multi-dimensional filters, each as separate `useState`:
- `activeTypeFilters: MovementType[]` — multiselect: all/ingresos/gastos/transferencias/obligaciones/suscripciones
- `activeStatusFilter: FilterStatus` — single: all/posted/pending/planned
- `activeDatePreset: string | null` + custom date range — built with `buildDatePresets()`
- `activeCategoryId: number | null` + `activeCategoryScope: "uncategorized" | null`
- `activeAccountId: number | null`
- `activeMovementIds: number[] | null` — quick filter injected from dashboard params

Advanced filters live in `MovementFilterSheet`. `FilterToolbar` shows type chips + search + badge count of active advanced filters.

### Cuentas
- `typeFilters: AccountTypeFilter[]` — multiselect: all/bank/cash/savings/credit_card/investment/loan/other
- `showArchived: boolean` — toggle via Archive icon in `FilterToolbar` actions
- `searchText: string`
- `displayCurrency: string` — persisted via `AsyncStorage` (`ACCOUNTS_CURRENCY_KEY`)

No filter sheet; everything in toolbar.

### Obligaciones
- `activeFilters: ObligationFilterValue[]` — multiselect from `OBLIGATION_FILTER_CHIPS` (features/obligations/lib/obligationFilters.ts): all/receivable/payable/active/defaulted/draft/paid
- `showArchived: boolean`
- `searchText: string`

Filter function: `filterObligations()`. Text search: `searchObligations<T>()` (title, counterparty, currency, status, direction, description, notes). Both in `features/obligations/lib/`.

---

## Section List

### Movimientos
Single fixed section, header hidden:
```ts
{ key: "movements", label: "Movimientos", data: filteredMovements, headerVariant: "hidden" }
```
Uses `usePaginatedMovements` — infinite scroll with `hasNextPage`/`fetchNextPage`.

### Cuentas
Up to 2 sections built in `useMemo`:
```ts
{ key: "active",   label: "Activas",          data: activeFiltered,   headerVariant: "hidden" }
{ key: "archived", label: `Archivadas (${n})`, data: archivedFiltered, headerVariant: "divider", headerIcon: Archive }
```
Archived section only rendered when `showArchived` is true.

### Obligaciones
Sections built by `buildObligationSections()` (features/obligations/lib/buildObligationSections.ts):
```ts
{ key: "workspace",          data: activeWorkspaceData }
{ key: "shared",             data: activeSharedData, hint: "..." }
{ key: "archived-divider",   data: [] }          // divider, no items
{ key: "workspace-archived", data: archivedWorkspaceData }
{ key: "shared-archived",    data: archivedSharedData }
```
`ObligationList` component applies `headerVariant: "divider"` + `headerIcon: Archive` to the divider. Hides workspace header when only one visible data section.

---

## Summary Bars

### Movimientos — `MovementSummaryBar`
`MetricSummaryBar` with 3 metrics: ingresos (TrendingUp, COLORS.income), gastos (TrendingDown, COLORS.expense), neto (COLORS.income or COLORS.expense, `strong: true`).
Label shows `"parcial ↓"` when `hasNextPage` (paginated view).
Type: `MovementFilterSummary = { incomeTotal, expenseTotal, incomeCount, expenseCount, net }` computed in `useMemo`.

### Cuentas — `AccountNetWorthSummary`
`MetricSummaryBar` with 1 metric: patrimonio neto.
Actions array = currency buttons (base currency + USD); disabled when no rate available.
Exchange rate conversion via rate map from `useSyncExchangeRatePairMutation`.

### Obligaciones — `ObligationSummaryBar`
`MetricSummaryBar` with 3 metrics: por cobrar (ArrowDownLeft, COLORS.pine), por pagar (ArrowUpRight, COLORS.rosewood), neto (Scale, conditional color/label based on direction).
Amounts converted to base currency via `pendingAmountInBaseCurrency()`.

---

## Swipe Actions

### Movimientos — `SwipeableMovementRow`
Right only: **Eliminar** (Trash2, COLORS.danger). Haptic: "warning". Width: 80px.
In `selectMode`: no swipe — shows checkbox row instead.

### Cuentas — `AccountCard`
Right only: **Archivar** / **Restaurar** toggle (Archive / ArchiveRestore, COLORS.pine).
In `selectMode`: no swipe — shows plain card.

### Obligaciones — `ObligationSwipeRow`
Left: **Pagar** / **Cobrar** (CreditCard, COLORS.pine, 90px). Label from `obligationSwipeActionLabel()`.
Right: **Eliminar** / **Archivar** (conditional icon + color, based on `deleteActionLabel`/`deleteActionIcon`/`deleteActionColor` props). Not shown for shared-with-me obligations.
Card also has inline Analytics button (BarChart2 → `ObligationAnalyticsModal`).

---

## Bulk Selection

### Movimientos
State: `selectMode: boolean`, `selectedIds: Set<number>`.
Activated via long-press on row. `BulkActionBar` actions:
1. Sel. todos → selects all in `allMovements`
2. CSV → exports as UTF-8 BOM CSV
3. Eliminar → shows `ConfirmDialog` → `executeBulkDelete()` → loops `startUndoDelete()` → undo toast

### Cuentas
State: `selectMode: boolean`, `selectedIds: Set<number>`.
`BulkActionBar` actions:
1. Sel. todas → selects all from `activeFiltered` (not archived)
2. CSV → export
3. Archivar → `ConfirmDialog` → `executeBulkArchive()`

### Obligaciones
No bulk selection. Per-item via swipe + `EntityActionSheet`.

---

## Navigation to Detail

### Movimientos
```ts
router.push(`/movement/${item.id}?from=movements`)
```
Sets `preserveScopedFiltersOnNextBlurRef.current = true` to preserve category/status filters on return.

### Cuentas
Active: `router.push(`/account/${account.id}?from=accounts`)`
Archived: opens `AccountForm` in edit mode inline (no navigation).

### Obligaciones
```ts
router.push(`/obligation/${ob.id}`)
```
No `from` param. Obligation detail infers workspace context from `workspaceId` + `viewerMode`.

---

## Undo Delete Pattern (Movimientos + Obligaciones)

Movimientos: `pendingDeleteIds: Set<number>` + per-id timer map. `startUndoDelete(id)` schedules real delete after 5s. Toast with undo callback calls `cancelUndoDelete(id)`.

Obligaciones: `pendingDeleteDeadlines: Record<number, number>` (timestamp map). Interval updates countdown display. Same 5s window.

Neither module deletes immediately on swipe — always goes through undo window first.

---

## Module-Specific Patterns

### Movimientos
- **Dashboard quick filters**: `quickMovementIds`, `quickLabel`, `quickType` injected via route params from dashboard navigation
- **Scoped filter preservation**: ref flag `preserveScopedFiltersOnNextBlurRef` prevents clearing category filter when returning from detail
- **Pagination**: `usePaginatedMovements` — load more on scroll, `hasNextPage` drives summary bar label
- **Attachment counts**: `useMovementAttachmentCountsQuery` fetched separately, shown as badge on rows

### Cuentas
- **Currency persistence**: `displayCurrency` stored in `AsyncStorage`, loaded async with `currencyLoaded` gate before rendering summary
- **Net worth flag**: `account.includeInNetWorth` filters which accounts contribute to patrimonio neto
- **Exchange rate auto-sync**: `useSyncExchangeRatePairMutation` called when `displayCurrency` changes to ensure rate pair exists
- **Archive is primary action**: no hard delete for accounts with movements; archive + restore cycle

### Obligaciones
- **Workspace + shared duality**: two separate queries (`useObligationsQuery` + `useSharedObligationsQuery`) merged by `buildObligationSections()`
- **Secondary loading**: `sharedLoading` state shown via `ResourceSectionList.loading.secondaryLoading` + `secondaryMessage`
- **Direction-aware labels**: all UI text (swipe labels, metrics, form titles) adapts to `direction: "receivable" | "payable"`
- **Payment request flow**: shared obligations can send payment requests separately (not just record payments)
- **Principal adjustment**: dedicated `PrincipalAdjustmentForm` for changing the obligation principal mid-term
- **Soft delete rule**: can't delete if obligation has events → must archive instead. Hook enforces this.

---

## FAB

All three: `<FAB onPress={() => setFormVisible(true)} bottom={insets.bottom + 16} />`

Forms:
- Movimientos → `MovementForm`
- Cuentas → `AccountForm` (with `editAccount: null`)
- Obligaciones → `ObligationForm`

---

## Validation

```bash
npm run typecheck
git diff --check
```

Check that:
- No new `FlatList`/`SectionList` bypasses `ResourceSectionList`
- Swipe actions use `SwipeActionRow`, not inline `Animated` reimplementations
- Section keys match the type union declared in lib
- Summary bar props computed in `useMemo`, not inline JSX
- `from` param passed on `router.push` to detail screens where defined
