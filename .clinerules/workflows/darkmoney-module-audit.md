# DarkMoney Module Audit

Usar este workflow para auditar un módulo DarkMoney antes o después de un refactor.

## Objetivo

Revisar consistencia con:

- `ResourceModuleTemplate`.
- Componentes genéricos.
- Estructura profesional.
- Filtros.
- Summary bars.
- Ancho de cards/listas.
- Manejo de moneda.
- Validaciones.
- Separación entre UI, lógica de dominio y queries.

## Cuándo usarlo

Usar cuando el usuario pida:

- Auditar un módulo.
- Revisar calidad de un módulo.
- Comparar un módulo contra el estándar.
- Revisar si una pantalla respeta `ResourceModuleTemplate`.
- Revisar antes o después de un refactor.
- Revisar si se están duplicando componentes.
- Revisar filtros, summary, cards, moneda o queries.

## Reglas iniciales

- No modifiques archivos al iniciar.
- Primero audita y reporta findings.
- Solo implementa cambios si el usuario lo aprueba explícitamente.
- Prioriza desviaciones accionables frente a preferencias menores.
- Ordena findings por severidad.
- No escanees todo el repo salvo que sea necesario.
- Usa accounts, movements, contacts y obligations solo como ejemplos de implementación.
- La fuente de verdad son las rules del proyecto.

## Paso 1: Inspeccionar entradas

Empieza con el archivo de ruta bajo `app/`.

Luego sigue imports hacia:

- `components/domain`
- `features/<module>/components`
- `features/<module>/lib`
- `services/queries`
- componentes UI compartidos usados por el módulo

Identifica:

- Ruta principal del módulo.
- Componentes de dominio usados.
- Helpers/lib usados.
- Queries y mappers usados.
- Componentes genéricos usados.
- Formularios, sheets, modals, confirms y banners.

## Paso 2: Revisar estructura del módulo

Verifica:

- Usa `ResourceModuleTemplate`.
- Respeta el orden:
  1. `header`
  2. `toolbar`
  3. `activeFilters`
  4. `context`
  5. `summary`
  6. `bulkActions`
  7. `list`
  8. `fab`
  9. `overlays`
- La ruta orquesta estado, queries, callbacks y slots.
- La ruta no contiene rows/cards/forms grandes inline.
- Wrappers de dominio están en `components/domain` o `features/<module>/components`.
- Filtros puros, section builders, presenters y labels están en `features/<module>/lib`.
- Queries, Supabase, React Query, mappers e invalidaciones están en `services/queries/*`.

## Paso 3: Revisar componentes genéricos

Verifica uso correcto de:

- `ScreenHeader`
- `HeaderActionGroup`
- `FilterToolbar`
- `ActiveFilterBar`
- `ResourceContextNote`
- `MetricSummaryBar`
- `BulkActionBar`
- `ResourceSectionList`
- `ResourceCard`
- `SwipeActionRow`
- `FAB`
- `FormSheetScaffold`
- `EntityActionSheet`
- `ConfirmDialog`
- `CurrencySelector` cuando aplique

Detectar y reportar:

- Uso de `ResourceList`.
- Uso directo de `FlatList` o `SectionList` en pantallas tipo recurso.
- Cards duplicadas en vez de `ResourceCard`.
- Filtros propios en vez de `FilterToolbar` / `ActiveFilterBar`.
- Acciones swipe fuera de `SwipeActionRow`.
- Formularios o modales grandes inline.
- Nuevos componentes genéricos duplicados.

## Paso 4: Revisar comportamiento

Verifica que el módulo tenga estados explícitos para:

- Loading.
- Empty.
- Error.
- Refreshing.
- Pagination, si aplica.
- Selección múltiple, si aplica.
- Undo flow o confirmación para acciones destructivas, si aplica.

Verifica filtros:

- Filtros tipados.
- Filtros combinables como multiselect.
- Filtros activos removibles individualmente.
- Acción para limpiar todos los filtros.
- Búsqueda combinada correctamente con filtros.
- Refresh conserva filtros activos cuando el flujo ya lo hacía.
- `ResourceContextNote` no reemplaza filtros activos.

Verifica acciones:

- Export consistente desde header o toolbar.
- Acciones destructivas con `ConfirmDialog`, undo flow o equivalente.
- FAB para acción primaria de creación.

## Paso 5: Revisar layout

Verifica:

- Cards con mismo ancho visible entre módulos.
- Rows/cards sin `marginHorizontal` local.
- Espaciado horizontal delegado a `ResourceSectionList` o template.
- Header principal oculto con `headerVariant: 'hidden'` cuando no aporta.
- Secciones secundarias separadas con variante visible o `divider`.
- Summary labels compactas sin truncar valores importantes.
- No hay animaciones manuales de items en pantallas de módulo si `ResourceSectionList` ya controla animación estándar.

## Paso 6: Revisar datos, queries y moneda

Verifica:

- Componentes visuales no consultan Supabase.
- Query keys incluyen workspace cuando los datos son workspace-scoped.
- No se mezclan datos de distintos workspaces.
- Mappers centralizan conversión `snake_case` a `camelCase`.
- Mappers y queries viven en `services/queries/*`.
- Currency base viene de settings y monedas soportadas.
- La moneda base usa `CurrencySelector` cuando el usuario puede elegirla.
- USD es moneda de comparación por defecto cuando hay resumen de exchange-rate.
- Rates vienen de datos persistidos/sincronizados.
- No hay tasas hardcodeadas ni supuestos PEN/USD.

## Paso 7: Revisar navegación

Si el módulo se abre desde `Más`, verificar:

- La ruta usa `?from=more`.
- Usa `useOriginBackNavigation`.
- No usa `router.back()` directo.
- Existe como pantalla oculta dentro de `app/(app)`.
- Está registrado en `app/(app)/_layout.tsx` con `href: null`.

## Severidad de findings

Usa esta guía:

### High

Problemas que pueden romper arquitectura, comportamiento, datos o consistencia crítica.

Ejemplos:

- No usa `ResourceModuleTemplate`.
- Consulta Supabase desde componentes visuales.
- Hardcodea tasas de cambio.
- Mezcla datos entre workspaces.
- Cambia contrato o comportamiento sin justificación.
- Acciones destructivas sin confirmación.
- Ruta grande con lógica compleja inline.

### Medium

Problemas de mantenibilidad, consistencia o reutilización.

Ejemplos:

- Usa `FlatList` / `SectionList` directo.
- Duplica cards o filtros.
- No usa `MetricSummaryBar`.
- Filtros no son removibles individualmente.
- Lógica de filtros está dentro de JSX grande.
- Cards tienen margen local y ancho diferente.

### Low

Problemas menores de polish, copy, orden o consistencia visual.

Ejemplos:

- Label larga en summary.
- Context note poco útil.
- Header visible sin aportar agrupación.
- Naming mejorable.
- Falta una validación manual menor.

## Formato de salida

Responder usando este formato:

```md
**Findings**
- `High` [path:line]: Issue. Replace with `ComponentName` because ...
- `Medium` [path:line]: Issue. Move logic to `features/<module>/lib` because ...
- `Low` [path:line]: Issue. Adjust copy/spacing because ...

**Residual Risk**
Short note about unvalidated runtime behavior, missing manual testing, or assumptions.

**Validation**
- Commands run and result.
- If commands were not run, explain why.

**Recommended Next Step**
- Smallest safe next action.
```

Si no hay findings, responder explícitamente:

```md
**Findings**
No actionable findings found.

**Residual Risk**
Runtime behavior still needs manual testing for ...

**Validation**
...
```

## Validación

Para auditoría sin cambios, ejecutar validación solo si aporta valor y no es costosa.

Si hubo cambios o el usuario pide validación, ejecutar:

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

## Restricciones

- No modificar archivos sin aprobación.
- No crear reglas nuevas sin aprobación.
- No crear componentes nuevos durante la auditoría.
- No refactorizar durante la auditoría.
- No copiar secretos o valores sensibles en findings.
- No reportar preferencias subjetivas como findings si no hay impacto claro.