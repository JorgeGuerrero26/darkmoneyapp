# DarkMoney Resource Module

Usar este workflow al crear, construir, refactorizar o migrar módulos tipo recurso como cuentas, movimientos, contactos, obligaciones, presupuestos o suscripciones.

## Objetivo

Construir o migrar pantallas tipo recurso para que usen:

- `ResourceModuleTemplate`.
- Componentes genéricos compartidos.
- Filtros consistentes.
- `ActiveFilterBar`.
- `MetricSummaryBar`.
- `ResourceSectionList`.
- `ResourceCard`.
- `SwipeActionRow`.
- `FAB`.
- Overlays centralizados.
- Arquitectura del proyecto definida en `.clinerules`.

## Cuándo usarlo

Usar cuando el usuario pida:

- Crear un módulo tipo recurso.
- Migrar una pantalla existente.
- Refactorizar cuentas, movimientos, contactos, obligaciones, presupuestos o suscripciones.
- Ordenar una pantalla que tiene mucho JSX inline.
- Reemplazar listas, cards, filtros o summaries duplicados.
- Alinear una pantalla con el estándar de DarkMoney.
- Mejorar filtros, summary bar, secciones, FAB, sheets, forms o overlays de un módulo.

## Reglas iniciales

- Primero lee las rules del proyecto relevantes.
- No modifiques archivos si el usuario pidió solo plan o auditoría.
- Para cambios medianos o riesgosos, primero propón plan y espera aprobación.
- Preserva comportamiento primero.
- No rediseñes lógica de negocio mientras extraes componentes salvo pedido explícito.
- No cambies contratos de API, queries, mappers, moneda o lógica financiera sin confirmación.
- No escanees todo el repo salvo que sea necesario.
- Mantén cambios pequeños y revisables.

## Paso 1: Leer reglas base

Leer o tener en cuenta:

- `.clinerules/10-resource-modules.md`
- `.clinerules/20-architecture-ui.md`
- `.clinerules/30-filters-currency.md`
- `.clinerules/40-validation.md`

Si existe `AGENTS.md` o `docs/APP_DESIGN_AND_CODE_PATTERNS.md`, leerlos solo si hace falta más detalle o si el usuario lo pide.

## Paso 2: Inventariar pantalla actual

Antes de editar, identificar:

- Archivo de ruta bajo `app/`.
- Header actual.
- Acciones globales.
- Search.
- Filtros primarios.
- Filtros avanzados.
- Filtros activos.
- Context note.
- Summary metrics.
- Selección múltiple.
- Grupos o secciones de lista.
- Row/card content.
- Swipe actions.
- FAB.
- Forms.
- Sheets.
- Modals.
- Confirms.
- Undo banners.
- Export actions.
- Queries y mappers usados.
- Helpers/lib existentes.

Si la pantalla ya funciona, preservar el comportamiento observable.

## Paso 3: Definir plan de migración

Para una migración o refactor mediano, proponer plan antes de editar:

```md
**Plan**
1. Extraer filtros/presenters/section builders a `features/<module>/lib`.
2. Crear o ajustar wrappers de dominio en `features/<module>/components` o `components/domain`.
3. Reemplazar layout por `ResourceModuleTemplate`.
4. Reemplazar lista por `ResourceSectionList`.
5. Reemplazar cards por `ResourceCard` dentro de `SwipeActionRow`.
6. Reubicar forms, sheets, confirms y banners en `overlays`.
7. Ejecutar validación.
```

Esperar confirmación si afecta arquitectura, queries, moneda, datos, navegación, API o comportamiento financiero.

## Paso 4: Aplicar `ResourceModuleTemplate`

La ruta debe ensamblar el módulo con este orden obligatorio:

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

Slot order obligatorio:

1. `header`
2. `toolbar`
3. `activeFilters`
4. `context`
5. `summary`
6. `bulkActions`
7. `list`
8. `fab`
9. `overlays`

Si un slot no aplica, dejarlo vacío o `undefined`; no inventar layout propio.

## Paso 5: Reusar componentes requeridos

Usar los componentes compartidos cuando apliquen:

- `ScreenHeader`.
- `HeaderActionGroup`.
- `FilterToolbar`.
- `ActiveFilterBar`.
- `ResourceContextNote`.
- `MetricSummaryBar`.
- `BulkActionBar`.
- `ResourceSectionList`.
- `ResourceCard`.
- `SwipeActionRow`.
- `FAB`.
- `FormSheetScaffold`.
- `EntityActionSheet`.
- `ConfirmDialog`.
- `CurrencySelector`.

No crear duplicados de:

- Listas genéricas.
- Cards base.
- Barras de filtros.
- Barras de filtros activos.
- Summary bars.
- Swipe rows.
- FABs.

## Paso 6: Ubicar código correctamente

Usar estas ubicaciones:

- `app/*`: orquesta estado, queries, callbacks y slots de la plantilla.
- `components/ui/*`: componentes genéricos sin dominio ni queries.
- `components/domain/*`: wrappers finos de dominio.
- `features/<module>/components/*`: UI específica del módulo.
- `features/<module>/lib/*`: filtros, presenters, labels, builders de secciones y lógica pura.
- `services/queries/*`: Supabase, React Query, mappers e invalidaciones.

Reglas:

- No colocar cards, rows o forms grandes inline en la ruta.
- No colocar queries Supabase en componentes visuales.
- No calcular reglas financieras complejas en JSX.
- Mover lógica repetible fuera del route file.
- Crear componente genérico en `components/ui` solo si es dominio-agnóstico y reutilizable en al menos dos módulos.
- Crear wrapper de dominio si solo se necesita mapear labels, copy o datos hacia componente genérico.

## Paso 7: Implementar filtros correctamente

Usar filtros tipados.

Si los filtros pueden combinarse, usar multiselección.

Patrón base:

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

Reglas:

- `FilterToolbar` emite cambios; no filtra internamente.
- `ActiveFilterBar` muestra chips removibles.
- `onRemove` elimina solo el filtro correspondiente.
- `onClear` limpia todos los filtros relevantes.
- `ResourceContextNote` no reemplaza filtros activos.
- No esconder filtros activos dentro de texto explicativo.
- Búsqueda y filtros deben combinarse correctamente.
- Refresh debe conservar filtros activos cuando el flujo existente lo hacía.

## Paso 8: Construir secciones antes de renderizar

Usar `ResourceSectionList`.

No usar:

- `FlatList` directo.
- `SectionList` directo.
- `ResourceList`.

Patrón base:

```ts
const sections = [
  {
    key: 'active',
    title: 'Activas',
    data: visibleItems,
    headerVariant: 'hidden',
  },
  {
    key: 'archived',
    title: 'Archivadas',
    data: archivedItems,
    headerVariant: 'divider',
  },
];
```

Reglas:

- Ocultar header principal con `headerVariant: 'hidden'` si no aporta agrupación real.
- Separar grupos secundarios con variante visible o `divider`.
- Usar keys estables.
- Incluir workspace o namespace cuando puedan existir IDs duplicados.
- No envolver rows con animaciones manuales si `ResourceSectionList` ya controla la animación estándar.

## Paso 9: Cards, ancho y swipe actions

Reglas:

- Usar `ResourceCard` como base visual.
- Usar `SwipeActionRow` para acciones swipe.
- No agregar `marginHorizontal` local a rows/cards.
- El ancho y espaciado horizontal pertenecen a `ResourceSectionList` o al template.
- Las cards deben mantener el mismo ancho visible entre módulos.
- No arreglar diferencias de ancho con estilos locales por pantalla.
- Acciones destructivas deben usar `ConfirmDialog`, undo flow o equivalente.

## Paso 10: Summary y KPIs

Reglas:

- Usar `MetricSummaryBar` para KPIs compactos.
- Crear wrapper fino solo para cálculos o labels de dominio.
- Usar labels compactos para evitar truncado.
- Summary debe representar el resultado actual cuando los filtros cambian.
- No duplicar summary bars específicas si `MetricSummaryBar` cubre el caso.
- No calcular lógica financiera compleja dentro del JSX del summary.

## Paso 11: Moneda y tipos de cambio

Cuando el módulo toque moneda, balances, exchange rates o summaries multi-moneda:

- Usar `CurrencySelector` para moneda base.
- La moneda base debe venir de settings y monedas soportadas.
- No permitir texto libre para moneda base.
- Usar `USD` como referencia por defecto cuando haya comparación.
- Sincronizar pares necesarios con `useSyncExchangeRatePairMutation` cuando aplique.
- Consumir tipos de cambio persistidos/sincronizados.
- No hardcodear PEN/USD ni tasas manuales.
- Mover helpers de moneda a `features/<module>/lib` o helpers existentes cuando sean reutilizables.

## Paso 12: Queries, mappers y workspace

Reglas:

- Componentes visuales no consultan Supabase.
- Queries, mappers e invalidaciones viven en `services/queries/*`.
- Query keys incluyen workspace cuando datos son workspace-scoped.
- No mezclar datos entre workspaces.
- Mappers centralizan conversión `snake_case` a `camelCase`.
- No inventar campos de datos.
- No cambiar contratos de query sin confirmación.

## Paso 13: Navegación desde Más

Si el módulo se abre desde `Más`:

- La ruta debe usar `?from=more`.
- El back debe usar `useOriginBackNavigation`.
- No usar `router.back()` directo.
- La pantalla debe existir como pantalla oculta dentro de `app/(app)`.
- Debe registrarse en `app/(app)/_layout.tsx` con `href: null`, igual que `Presupuestos`.

## Paso 14: Overlays

Colocar en el slot `overlays`:

- Forms.
- Sheets.
- Modals.
- Confirms.
- Analytics modals.
- Undo banners.
- Export dialogs.

Reglas:

- No dejar forms grandes inline en la ruta.
- Usar scaffolds compartidos como `FormSheetScaffold` o `EntityActionSheet` cuando apliquen.
- Acciones destructivas deben confirmar o permitir undo.
- Mantener overlays fuera del flujo visual principal.

## Paso 15: Validación

Después de cambios TypeScript / React Native, ejecutar:

```bash
npm run typecheck
git diff --check
```

Ejecutar:

```bash
npm run lint
```

solo si el entorno tiene configuración ESLint válida.

Si `npm run lint` falla por configuración ausente o ESLint flat config faltante, reportarlo explícitamente sin bloquear.

## Checklist antes de cerrar

Verificar:

- `ResourceModuleTemplate` usado.
- Slot order respetado.
- Ruta limpia, sin rows/cards/forms grandes inline.
- Componentes genéricos reutilizados.
- No se reintrodujo `ResourceList`.
- No hay `FlatList` / `SectionList` directo en pantallas tipo recurso.
- `ResourceSectionList` usado.
- `ResourceCard` usado.
- `SwipeActionRow` usado cuando hay swipe.
- `FAB` usado para creación.
- `FilterToolbar` usado.
- `ActiveFilterBar` usado.
- `MetricSummaryBar` o wrapper fino usado.
- Cards sin `marginHorizontal` local.
- Filtros tipados.
- Filtros activos removibles.
- Clear all disponible.
- Query keys con workspace si aplica.
- Sin Supabase queries en componentes visuales.
- Sin tasas hardcodeadas.
- Navegación desde `Más` correcta si aplica.
- `npm run typecheck` pasa.
- `git diff --check` pasa.

## Formato de cierre

Responder con:

- Archivos modificados.
- Qué cambió.
- Componentes genéricos usados.
- Cambios en filtros, summary, moneda o queries.
- Cómo probar manualmente.
- Comandos ejecutados y resultado.
- Riesgos, supuestos o pendientes.