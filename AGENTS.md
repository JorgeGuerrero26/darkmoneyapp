# DarkMoney Agent Guide

Guia obligatoria para agentes y programadores que modifiquen este repo. La prioridad es mantener los modulos de recurso con una plantilla comun, componentes genericos y reglas de negocio fuera del JSX.

## Comandos

- `npm run typecheck`: validacion principal antes de cerrar cualquier cambio TypeScript/React Native.
- `git diff --check`: validacion de whitespace antes de cerrar cambios.
- `npm run lint`: ejecutar si el repo tiene configuracion ESLint valida en ese entorno. Si falla por configuracion ausente, reportarlo sin bloquear el cambio.

## Skills Del Repo

- `.agents/skills/darkmoney-resource-module/SKILL.md`: usar al crear o migrar pantallas tipo recurso, como cuentas, movimientos, contactos, créditos, deudas, presupuestos y suscripciones.
- `.agents/skills/darkmoney-module-audit/SKILL.md`: usar al auditar si un módulo respeta la plantilla, reutiliza componentes genéricos y no reintroduce UI duplicada.
- `.agents/skills/darkmoney-origin-back-navigation/SKILL.md`: usar al crear, revisar o corregir navegación de retroceso en módulos; asegura que cada pantalla vuelva al origen real y no siempre al dashboard.

## Plantilla De Modulo

Toda pantalla tipo recurso debe componerse con `ResourceModuleTemplate` y respetar este orden visual:

1. `header`: `ScreenHeader` y acciones globales.
2. `toolbar`: busqueda, filtros primarios y acciones de filtro/exportacion.
3. `activeFilters`: chips de filtros activos y accion de limpiar.
4. `context`: nota contextual solo si aporta informacion real.
5. `summary`: KPIs compactos del resultado actual.
6. `bulkActions`: acciones sobre seleccion multiple.
7. `list`: `ResourceSectionList`.
8. `fab`: accion primaria de creacion.
9. `overlays`: forms, sheets, modals, confirms y banners.

No crear otro orden salvo una razon funcional explicita. Si un modulo no usa algun slot, dejarlo vacio antes que inventar un layout propio.

## Componentes Genericos Obligatorios

- `HeaderActionGroup`: acciones del header, por ejemplo exportar CSV o abrir filtros avanzados.
- `FilterToolbar`: busqueda, filtros principales, acciones iconicas y filtros multiseleccionables.
- `ActiveFilterBar`: filtros activos removibles y limpiar todo.
- `ResourceContextNote`: texto contextual debajo de filtros activos, por ejemplo rango de fechas aplicado.
- `MetricSummaryBar`: barra compacta de resumen. Crear wrappers de dominio solo para labels y calculos.
- `BulkActionBar`: acciones masivas cuando existe seleccion multiple.
- `ResourceSectionList`: lista estandar. No usar `ResourceList`; fue eliminado.
- `ResourceSectionList`: tambien controla la animacion estandar de entrada de items. No envolver rows con `StaggeredItem` desde las pantallas.
- `ResourceCard`: base visual unica para cards de entidades.
- `SwipeActionRow`: acciones swipe. Debe envolver cards sin cambiar ancho.
- `FAB`: accion primaria flotante.
- `CurrencySelector`: selector de moneda soportada. No usar texto libre para moneda base.
- `useOriginBackNavigation`: hook estandar para volver desde pantallas abiertas por origen (`?from=more`, `?from=dashboard`, etc.). No usar `router.back()` directo en modulos abiertos desde `Mas`.

## Reglas De Arquitectura

- `app/*` orquesta estado, queries, callbacks y slots de la plantilla; no debe contener cards, rows o modals grandes inline.
- `components/ui/*` contiene componentes genericos sin dominio ni consultas.
- `components/domain/*` y `features/*/components/*` contienen wrappers finos de dominio sobre componentes genericos.
- `features/*/lib/*` contiene reglas puras, filtros, presenters y builders de secciones.
- `services/queries/*` contiene Supabase, React Query, mappers e invalidaciones.
- Los componentes visuales reciben datos listos; no consultan Supabase ni calculan reglas financieras complejas.

## Reglas Visuales

- Usar tokens de `constants/theme.ts`: `COLORS`, `GLASS`, `SPACING`, `RADIUS`, `FONT_FAMILY`, `FONT_SIZE`.
- No introducir colores hex, radios, sombras o fuentes inline sin justificacion.
- Las cards de todos los modulos deben compartir ancho base. No agregar `marginHorizontal` dentro de rows/cards; el espaciado horizontal pertenece a `ResourceSectionList` o al template.
- La seccion principal puede usar `headerVariant: "hidden"` si no hay agrupacion real. Secciones secundarias como archivadas deben usar variante visible o `divider`.
- Las labels largas de resumen deben usar copy compacto antes que romper la barra.

## Reglas De Filtros

- Usar filtros tipados, no strings sueltos.
- Si varios filtros pueden combinarse, usar multiseleccion y mostrar cada filtro en `ActiveFilterBar`.
- `FilterToolbar` emite cambios; no filtra internamente.
- `ActiveFilterBar` debe permitir remover un filtro individual y limpiar todos.
- `ResourceContextNote` no reemplaza filtros activos; solo explica el contexto actual.

## Reglas De Moneda

- La moneda base se elige con `CurrencySelector` desde `constants/currencies.ts`.
- Si se muestra comparacion de monedas, usar moneda base del usuario y `USD` como moneda de referencia por defecto.
- Sincronizar pares necesarios con `useSyncExchangeRatePairMutation` cuando aplique.
- Usar los tipos de cambio persistidos/sincronizados del modulo de tipo de cambio; no hardcodear PEN/USD.

## Checklist Antes De Cerrar

- La pantalla respeta el orden de `ResourceModuleTemplate`.
- Si el modulo se abre desde `Mas`, la ruta usa `?from=more` y el back usa `useOriginBackNavigation`.
- Si el modulo se abre desde `Mas`, debe existir como pantalla oculta dentro de `app/(app)` y registrarse en `app/(app)/_layout.tsx` con `href: null`, igual que `Presupuestos`.
- No hay listas nuevas fuera de `ResourceSectionList`.
- No hay animaciones manuales de items en pantallas de modulo; la animacion vive en `ResourceSectionList`.
- No hay cards nuevas que dupliquen `ResourceCard`.
- No hay acciones swipe nuevas fuera de `SwipeActionRow`.
- Los filtros aparecen en `FilterToolbar` y sus chips en `ActiveFilterBar`.
- El resumen usa `MetricSummaryBar` o un wrapper fino sobre ese componente.
- `npm run typecheck` pasa.
- `git diff --check` pasa.
