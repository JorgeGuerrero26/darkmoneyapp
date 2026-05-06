# Architecture and UI Rules

## Arquitectura
- `app/*` orquesta estado, queries, callbacks y slots de la plantilla.
- `app/*` no debe contener cards, rows, forms grandes o modals grandes inline.
- `components/ui/*` contiene componentes genéricos sin dominio ni consultas.
- `components/domain/*` contiene wrappers finos de dominio sobre componentes genéricos.
- `features/*/components/*` contiene componentes propios de un módulo.
- `features/*/lib/*` contiene reglas puras, filtros, presenters, labels y builders de secciones.
- `services/queries/*` contiene Supabase, React Query, mappers e invalidaciones.
- Los componentes visuales reciben datos listos.
- Los componentes visuales no deben consultar Supabase.
- Los componentes visuales no deben calcular reglas financieras complejas.
- No inventes una nueva capa de arquitectura si ya existe un patrón equivalente.

## UI
- Usar tokens de `constants/theme.ts`:
  - `COLORS`
  - `GLASS`
  - `SPACING`
  - `RADIUS`
  - `FONT_FAMILY`
  - `FONT_SIZE`
- No introducir colores hex inline sin justificación.
- No introducir radios, sombras o fuentes inline sin justificación.
- Las cards de todos los módulos deben compartir ancho base.
- No agregar `marginHorizontal` dentro de rows/cards.
- El espaciado horizontal pertenece a `ResourceSectionList` o al template.
- No corregir diferencias de ancho con estilos locales en cada card.
- La sección principal puede usar `headerVariant: "hidden"` si no hay agrupación real.
- Secciones secundarias como archivadas deben usar variante visible o `divider`.
- Las labels largas de resumen deben usar copy compacto antes que romper la barra.
- Mantener consistencia visual entre cuentas, movimientos, contactos y obligaciones cuando se usen como referencia.

## Navegación
- Si el módulo se abre desde `Más`, la ruta debe usar `?from=more`.
- Para volver desde pantallas abiertas por origen, usar `useOriginBackNavigation`.
- No usar `router.back()` directo en módulos abiertos desde `Más`.
- Si el módulo se abre desde `Más`, debe existir como pantalla oculta dentro de `app/(app)`.
- Si el módulo se abre desde `Más`, debe registrarse en `app/(app)/_layout.tsx` con `href: null`, igual que `Presupuestos`.

## Reutilización
- Antes de crear un componente nuevo, buscar si existe uno equivalente en:
  - `components/ui`
  - `components/domain`
  - `features/<module>/components`
  - `lib/shared` si aplica en el repo
- Crear componentes genéricos en `components/ui` solo si son agnósticos de dominio y reutilizables en al menos dos módulos.
- Crear wrappers de dominio cuando solo se necesita mapear copy, labels o datos hacia un componente genérico.
- No duplicar componentes de lista, card, filtros, summary, swipe actions o FAB si ya existe componente compartido.

## Reglas de salida
Al terminar una tarea que toque arquitectura o UI, reportar:
- Archivos modificados.
- Componentes creados, reutilizados o eliminados.
- Si se mantuvo el orden de `ResourceModuleTemplate`.
- Si se respetó el ancho estándar de cards/listas.
- Riesgos visuales o validaciones manuales pendientes.