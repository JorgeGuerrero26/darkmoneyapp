# DarkMoney Claude Guide

## Project

DarkMoney es una app React Native / Expo de finanzas personales.

Trabaja como senior React Native/Expo engineer. Prioriza cambios pequeños, seguros y consistentes con el diseño existente.

## Token efficiency

- No escanees todo el repo salvo que sea necesario.
- Lee primero solo los archivos relevantes.
- No pegues archivos completos.
- No mezcles bugs distintos en una sola tarea.
- Si el usuario pide "solo plan", no edites archivos.
- Si ya hay un diagnóstico aprobado, no lo replantees salvo que una validación falle o aparezca evidencia nueva.
- Una tarea = un plan = un diff pequeño = una validación.

## Commands

Para cambios TypeScript / React Native, validar con:

- npm run typecheck
- git diff --check

Ejecutar npm run lint solo si el entorno tiene configuración ESLint válida.

Si lint falla por configuración ausente o por ESLint flat config faltante, reportarlo sin bloquear el cambio.

## Architecture

- app/* orquesta estado, queries, callbacks y slots.
- components/ui/* contiene componentes genéricosio ni consultas.
- components/domain/* y features/*/components/* contienen wrappers de dominio.
- features/*/lib/* contiene filtros, presenters, labels y builders de secciones.
- services/queries/* contiene Supabase, React Query, mappers e invalidaciones.
- Los componentes visuales reciben datos listos.
- Los componentes visuales no consultan Supabase.
- Los componentes visuales no calculan reglas financieras complejas.

## Resource modules

Las pantallas tipo recurso deben usar ResourceModuleTemplate con este orden:

1. header
2. toolbar
3. activeFilters
4. context
5. summary
6. bulkActions
7. list
8. fab
9. overlays

Usar componentes compartidos:

- HeaderActionGroup
- FilterToolbar
- ActiveFilterBar
- ResourceContextNote
- MetricSummaryBar
- BulkActionBar
- ResourceSectionList
- ResourceCard
- SwipeActionRow
- FAB
- CurrencySelector

## UI rules

- Usar tokens de constants/theme.ts:
  - COLORS
  - GLASS
  - SPACING
  - RADIUS
  - FONT_FAMILY
  - FONT_SIZE
- No introducir colores hex, radios, sombras o fuentes inline sin justificación.
- No agregar marginHorizontal dentro de rows/cards.
- Las cards deben mantener ancho consistente entre módulos.
- No crear listas, cards, filtros, FABs o summary bars duplicados si ya existe componente compartido.
- Mantener una estética dark fintech premium, limpia y consistente.

## Filters

- Usar filtros tipados.
- Si varios filtros se combinan, usar multiselección.
- Mostrar filtros activos en ActiveFilterBar.
- ActiveFilterBar debe permitir remover filtros individuales y limpiar todos.
- FilterToolbar emite cambios; no filtra internamente.
- ResourceContextNote no reemplaza filtros activos.

## Currency

- La moneda base se elige con CurrencySelector.
- La moneda base debe venir de settings y monedas soportadas.
- Usar USD como referencia por defecto para comparaciones.
- No hardcodear PEN/USD ni tasas manuales.
- Usar tipos de cambio persistio sincronizados.

## Navigation

- Si un módulo se abre desde Más, la ruta debe usar ?from=more.
- Usar useOriginBackNavigation.
- No usar router.back() directo en módulos abiertos desde Más.
- El back debe volver al origen real, no siempre al dashboard.
- Android back gesture / hardware back debe estar cubierto cuando aplique.
- iOS / React Navigation beforeRemove debe estar cubierto cuando aplique.

## Skills

Las skills locales viven en .claude/skills/ o .agents/skills/.

Usar skills cuando aplique:

- darkmoney-resource-module: crear o migrar módulos tipo recurso.
- darkmoney-module-audit: auditar módulos contra el estándar.
- darkmoney-origin-back-navigation: revisar o corregir navegación de retroceso por origen.

## Validation checklist

Antes de cerrar una tarea que cambió código, confirmar:

- npm run typecheck pasa.
- git diff --check pasa.
- npm run lint se ejecutó solo si el entorno tiene ESLint válido.
- No se modificaron archivos fuera del alcance.
- No se rompió ResourceModuleTemplate.
- No se introdujeron listas/cards/filtros duplicados.
- No se hardcodearon monedas, tasas, secretos ni URLs productivas.

## Final response

Al terminar una tarea, responder con:

- Archivos modificados.
- Qué cambió.
- Comandos ejecutados y resultado.
- Cómo probar manualmente.
- Riesgos, supuestos o pendientes.
