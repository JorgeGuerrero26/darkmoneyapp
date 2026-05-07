---
name: darkmoney-module-audit
description: Audit DarkMoney modules for consistency with the shared resource-module template, generic component reuse, professional code structure, filter behavior, summary bars, card/list width, currency handling, and validation requirements before refactors or quality reviews.
---

# DarkMoney Module Audit

Use this skill to review an existing module before or after refactor. The output should prioritize actionable deviations from the shared template.

## Inputs To Inspect

Start with the route file under `app/`, then follow imports into `components/domain`, `features/<module>/components`, `features/<module>/lib`, and `services/queries` as needed.

For the current standardized modules, compare against accounts, movements, contacts, and obligations only as implementation examples. The actual contract is in `AGENTS.md`.

## Audit Checklist

Check module structure:

- Uses `ResourceModuleTemplate`.
- Keeps slot order: `header`, `toolbar`, `activeFilters`, `context`, `summary`, `bulkActions`, `list`, `fab`, `overlays`.
- Keeps route code as orchestration, not large inline rows/cards/forms.
- Places domain wrappers in `components/domain` or `features/<module>/components`.
- Places pure filtering, section building, presenters, and labels in `features/<module>/lib`.

Check generic component reuse:

- Header actions use `HeaderActionGroup`.
- Search and filters use `FilterToolbar`.
- Active filters use `ActiveFilterBar`.
- Context text uses `ResourceContextNote`.
- KPIs use `MetricSummaryBar` or a thin domain wrapper.
- Bulk selection uses `BulkActionBar`.
- Lists use `ResourceSectionList`, not raw `FlatList`, raw `SectionList`, or removed `ResourceList`.
- Cards use `ResourceCard`.
- Swipe actions use `SwipeActionRow`.
- Primary create action uses `FAB`.
- Forms and sheets use shared scaffolds when applicable, such as `FormSheetScaffold` and `EntityActionSheet`.

Check behavior:

- Filters are typed.
- Combinable filters are multiselect.
- Active filters can be removed individually and cleared together.
- Empty, loading, refreshing, pagination, and error states are explicit.
- Destructive actions use `ConfirmDialog` or undo flows where appropriate.
- Export actions are exposed consistently through header/toolbar actions.

Check layout:

- Cards keep the same visible width across modules.
- Rows/cards do not add local horizontal margins.
- Main section headers are hidden when they add no information.
- Secondary sections such as archived items are visibly separated.
- Summary labels fit compactly without truncating important values.

Check data and money:

- Visual components do not query Supabase.
- Query keys include workspace when data is workspace-scoped.
- Mappers keep snake_case to camelCase conversion centralized.
- Currency base comes from settings and supported currencies.
- USD is the default comparison currency for exchange-rate summaries.
- Rates come from synced/persisted exchange-rate data, not hardcoded assumptions.

## Finding Format

Report findings first, ordered by severity. Include file references and the concrete component or pattern to replace.

Use this shape:

```md
**Findings**
- `High` [path:line]: Issue. Replace with `ComponentName` because ...
- `Medium` [path:line]: Issue. Move logic to `features/<module>/lib` because ...

**Residual Risk**
Short note about unvalidated runtime behavior or missing manual testing.

**Validation**
Commands run and result.
```

If there are no findings, say so explicitly and mention remaining validation gaps.

## Validation

Run:

```bash
npm run typecheck
git diff --check
```

Run `npm run lint` only when the environment has a valid ESLint configuration. If not, state the config blocker.
