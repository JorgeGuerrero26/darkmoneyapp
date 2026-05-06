---
name: darkmoney-resource-module
description: Build, refactor, or migrate DarkMoney resource modules such as accounts, movements, contacts, obligations, budgets, or subscriptions so they use the shared ResourceModuleTemplate, generic UI components, consistent filters, summary bars, cards, swipe actions, sections, FABs, overlays, and project architecture rules.
---

# DarkMoney Resource Module

Use this skill when creating or migrating a module that lists, filters, summarizes, creates, edits, archives, deletes, or exports resource entities.

## Source Of Truth

Read `AGENTS.md` first, then `docs/APP_DESIGN_AND_CODE_PATTERNS.md` if more detail is needed. Treat `ResourceModuleTemplate` order as the contract.

Canonical slot order:

```tsx
<ResourceModuleTemplate
  topInset={insets.top}
  header={...}
  toolbar={...}
  activeFilters={...}
  context={...}
  summary={...}
  bulkActions={...}
  list={...}
  fab={...}
  overlays={...}
/>
```

## Workflow

1. Inventory the current screen: header actions, search, filters, active filter text, summary metrics, bulk selection, list groups, row/card content, FAB, forms, sheets, dialogs, undo banners, and exports.
2. Preserve behavior first. Do not redesign business logic while extracting components unless the user explicitly asks.
3. Move reusable UI into `components/ui` only when it is domain-agnostic and useful across at least two modules.
4. Put domain wrappers in `components/domain` or `features/<module>/components` when they only map domain copy/data into generic UI.
5. Keep pure filtering, section building, labels, and presenters in `features/<module>/lib`.
6. Assemble the route with `ResourceModuleTemplate` and the required slot order.
7. Validate spacing and width: rows/cards should not add local horizontal margins that make one module narrower than another.
8. Run `npm run typecheck` and `git diff --check`.

## Required Components

- Use `ScreenHeader` plus `HeaderActionGroup` for title-level actions.
- Use `FilterToolbar` for search, primary filters, archived toggles, advanced filter buttons, and export actions when they belong near filters.
- Use `ActiveFilterBar` for removable filter chips and clearing all filters.
- Use `ResourceContextNote` only for useful context, such as an applied date range.
- Use `MetricSummaryBar` for compact KPIs. Create a wrapper only for domain calculations or labels.
- Use `BulkActionBar` for multi-select actions.
- Use `ResourceSectionList` for all resource lists. Do not recreate `FlatList`, `SectionList`, or `ResourceList` in module screens.
- Use `ResourceCard` as the base for entity cards.
- Use `SwipeActionRow` for swipe actions and inject the generic card as content.
- Use `FAB` for the primary create action.
- Put forms, sheets, confirms, analytics modals, and undo banners in `overlays`.

## Filtering Pattern

Use typed filter values. Prefer multiselect when filters can combine.

```tsx
<FilterToolbar
  searchValue={search}
  onSearchChange={setSearch}
  searchPlaceholder="Buscar..."
  selectedValues={activeTypes}
  onSelectedValuesChange={setActiveTypes}
  allValue="all"
  options={typeOptions}
/>
<ActiveFilterBar
  filters={activeFilterChips}
  onRemove={removeFilter}
  onClear={clearFilters}
/>
```

Do not hide active filters inside explanatory text. Use `ResourceContextNote` separately for human-readable context.

## Section List Pattern

Build sections before rendering. Hide the main section header when there is no real grouping; show secondary groups such as archived items.

```ts
const sections = [
  {
    key: "active",
    title: "Activas",
    data: visibleItems,
    headerVariant: "hidden",
  },
  {
    key: "archived",
    title: "Archivadas",
    data: archivedItems,
    headerVariant: "divider",
  },
];
```

Use stable keys that include workspace or entity namespace when duplicate ids are possible.

## Currency Pattern

Use `CurrencySelector` for base currency settings. When a module compares balances or summaries across currencies, use the user's base currency plus `USD` as the default reference currency. Sync pairs with `useSyncExchangeRatePairMutation` when the module needs a rate, and consume persisted exchange-rate snapshots instead of hardcoded PEN/USD assumptions.

## Forbidden Patterns

- Do not create another generic list component for the same purpose as `ResourceSectionList`.
- Do not add raw card styles in a screen route.
- Do not add local `marginHorizontal` to cards/rows to fix spacing.
- Do not implement module-specific filter chip bars when `ActiveFilterBar` can represent them.
- Do not place Supabase calls inside visual components.
- Do not allow free-text currency base selection.

## Validation

Run:

```bash
npm run typecheck
git diff --check
```

If lint is relevant and configured in the environment, run `npm run lint`. If lint fails due to missing ESLint flat config, report that explicitly.
