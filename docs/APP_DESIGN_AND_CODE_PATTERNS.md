# Patron de diseno y codigo de la app

Este documento define reglas comunes para que Creditos y Deudas, y futuros modulos, compartan componentes, estilos y estructura profesional.

## Principios

1. Una pantalla compone; no implementa dominio.
2. Un componente visual recibe datos listos; no consulta Supabase.
3. Una regla de negocio vive en `lib` o `features/*/lib`; no en JSX.
4. Un hook controller coordina queries, mutations, estado y callbacks.
5. Un presenter convierte dominio a UI: labels, colores, badges, flags y estados vacios.
6. Los tokens visuales salen de `constants/theme.ts`; no se inventan colores, radios o fuentes inline.

## Capas

| Capa | Puede importar | No debe importar |
|---|---|---|
| `app/*` | `features`, `components/ui`, `components/layout`, hooks de contexto | Supabase directo, funciones largas de dominio |
| `features/*/components` | `components/ui`, `constants/theme`, tipos, presenters | Supabase directo, query clients |
| `features/*/hooks` | queries, mutations, contexts, presenters, lib | `StyleSheet` salvo casos muy puntuales |
| `features/*/lib` | tipos y funciones puras | React, React Native, Supabase |
| `services/queries/*` | Supabase client, React Query, mappers | componentes visuales |
| `lib/*` | funciones puras reutilizables | componentes visuales |

## Convencion de nombres

1. Componentes visuales: `PascalCase.tsx`.
2. Hooks: `useFeatureThing.ts`.
3. Funciones puras: `camelCase.ts`.
4. Presenters: `featurePresenters.ts`.
5. Query keys: `keys.ts`.
6. Mappers Supabase: `mappings.ts`.
7. Tipos especificos de feature: `features/<feature>/types.ts`.

## Patron de pantalla

Una pantalla debe seguir esta forma:

```tsx
function FeatureRoute() {
  const controller = useFeatureController();

  return (
    <View style={styles.screen}>
      <ScreenHeader title={controller.title} />
      <FeatureHeader {...controller.headerProps} />
      <FeatureList {...controller.listProps} />
      <FeatureModals state={controller.modalState} actions={controller.modalActions} />
    </View>
  );
}
```

Reglas:

1. Maximo recomendado: 250 lineas por pantalla.
2. No declarar rows, cards, sheets o modals dentro del archivo de ruta.
3. Los callbacks de navegacion se inyectan desde la pantalla o controller.
4. Los estilos de componentes extraidos viven junto al componente.

Toda pantalla de modulo tipo recurso debe usar `ResourceModuleTemplate` y respetar este orden:

1. `header`: titulo y acciones globales.
2. `toolbar`: busqueda, filtros principales y toggles globales.
3. `activeFilters`: chips o indicadores de filtros secundarios activos.
4. `context`: notas o hints del rango/estado actual.
5. `summary`: metricas principales del resultado actual.
6. `bulkActions`: acciones sobre seleccion multiple.
7. `list`: `ResourceSectionList`.
8. `fab`: accion primaria de creacion.
9. `overlays`: forms, sheets, modals, confirms y banners.

| Componente | Ubicacion | Uso |
|---|---|---|
| `ResourceModuleTemplate` | `components/ui/ResourceModuleTemplate.tsx` | Plantilla generica de orden visual para modulos tipo recurso |

## Patron de navegacion de origen

Las pantallas abiertas desde `Mas` deben recibir `?from=more` y resolver el regreso con `useOriginBackNavigation`. Esto evita que cada modulo dependa del historial real del stack y mantiene la misma animacion/comportamiento de entrada y salida.

Reglas:

1. En `app/(app)/more.tsx`, usar rutas tipo `/contacts?from=more`.
2. En la pantalla destino, usar `const { handleBack } = useOriginBackNavigation()`.
3. Pasar `onBack={handleBack}` a `ScreenHeader`.
4. No usar `router.back()` directo en pantallas abiertas desde `Mas`.
5. Crear un wrapper en `app/(app)/<modulo>.tsx` si la pantalla real vive en el stack raiz, y registrar esa pantalla oculta en `app/(app)/_layout.tsx` con `href: null`.
6. Si el modulo tambien puede abrirse desde Dashboard o Notificaciones, pasar `originRoutes` al hook.

## Patron de lista

Toda lista profesional debe tener:

1. `FilterBar` reutilizable si hay filtros.
2. `SectionHeader` solo si hay agrupacion real; la seccion principal puede usar `headerVariant: "hidden"` para mantener la plantilla sin ruido visual.
3. `Row/Card` puro y memoizable si crece.
4. `EmptyState` con accion primaria cuando aplique.
5. Skeleton consistente para carga inicial.
6. Pull-to-refresh si usa datos remotos.
7. `keyExtractor` estable que incluya workspace si puede haber ids repetidos.

Componentes base disponibles:

| Componente | Ubicacion | Uso |
|---|---|---|
| `HeaderActionGroup` | `components/ui/HeaderActionGroup.tsx` | Grupo generico de acciones del header con icono, label opcional y estado activo |
| `FilterToolbar` | `components/ui/FilterToolbar.tsx` | Barra generica de filtros, busqueda opcional y acciones iconicas como archivadas/exportar |
| `ActiveFilterBar` | `components/ui/ActiveFilterBar.tsx` | Barra generica para chips de filtros activos y accion de limpiar |
| `ResourceContextNote` | `components/ui/ResourceContextNote.tsx` | Texto contextual debajo de filtros activos, por ejemplo rango de fechas aplicado |
| `ResourceSectionList` | `components/ui/ResourceSectionList.tsx` | Lista generica estandar para modulos con loading, empty state, refresh, footer paginado, headers visibles u ocultos |
| `SwipeActionRow` | `components/ui/SwipeActionRow.tsx` | Contenedor swipeable generico con accion izquierda/derecha; el modulo inyecta el contenido y las acciones |
| `BulkActionBar` | `components/ui/BulkActionBar.tsx` | Barra generica para operaciones masivas sobre items seleccionados |
| `MetricSummaryBar` | `components/ui/MetricSummaryBar.tsx` | Barra compacta de KPIs para resumenes de listas, filtros activos y acciones cortas tipo selector |

Los modulos deben crear wrappers finos con copy de dominio cuando sea necesario. Ejemplo: `ObligationFilterBar` configura `FilterToolbar` con filtros de creditos/deudas, pero no redefine estilos.

La animacion de entrada de items de listas vive en `ResourceSectionList` mediante el patron estandar de stagger. Las pantallas de modulo no deben envolver rows/cards con `StaggeredItem`; si un modulo necesita desactivar esa animacion por rendimiento o por una vista especial, debe usar una prop explicita del componente generico.

Contrato recomendado:

```ts
type FeatureListProps<T, S> = {
  sections: S[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  renderItem: SectionListRenderItem<T, S>;
  empty: {
    icon: React.ComponentType<any>;
    title: string;
    description: string;
    action?: { label: string; onPress: () => void };
  };
};
```

## Patron de cards

1. Usar `Card` de `components/ui/Card.tsx` como base.
2. Header: titulo a la izquierda, KPI/importe a la derecha.
3. Sublinea: contraparte, fecha, cuenta o descripcion.
4. Badges: maximo 3 visibles antes de wrap.
5. Progress: solo si comunica avance real.
6. Acciones secundarias: icon button pequeño, no texto largo.
7. No mezclar `TouchableOpacity` y `Pressable` arbitrariamente; usar el patron del componente base salvo necesidad de gesture.

Componente base disponible:

| Componente | Ubicacion | Uso |
|---|---|---|
| `ResourceCard` | `components/ui/ResourceCard.tsx` | Card estandar para entidades/list items con leading, title, subtitle, meta, trailing, acciones y estado seleccionado/archivado |
| `MetricSummaryCard` | `components/ui/MetricSummaryCard.tsx` | Card de metrica principal con label, valor destacado y selector opcional |

## Patron de filtros

1. Chips horizontales para 3 o mas filtros.
2. Toggle iconico separado para switches globales como archivadas.
3. Los filtros son valores tipados, no strings sueltos.
4. El componente no filtra; emite `onChange`.
5. El filtro activo debe cambiar border, fondo y texto.

Componentes base disponibles:

| Componente | Ubicacion | Uso |
|---|---|---|
| `PillSelector` | `components/ui/PillSelector.tsx` | Selector horizontal de opciones cortas con estado controlado |
| `OptionCardGroup` | `components/ui/OptionCardGroup.tsx` | Grupo de cards seleccionables para opciones con titulo, descripcion e icono opcional |
| `CurrencySelector` | `components/ui/CurrencySelector.tsx` | Selector controlado de moneda soportada; no permite texto libre |

## Patron de formularios

Estructura:

1. `useFeatureFormController`: estado, errores, dirty state, submit.
2. `FeatureFormSheet`: layout y botones.
3. `FeatureXFields`: secciones visuales.
4. `validateFeatureForm`: funcion pura.
5. `toFeatureInput`: mapper hacia mutation.

Reglas:

1. Evitar 20+ `useState` en un formulario; usar reducer o controller.
2. Validacion en una funcion pura testeable.
3. Navegacion a modulos requeridos, como Contactos, se maneja con callback explicito.
4. Los errores de API pasan por `humanizeError`.
5. El formulario no debe conocer detalles de invalidacion de queries.

Componentes base disponibles:

| Componente | Ubicacion | Uso |
|---|---|---|
| `FormSheetScaffold` | `components/ui/FormSheetScaffold.tsx` | Estructura generica de bottom sheet para formularios con header, scroll y acciones |
| `EmptyRequirementCard` | `components/ui/EmptyRequirementCard.tsx` | Card para requisitos faltantes antes de crear una entidad, por ejemplo contactos o cuentas |

## Patron de modales y sheets

1. Usar `BottomSheet` para forms y acciones contextuales.
2. Usar `ConfirmDialog` para decisiones destructivas.
3. Usar union state para modales relacionados.
4. El cierre siempre debe limpiar target y loading local.
5. No abrir dos sheets del mismo flujo al mismo tiempo.

Componentes base disponibles:

| Componente | Ubicacion | Uso |
|---|---|---|
| `EntityActionSheet` | `components/ui/EntityActionSheet.tsx` | Sheet generico para resumen, notices, quick actions y acciones principales de una entidad |

Ejemplo:

```ts
type ModalState =
  | { type: "none" }
  | { type: "edit"; id: number }
  | { type: "delete"; id: number };
```

## Patron de presenters

Un presenter recibe dominio y devuelve UI.

```ts
type ObligationRowPresentation = {
  amountColor: string;
  directionLabel: string;
  statusLabel: string;
  statusColor: string;
  progressLabel: string;
  primaryActionLabel: string;
};
```

Reglas:

1. Presenters no importan React.
2. Presenters si pueden importar `COLORS` si devuelven tokens visuales.
3. Componentes no deben decidir labels financieros si existe presenter.

## Tokens visuales

Usar siempre:

1. Color: `COLORS` y `GLASS`.
2. Espaciado: `SPACING`.
3. Radio: `RADIUS`.
4. Tipografia: `FONT_FAMILY`, `FONT_SIZE`.

Evitar:

1. Hex colors inline salvo casos documentados.
2. Margenes magicos repetidos.
3. Fuentes distintas a las cargadas en `theme.ts`.
4. Nuevos estilos de card que no respeten glass/border/shadow base.

## Estados estandar

| Estado | Componente |
|---|---|
| Carga inicial | Skeleton especifico |
| Fetch incremental | `ActivityIndicator` compacto con copy corto |
| Vacio recuperable | `EmptyState` con accion |
| Error bloqueante | `ErrorBoundary` o banner de error |
| Confirmacion destructiva | `ConfirmDialog` |
| Undo | `UndoBanner` |

## Reglas de datos

1. Cada modulo debe tener query keys centralizadas.
2. Cada mutacion debe listar invalidaciones en `onSuccess`.
3. Los mappers convierten snake_case a camelCase en un solo lugar.
4. Los componentes nunca deben recibir rows crudas de Supabase.
5. Edge functions se invocan desde services, no desde componentes.
6. Si una query depende de workspace, `workspaceId` debe estar en key.

## Reglas de copy

1. Copy financiero debe ser consistente por perspectiva: owner vs shared viewer.
2. Evitar "obligacion" visible al usuario si la pantalla habla de "Credito" o "Deuda"; usar "credito o deuda" cuando sea generico.
3. Estados tecnicos como `cancelled` se presentan como "Archivada" si ese es el significado de producto.
4. Mensajes de error y notificacion deben estar en UTF-8 correcto.

## Checklist para componentes nuevos

1. Tiene props tipadas y pequenas.
2. No consulta datos si es visual.
3. No contiene strings duplicados de dominio.
4. Usa tokens de tema.
5. Expone callbacks, no navega por cuenta propia salvo componentes de ruta.
6. Es reutilizable en al menos dos lugares o reduce una pantalla critica.
7. No introduce estado si puede ser controlado por props.
8. Tiene un estado vacio/carga si renderiza colecciones.

## Checklist para refactors

1. Primero extraer sin cambiar comportamiento.
2. Despues corregir bugs en PR separada.
3. Mantener exports temporales si hay muchos imports existentes.
4. Ejecutar `npm run typecheck`.
5. Ejecutar `npm run lint` si el cambio toca imports, hooks o componentes.
6. Probar manualmente owner y shared viewer si toca Creditos y Deudas.
