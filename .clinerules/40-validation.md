# Validation Rules

## Validación principal

Antes de cerrar cualquier cambio TypeScript / React Native, ejecutar:

```bash
npm run typecheck
git diff --check
```

Ejecutar también:

```bash
npm run lint
```

solo si el entorno tiene configuración ESLint válida.

Si `npm run lint` falla por configuración ausente, por ESLint flat config faltante o por un problema del entorno, reportarlo explícitamente sin bloquear el cambio.

## Cuándo validar

Ejecutar validación cuando se modifiquen:

- Archivos `.ts` o `.tsx`.
- Componentes visuales.
- Hooks.
- Queries.
- Mappers.
- Filtros.
- Presenters.
- Builders de secciones.
- Formularios.
- Modales.
- Lógica de moneda.
- Lógica financiera.
- Navegación.
- Configuración del módulo.

Para cambios pequeños de documentación, reglas locales o prompts, no es obligatorio ejecutar `npm run typecheck`, pero sí revisar que el cambio sea coherente.

## Checklist antes de cerrar

Antes de dar una tarea por terminada, verificar:

- La pantalla respeta el orden de `ResourceModuleTemplate`.
- No hay listas nuevas fuera de `ResourceSectionList`.
- No se reintroduce `ResourceList`.
- No hay `FlatList` o `SectionList` directos en pantallas tipo recurso.
- No hay animaciones manuales de items en pantallas de módulo.
- No hay cards nuevas que dupliquen `ResourceCard`.
- No hay acciones swipe nuevas fuera de `SwipeActionRow`.
- No hay `marginHorizontal` local en rows/cards para corregir ancho.
- Los filtros aparecen en `FilterToolbar`.
- Los filtros activos aparecen en `ActiveFilterBar`.
- `ActiveFilterBar` permite remover filtros individuales y limpiar todos.
- `ResourceContextNote` no reemplaza filtros activos.
- El resumen usa `MetricSummaryBar` o un wrapper fino.
- Los componentes visuales no consultan Supabase.
- Los mappers centralizan conversión `snake_case` a `camelCase`.
- Las query keys incluyen workspace cuando los datos son workspace-scoped.
- La moneda base viene de settings y monedas soportadas.
- No hay tasas PEN/USD hardcodeadas.
- `npm run typecheck` pasa.
- `git diff --check` pasa.

## Validación de navegación

Si el módulo se abre desde `Más`, verificar:

- La ruta usa `?from=more`.
- El back usa `useOriginBackNavigation`.
- No se usa `router.back()` directo en módulos abiertos desde `Más`.
- La pantalla está registrada como oculta en `app/(app)/_layout.tsx` con `href: null`.

## Validación de cambios destructivos

Si se agregan acciones destructivas como archivar, eliminar, desactivar, limpiar o borrar:

- Usar `ConfirmDialog`, undo flow o mecanismo equivalente.
- Confirmar que el texto de confirmación sea claro.
- Confirmar que el usuario pueda cancelar.
- Confirmar que el estado se actualice correctamente después de la acción.

## Validación de filtros

Si se modifican filtros:

- Los filtros deben ser tipados.
- Los filtros combinables deben permitir multiselección.
- Cada filtro activo debe representarse como chip removible.
- Debe existir opción para limpiar todos.
- La búsqueda no debe romper los filtros activos.
- El refresh debe conservar filtros activos si el flujo ya lo hacía.

## Validación de moneda

Si se modifica moneda, resumen financiero o tipos de cambio:

- Usar `CurrencySelector`.
- No usar texto libre para moneda base.
- Usar moneda base del usuario.
- Usar `USD` como referencia por defecto cuando haya comparación.
- Sincronizar pares necesarios con `useSyncExchangeRatePairMutation` cuando aplique.
- Consumir tipos de cambio persistidos/sincronizados.
- No hardcodear tasas.
- Marcar cualquier cálculo financiero incierto como estimación si aplica.

## Si no se pudo validar

Si no puedes ejecutar una validación, reportar:

- Qué comando no se pudo ejecutar.
- Por qué falló.
- Si el fallo parece relacionado o no relacionado con el cambio.
- Qué comando debe ejecutar el usuario manualmente.
- Qué riesgo queda pendiente.

## Formato de cierre

Al terminar, responder siempre con:

- Archivos modificados.
- Qué cambió.
- Cómo probar.
- Comandos ejecutados y resultado.
- Riesgos, supuestos o puntos pendientes.