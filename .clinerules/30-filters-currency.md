# Filters and Currency Rules

## Filtros

- Usar filtros tipados, no strings sueltos.
- Si varios filtros pueden combinarse, usar multiselección.
- Mostrar cada filtro activo en `ActiveFilterBar`.
- `FilterToolbar` emite cambios; no filtra internamente.
- `ActiveFilterBar` debe permitir remover filtros individuales y limpiar todos.
- `ResourceContextNote` no reemplaza filtros activos; solo explica contexto humano útil.
- No esconder filtros activos dentro de texto explicativo.
- La búsqueda debe combinarse correctamente con filtros activos.
- El refresh debe conservar filtros activos cuando el flujo ya lo hacía.
- Los filtros deben vivir fuera del JSX grande cuando la lógica crece; mover lógica pura a `features/<module>/lib`.

## Patrón recomendado de filtros

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

## Active filters

- Cada chip debe representar un filtro real removible.
- Evitar chips genéricos que no se puedan limpiar individualmente.
- `onRemove` debe actualizar solo el filtro correspondiente.
- `onClear` debe limpiar búsqueda/filtros según corresponda al módulo.
- No duplicar filtros activos en `ResourceContextNote`.

## Listas por secciones

- Construir secciones antes de renderizar.
- Usar `ResourceSectionList` para listas tipo recurso.
- No usar `FlatList`, `SectionList` o `ResourceList` directo en pantallas de módulo.
- Ocultar el header principal si no aporta agrupación real.
- Separar visualmente secciones secundarias como archivadas.
- Usar keys estables que incluyan workspace o namespace de entidad cuando puedan existir IDs duplicados.

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

## Moneda

- La moneda base se elige con `CurrencySelector` desde `constants/currencies.ts`.
- No usar texto libre para moneda base.
- No hardcodear monedas si ya existe lista de monedas soportadas.
- Si se muestran comparaciones de moneda, usar moneda base del usuario y `USD` como referencia por defecto.
- Sincronizar pares necesarios con `useSyncExchangeRatePairMutation` cuando aplique.
- Usar tipos de cambio persistidos/sincronizados.
- No hardcodear PEN/USD ni asumir tasas manuales.
- No calcular conversiones complejas directamente dentro de componentes visuales.
- Mover helpers de moneda, labels y presenters a `features/<module>/lib` o helpers existentes cuando la lógica sea reusable.

## Query keys y datos workspace-scoped

- Las query keys deben incluir workspace cuando los datos sean workspace-scoped.
- No mezclar datos de distintos workspaces.
- Los componentes visuales no deben consultar Supabase directamente.
- Las queries, mappers e invalidaciones deben vivir en `services/queries/*`.
- Mantener conversión `snake_case` a `camelCase` centralizada en mappers.

## Validación específica

Si se modifican filtros o moneda, validar:

- Los filtros activos se pueden remover individualmente.
- Existe acción de limpiar todos si hay más de un filtro posible.
- La búsqueda y los filtros se combinan correctamente.
- Los estados empty/loading/error siguen funcionando.
- Las secciones mantienen ancho y espaciado estándar.
- La moneda base viene de settings o selector soportado.
- La comparación por defecto usa `USD` cuando corresponde.
- No hay tasas hardcodeadas.
- No hay Supabase queries dentro de componentes visuales.

## Formato de cierre

Al terminar una tarea que toque filtros, secciones, queries o moneda, reportar:

- Archivos modificados.
- Filtros afectados.
- Cambios en moneda o tipos de cambio, si aplica.
- Query keys afectadas, si aplica.
- Cómo probar búsqueda, filtros activos y limpiar filtros.
- Comandos ejecutados y resultado.
- Riesgos o validaciones pendientes.