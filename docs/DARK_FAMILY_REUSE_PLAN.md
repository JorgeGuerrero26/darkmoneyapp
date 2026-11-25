# Familia Dark: mapa de reutilización y plan de migración

Fecha: 2026-11-25. Estado: **fase 0 completada; implementación pendiente**.

## 1. Alcance de esta entrega

Esta entrega documenta el código y los diseños locales, define fronteras de
reutilización y propone un piloto. No modifica componentes, dependencias,
identificadores, esquema, comportamiento de las apps ni publicaciones.

La referencia examinada es [DarkMoneyApp](../), los proyectos hermanos
[DarkCompanyUI](../../DarkCompanyUI/), [Darkfit](../../Darkfit/),
[DarkMoney](../../DarkMoney/) y [DarkMoneyShared](../../DarkMoneyShared/).
Los enlaces entre proyectos suponen estas carpetas hermanas dentro de Documentos;
en GitHub esos enlaces no sustituyen una referencia al repositorio correspondiente.

La aprobación de este plan o la clasificación como candidato no convierte un
componente en diseño aprobado de familia. La admisión a la biblioteca sigue
las reglas del [README de DarkCompanyUI](../../DarkCompanyUI/README.md).

## 2. Piezas existentes y responsabilidad propuesta

| Pieza actual | Evidencia | Responsabilidad y límite |
|---|---|---|
| Tokens, versión 0.2.0 | [Fuente](../../DarkCompanyUI/packages/tokens/src/index.ts), [manifest](../../DarkCompanyUI/packages/tokens/package.json) | Identidad común y adaptadores por plataforma. Mantener los significados financieros dentro del producto. |
| Core, versión 0.2.0 | [Exports](../../DarkCompanyUI/packages/core/src/index.ts) | Actualmente fechas y opciones de Select; lógica pura sin React. Todavía no es una infraestructura de sesión/offline. |
| UI web, versión 0.2.0 | [Exports](../../DarkCompanyUI/packages/ui-web/src/index.ts) | Select, DatePicker y soporte de menús. Implementación DOM/Tailwind; no importarla desde React Native. |
| Consumidor web existente | [Manifest](../../Darkfit/package.json), [reexports de UI](../../Darkfit/src/components/ui/index.ts), [galería](../../Darkfit/src/app/dev/ui-page.tsx) | DarkFit ya usa los paquetes; varios botones, sheets y otros controles todavía son locales. |
| UI móvil existente | [Componentes](../components/ui/), [tema](../constants/theme.ts) | Origen de candidatos para el futuro paquete nativo. Sigue funcionando localmente hasta migrar cada consumidor. |
| Dominio financiero compartido | [Manifest](../../DarkMoneyShared/package.json), [README](../../DarkMoneyShared/README.md) | Mantener cálculos de DarkMoney y su paridad web/móvil. Las apps financieras declaran la dependencia Git en sus manifests actuales; el README aún describe enlaces file locales. |
| Guía de nuevas apps | [Guía móvil](GUIA_NUEVAS_APPS.md), [copia en DarkFit](../../Darkfit/docs/GUIA-APP-DARK.md) | Ya existe el contrato de arquitectura. Reconciliar sus diferencias antes de elegir una referencia mantenida; no crear una tercera guía independiente. |
| Publicación de biblioteca | [Workflow](../../DarkCompanyUI/.github/workflows/publish.yml) | Ya prueba/publica tres paquetes por tag. El paquete nativo requerirá integración explícita y versionado. |

**Dirección de dependencias:** las aplicaciones consumen bibliotecas; las
bibliotecas no importan rutas, stores, consultas, perfiles ni tipos financieros
de las aplicaciones. UI web y nativa consumen tokens y core. Core no importa
React, DOM, React Native ni servicios de producto.

## 3. Diseño comprobado y límites de la evidencia

| Contrato | Fuente local | Evidencia y decisión |
|---|---|---|
| Select de familia | [Diseño web de DarkFit, §20](<../../Darkfit/docs/diseno/DarkFit - Diseño Web.dc.html>) | Define estados, selección simple/múltiple, búsqueda, grupos, deshabilitadas, errores y API. |
| Select móvil | [Diseño móvil de DarkFit, §15](<../../Darkfit/docs/diseno/DarkFit - Diseño Movil.dc.html>) | Reutiliza reglas/API de web §20. Hoja inferior, campo de 48 pt, filas de 52 pt o 64 con descripción, búsqueda fija desde 8 opciones y cierre con Listo en múltiple. |
| Formulario de cuentas | [AccountForm](../components/forms/AccountForm.tsx), [spec U](diseno/specs/U-nueva-cuenta.png), [entrega móvil](<diseno/DarkMoney - Diseño Movil.dc.html>) | Conserva fila agrupada, overlays y efectos de elegir tipo. La entrega gráfica de DarkMoney está presente localmente pero sin seguimiento Git al hacer este inventario. |
| DatePicker de familia | [README de biblioteca](../../DarkCompanyUI/README.md), [core](../../DarkCompanyUI/packages/core/src/date-picker.ts), [UI web](../../DarkCompanyUI/packages/ui-web/src/date-picker.tsx) | La biblioteca referencia diseño §22 y ya tiene código. No localicé esa sección en las dos entregas HTML de DarkFit revisadas; confirmar entrega vigente y cobertura móvil antes de migrarlo. |
| Otros componentes | [Patrones](APP_DESIGN_AND_CODE_PATTERNS.md) y diseños de producto | Una implementación genérica de DarkMoney es candidata técnica; su aprobación como componente de familia debe verificarse por separado. |

Se inspeccionaron textos y estructura de los documentos HTML, no se realizó QA
visual en navegador o teléfono. Antes de implementar, abrir las entregas con su
support.js, comprobar variantes y registrar la referencia vigente. Conservar una
copia versionada o una referencia estable de los diseños que respalden el piloto.

## 4. Adaptación de tokens: decisiones antes de programar

| Semántica | DarkMoney móvil actual | Biblioteca actual | Acción propuesta |
|---|---|---|---|
| Fondo | COLORS.bg, #141312 | colors.bg, mismo valor | Compartir por equivalencia comprobada. |
| Superficie base | COLORS.mist, #1C1B19 | surface-1, mismo valor | Compartir sin sustitución global de otras superficies. |
| Texto | ink, fog, storm, textDisabled | ink, ink-2, ink-3, ink-4 | Mapear valores equivalentes y conservar significado. |
| Acción principal | COLORS.action, hueso | colors.primary, hueso | Usar semántica de acción. COLORS.primary móvil actualmente es verde: no mapear por nombre. |
| Ingreso/éxito | pine/income/success, #86CE96 | leaf, #9BD46A | Valores y significados diferentes. El color financiero permanece en DarkMoney; verificar la semántica de éxito por componente. |
| Error real | dangerStrong, #EC7466 | error, mismo valor | Equivalencia comprobada. |
| Radios | md=8, lg=10, full=9999; números | btn=10px, card=14px, pill=22px; strings | Adaptador numérico por token semántico; no equiparar full con pill ni cambiar todos los radios. |
| Tipografía | Nombres de fuentes cargadas por Expo, por peso | Arrays de familias CSS | La app carga las fuentes; adaptador nativo define familia/peso real. Mono no está cargada en el tema móvil actual. |
| Escalas | SPACING y FONT_SIZE en móvil | Tamaños tipográficos también en preset Tailwind | Extraer solo valores respaldados por diseño; no asumir que ya existe una escala común exportada. |
| Dependencias | Expo/Metro y React 19 | Tokens declara peer Tailwind; UI web usa React 18 | Separar entrada neutral/nativa del preset; verificar peers e instalación sin introducir DOM/Tailwind en el runtime móvil. |

Conservar los exports web actuales y sus valores mientras se añade la entrada
nativa. No rediseñar DarkFit mediante un cambio indirecto de tokens. La estrategia
de empaquetado, exports y resolución Metro debe probarse en una exportación real:
los paquetes actuales publican TypeScript fuente; su consumo nativo no está
validado por esta entrega.

## 5. Piloto elegido: Tipo de cuenta

**Origen:** [selector actual](../components/ui/SearchableSelectSheet.tsx).
**Único consumidor inicial a modificar:** el campo Tipo del
[formulario de cuentas](../components/forms/AccountForm.tsx).
**Datos y reglas que permanecen en la app:**
[ACCOUNT_TYPES y presets](../features/accounts/lib/account-types.ts),
handleTypeChange, formulario, validación y mutaciones.

La lista tiene siete valores de texto. Es un caso sencillo de selección simple,
sin conversión de IDs ni búsqueda automática. Conserva el trigger de
[FormOptionRow](../components/ui/FormOptionRow.tsx), el host de
[FormSheetScaffold](../components/ui/FormSheetScaffold.tsx) y su overlay.
El selector de Institución del mismo formulario se deja para la expansión:
tiene valor nulo y más opciones.

### Diferencias que la integración debe resolver explícitamente

| Aspecto | Implementación móvil actual | Contrato de familia / decisión |
|---|---|---|
| Valores | SelectOption genérico, incluidos number y null | Core usa strings; el piloto usa strings. Adaptadores posteriores conservarán número/null sin conversiones ambiguas. |
| Búsqueda automática | Más de 10 opciones | Familia: más de 7. Aplicarlo en el nuevo componente; no alterar los demás consumidores mediante reemplazo global. |
| Texto buscado | label y meta, comparación en minúsculas | Core normaliza acentos y busca label. No perder silenciosamente la búsqueda por meta en migraciones posteriores. |
| Datos de opción | value, label, meta | Familia añade description, group y disabled. Conservar meta como adaptación explícita donde corresponda. |
| Selección múltiple | No existe en este selector | Familia la define con cierre Listo. Se verifica en el paquete antes de declararlo completo, aunque Tipo use selección simple. |
| Presentación | inline dentro del Modal padre o BottomSheet propio | El piloto conserva un solo Modal y el overlay del host. Repartir contenido de selección y presentación mediante composición, sin importar componentes de la app desde la biblioteca. |
| Campo de búsqueda | TextField local | TextField importa FormFeedback, que importa utilidades locales de errores. No copiar esa dependencia transitiva al paquete. |
| Efectos del tipo | Cambia presets y campos de tarjeta | Se conservan en handleTypeChange dentro de la app. El componente solo emite el valor. |

La migración debe ofrecer un componente controlado con opciones, valor,
onChange y estados listos. El contenedor mantiene apertura/cierre y presentación
cuando se integra en el formulario existente. Un adaptador local es aceptable
para traducir datos o componer el host; no mantendrá una segunda implementación
de búsqueda, selección ni estilos del componente migrado.

**Soporte compartible después:** [BottomSheet](../components/ui/BottomSheet.tsx)
tiene 59 importadores directos. Extraerlo por completo como requisito inicial
ampliaría demasiado el piloto. La composición evita modificar todos esos hosts.

### Aceptación del piloto

- Siete tipos, mismo orden y valor guardado; cierre al elegir y al cancelar.
- Reabrir muestra el tipo seleccionado; cancelar no altera valor ni borrador.
- Cambiar a tarjeta conserva los campos de ciclo y los presets existentes.
- Abrir con teclado visible, cerrar el selector y volver al formulario funciona
  en iOS y Android, dentro del mismo Modal.
- La biblioteca no importa auth, workspace, queries, stores ni tipos de DarkMoney.
- Las variantes de familia se prueban con 7, 8 y 11 opciones, acentos, grupos,
  deshabilitadas, vacío/acción, carga/error y múltiple/Listo; no se afirma cubrir
  variantes que todavía no estén implementadas.
- Accesibilidad nativa: nombre, selección, expansión, tamaño de toque, foco al
  abrir/cerrar y lectura con VoiceOver/TalkBack.
- La ruta de integración consume la versión empaquetada; no depende de alias
  apuntando a una carpeta personal fuera del repositorio.

## 6. Inventario completo de UI móvil

67 archivos TS/TSX, excluyendo tests. Importadores = cantidad de archivos con
import/reexport relativo estático directo en app, components, features, hooks,
lib, services, store y types. No incluye tests, imports dinámicos ni aliases;
no es número de pantallas ni medición de ejecución. Cero no demuestra desuso.

**Piloto:** candidato inicial con diseño localizado. **Soporte local:** mantener
en la app para el piloto. **Candidato posterior:** potencialmente genérico,
pendiente de diseño/API. **Fechas: después:** revisar contrato y zona horaria.
**Producto/adaptador:** conservar en producto hasta separar sus dependencias.

| Archivo actual | Importadores | Destino / prioridad | Condición principal |
|---|---:|---|---|
| [ActiveFilterBar.tsx](../components/ui/ActiveFilterBar.tsx) | 11 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [ActivityNotice.tsx](../components/ui/ActivityNotice.tsx) | 1 | Producto/adaptador | Estado global de ui-store. |
| [AiQuotaWarningBanner.tsx](../components/ui/AiQuotaWarningBanner.tsx) | 2 | Producto/adaptador | Consulta cuotas de detección; inyectar datos antes de compartir. |
| [AmountDisplay.tsx](../components/ui/AmountDisplay.tsx) | 111 | Producto/adaptador | Tipos y reglas de movimientos, moneda y preferencias locales. |
| [AnalyticsRow.tsx](../components/ui/AnalyticsRow.tsx) | 6 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [Badge.tsx](../components/ui/Badge.tsx) | 2 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [BiometricLock.tsx](../components/ui/BiometricLock.tsx) | 1 | Producto/adaptador | Sesión, preferencias, ciclo de vida y logging de la app. |
| [BottomSheet.tsx](../components/ui/BottomSheet.tsx) | 59 | Soporte local | 59 importadores; conservar overlay, teclado, footer y cierre de iOS. |
| [BulkActionBar.tsx](../components/ui/BulkActionBar.tsx) | 10 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [BusinessDateNotice.tsx](../components/ui/BusinessDateNotice.tsx) | 2 | Producto/adaptador | Calendario de feriados y reglas de negocio. |
| [Button.tsx](../components/ui/Button.tsx) | 46 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [Card.tsx](../components/ui/Card.tsx) | 27 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [ConfirmDialog.tsx](../components/ui/ConfirmDialog.tsx) | 33 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [CurrencyInput.tsx](../components/ui/CurrencyInput.tsx) | 14 | Producto/adaptador | Formato monetario; mantener en dominio financiero. |
| [CurrencySelector.tsx](../components/ui/CurrencySelector.tsx) | 2 | Producto/adaptador | Catálogo de monedas de la app. |
| [DatePickerInput.tsx](../components/ui/DatePickerInput.tsx) | 5 | Fechas: después | FormFeedback, todayPeru y formato de fechas del producto. |
| [DatePickerModal.tsx](../components/ui/DatePickerModal.tsx) | 2 | Fechas: después | Límites arbitrarios, calendario local y comportamiento opcional. |
| [DateTimeCalendar.tsx](../components/ui/DateTimeCalendar.tsx) | 2 | Fechas: después | Calendario y política de fecha/horario locales. |
| [DateTimeSheet.tsx](../components/ui/DateTimeSheet.tsx) | 2 | Fechas: después | Fecha y hora de movimientos; mantener paridad de guardado. |
| [DetailActionBar.tsx](../components/ui/DetailActionBar.tsx) | 14 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [DetailFieldRow.tsx](../components/ui/DetailFieldRow.tsx) | 17 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [DetailQuickActions.tsx](../components/ui/DetailQuickActions.tsx) | 1 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [DetailTabs.tsx](../components/ui/DetailTabs.tsx) | 4 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [EmptyRequirementCard.tsx](../components/ui/EmptyRequirementCard.tsx) | 0 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. Uso real pendiente de confirmar. |
| [EmptyState.tsx](../components/ui/EmptyState.tsx) | 2 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [EntityActionSheet.tsx](../components/ui/EntityActionSheet.tsx) | 21 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [ErrorBoundary.tsx](../components/ui/ErrorBoundary.tsx) | 30 | Producto/adaptador | Logging propio; separar renderer y callback de reporte. |
| [FAB.tsx](../components/ui/FAB.tsx) | 11 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [FilterToolbar.tsx](../components/ui/FilterToolbar.tsx) | 11 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [FormDateRow.tsx](../components/ui/FormDateRow.tsx) | 12 | Fechas: después | Calendario y todayPeru; no cambiar zona ni labels al extraer. |
| [FormFeedback.tsx](../components/ui/FormFeedback.tsx) | 53 | Producto/adaptador | Depende de errors/form-errors; separar contratos y presentación. |
| [FormOptionRow.tsx](../components/ui/FormOptionRow.tsx) | 20 | Soporte local | Conservar el trigger agrupado diseñado para el formulario. |
| [FormSheetScaffold.tsx](../components/ui/FormSheetScaffold.tsx) | 2 | Soporte local | Host actual del formulario; no migrar en el piloto. |
| [HeaderActionGroup.tsx](../components/ui/HeaderActionGroup.tsx) | 23 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [InlineFormSheet.tsx](../components/ui/InlineFormSheet.tsx) | 10 | Soporte local | Preservar teclado y presentación sobre el mismo Modal. |
| [Input.tsx](../components/ui/Input.tsx) | 14 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [MetricSummaryBar.tsx](../components/ui/MetricSummaryBar.tsx) | 13 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [MetricSummaryCard.tsx](../components/ui/MetricSummaryCard.tsx) | 0 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. Uso real pendiente de confirmar. |
| [NotificationReasonBanner.tsx](../components/ui/NotificationReasonBanner.tsx) | 4 | Producto/adaptador | Semántica y navegación contextual de notificaciones. |
| [OfflineNotice.tsx](../components/ui/OfflineNotice.tsx) | 5 | Producto/adaptador | Consulta conectividad; separar estado y vista. |
| [OptionCardGroup.tsx](../components/ui/OptionCardGroup.tsx) | 0 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. Uso real pendiente de confirmar. |
| [PendingSyncMeta.tsx](../components/ui/PendingSyncMeta.tsx) | 9 | Producto/adaptador | Texto y contrato de sincronización de recursos. |
| [PillSelector.tsx](../components/ui/PillSelector.tsx) | 11 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [PlanStatusBadge.tsx](../components/ui/PlanStatusBadge.tsx) | 1 | Producto/adaptador | Auth y query de entitlement del producto. |
| [ProFeatureSheet.tsx](../components/ui/ProFeatureSheet.tsx) | 2 | Producto/adaptador | Oferta/semántica Pro del producto. |
| [ProgressBar.tsx](../components/ui/ProgressBar.tsx) | 5 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [ResourceCard.tsx](../components/ui/ResourceCard.tsx) | 17 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [ResourceContextNote.tsx](../components/ui/ResourceContextNote.tsx) | 9 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [ResourceDetailSheet.tsx](../components/ui/ResourceDetailSheet.tsx) | 0 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. Uso real pendiente de confirmar. |
| [ResourceModuleTemplate.tsx](../components/ui/ResourceModuleTemplate.tsx) | 24 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [ResourceSectionList.tsx](../components/ui/ResourceSectionList.tsx) | 24 | Candidato posterior | Requiere useGestureRefresh, margen de tab y ámbito de swipe. |
| [RingChart.tsx](../components/ui/RingChart.tsx) | 3 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [SafeBlurView.tsx](../components/ui/SafeBlurView.tsx) | 16 | Soporte local | Mantener degradación por plataforma y presentación actual. |
| [SearchableSelectSheet.tsx](../components/ui/SearchableSelectSheet.tsx) | 20 | Piloto | Contrato Select web §20/móvil §15; adaptar tipos, búsqueda y host. |
| [SegmentedControl.tsx](../components/ui/SegmentedControl.tsx) | 6 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [Skeleton.tsx](../components/ui/Skeleton.tsx) | 23 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [SmartSuggestion.tsx](../components/ui/SmartSuggestion.tsx) | 6 | Producto/adaptador | Revisar contrato de sugerencias y haptics. |
| [SparkLine.tsx](../components/ui/SparkLine.tsx) | 2 | Candidato posterior | Confirmar diseño de familia, API y variantes antes de extraer. |
| [StaggeredItem.tsx](../components/ui/StaggeredItem.tsx) | 2 | Candidato posterior | Preservar integración de animación con ResourceSectionList. |
| [SuccessGlow.tsx](../components/ui/SuccessGlow.tsx) | 1 | Producto/adaptador | Se conecta directamente a ui-store. |
| [SwipeActionRow.tsx](../components/ui/SwipeActionRow.tsx) | 13 | Candidato posterior | Depende de swipe-row-target; riesgo nativo tras alternar pestañas. |
| [SwipeRowScope.tsx](../components/ui/SwipeRowScope.tsx) | 2 | Candidato posterior | Extraer junto al swipe/lista, nunca aisladamente. |
| [TextField.tsx](../components/ui/TextField.tsx) | 34 | Soporte local | Depende de FormFeedback y sus utilidades de aplicación. |
| [TimePickerInput.tsx](../components/ui/TimePickerInput.tsx) | 0 | Fechas: después | Revisar consumidores y diseño antes de compartir. Uso real pendiente de confirmar. |
| [Toast.tsx](../components/ui/Toast.tsx) | 0 | Producto/adaptador | Store/config de aplicación; cero importadores directos no prueba desuso. Uso real pendiente de confirmar. |
| [UndoBanner.tsx](../components/ui/UndoBanner.tsx) | 8 | Producto/adaptador | Depende de hooks/useToast y config. |
| [useDismissibleSheet.ts](../components/ui/useDismissibleSheet.ts) | 10 | Soporte local | Conservar animación, desmontaje y cierre; soporte del host. |

Adicionalmente, [ScreenHeader](../components/layout/ScreenHeader.tsx) está fuera
de components/ui y depende de plan y sincronización. Su renderer podría recibir
slots/props, dejando [PlanStatusBadge](../components/ui/PlanStatusBadge.tsx) y
[useSyncLine](../hooks/useSyncLine.ts) en la aplicación.

## 7. Infraestructura: reutilización concreta y límites

| Familia | Implementaciones examinadas | Decisión |
|---|---|---|
| Presupuestos de timeout | [Móvil](../lib/fetch-timeout-budget.ts), [DarkFit](../../Darkfit/src/lib/fetch-timeout-budget.ts) | Candidato real a lógica pura compartida. Las políticas ya difieren; conservar configuración, presupuestos por tipo de request y comportamiento al volver de background. |
| Idempotencia y promesas | [Móvil](../lib/idempotency.ts), [DarkFit](../../Darkfit/src/lib/idempotency.ts), [promesas móvil](../lib/promise-utils.ts) | Comparar contratos y casos de escritura ambigua. Extraer pequeñas funciones puras después del piloto, con pruebas de ambos consumidores. |
| Logging | [Móvil](../lib/error-logger.ts), [DarkFit](../../Darkfit/src/lib/error-logger.ts) | Separar cola/rate-limit del transporte y contexto de producto; no compartir tablas implícitamente. |
| Sesión y caché | [Auth móvil](../lib/auth-context.tsx), [auth web](../../Darkfit/src/lib/auth-context.tsx), [query-client móvil](../lib/query-client.ts) | Adaptadores por plataforma; almacenamiento, ciclo de vida y datos de perfil difieren. No crear un proveedor universal en esta fase. |
| Offline | [Motor móvil](../lib/offline/), [esquema](../lib/offline/schema.ts) | Mantener el esquema financiero. Cualquier extracción futura requiere separar motor, tablas, operaciones y conflictos. |
| Navegación | [Back por origen](../hooks/useOriginBackNavigation.ts), [tabs](<../app/(app)/_layout.tsx>) | Los nombres de rutas pertenecen a la app. Preservar detachInactiveScreens y los casos de regreso por origen. |
| Detección bancaria | [Plugin](../plugins/notification-detection/) | Exclusiva de DarkMoney, fuera de la plantilla genérica. |

La [decisión de cuentas de DarkFit](../../Darkfit/docs/PROMPT-DARKFIT-WEB.md)
mantiene proyectos y usuarios separados. Compartir paquetes no implica compartir
Auth, bases ni datos. Una identidad común futura es un alcance independiente.

## 8. Secuencia de implementación y archivos afectados

Cada etapa es una unidad lógica con commit propio, validación y criterio de
salida. Las rutas nuevas de esta tabla son propuestas, no archivos creados.

| Etapa | Trabajo y archivos | Criterio de salida / checkpoint |
|---|---|---|
| 0 — mapa | Este documento e índice de documentación. | Inventario, diseños, piloto, riesgos y validación de base registrados. |
| 1 — base reproducible | Instalación/workspaces de DarkCompanyUI; revisar su [lock](../../DarkCompanyUI/package-lock.json) y manifests. Confirmar entrega de diseño vigente. | Typecheck y las pruebas actuales pasan desde instalación reproducible. Si solo falta reinstalar enlaces, no hacer un refactor para ocultarlo. |
| 2 — tokens nativos | Nueva entrada nativa de tokens, manifest/exports y pruebas; conservar [preset web](../../DarkCompanyUI/packages/tokens/src/tailwind-preset.ts). | Sin DOM/Tailwind en entrada nativa, valores web estables, radios numéricos y fuentes registradas correctas en móvil. |
| 3 — Select nativo | Nuevo packages/ui-native en DarkCompanyUI; consumir core, declarar peers y configuración nativa separada del [tsconfig web actual](../../DarkCompanyUI/tsconfig.json). Incorporar paquete al [workflow](../../DarkCompanyUI/.github/workflows/publish.yml). | Contrato de familia y pruebas de las variantes; sin imports de aplicaciones. Empaquetado verificado en entorno limpio. |
| 4 — consumidor piloto | [package.json móvil](../package.json), lock, registro privado/configuración CI, [AccountForm](../components/forms/AccountForm.tsx) y adaptador mínimo si hace falta. | Solo Tipo usa el componente nuevo; demás selectores conservan comportamiento. Export iOS/Android y prueba en dispositivo antes de considerar desplegable. |
| 5 — expansión | [SearchableSelectSheet](../components/ui/SearchableSelectSheet.tsx) y sus consumidores, por grupos homogéneos. Después controles candidatos con diseño. | Compatibilidad número/null/meta, búsqueda y validación; se elimina la implementación local sustituida al completar cada grupo. |
| 6 — infraestructura | Helpers puros con dos consumidores reales; comparar copias antes de elegir exports/paquete. | Ambas apps validan sus contratos; no se introduce SDK/Supabase en el core puro por comodidad. |
| 7 — starters | Proyectos de inicio web y móvil apoyados en paquetes/versiones y guía reconciliada. | Crear una app ajena a finanzas desde configuración propia y verificar un flujo de recurso completo. |

La primera extracción no reestructura el árbol completo de DarkMoneyApp ni
mueve todos los proyectos a un monorepo. DarkCompanyUI ya es el workspace de
paquetes de familia; las aplicaciones conservan sus repositorios.

### Distribución y vuelta atrás

- Validar instalación del paquete candidato en CI y exportaciones de Expo.
  Preferir un artefacto empaquetado o prerelease controlada para comprobar consumo
  antes de fijar la versión estable. No confiar solo en symlinks locales.
- Incorporar acceso privado de solo lectura en instalaciones de móvil, CI y EAS;
  el workflow de publicación usa su permiso de escritura existente. No copiar
  valores de credenciales al código, documentación ni archivos versionados.
- Fijar versiones explícitas y conservar el lock. Verificar React 18 web /
  React 19 móvil y evitar una segunda copia de React.
- Cada cambio de consumidor debe poder revertirse con su commit y lock. El
  primer piloto conserva el selector anterior para los campos aún no migrados,
  sin duplicar el comportamiento del campo ya migrado.
- Cambios exclusivamente JS compatibles con los binarios podrían entregarse por
  OTA después de validarlos; dependencias o configuración nativa pueden exigir
  binarios nuevos. Esta fase no presupone compatibilidad OTA.
- Publicar un paquete, publicar una OTA y desplegar web son pasos distintos.
  Ninguno se ejecuta como parte de este documento.

## 9. Validaciones de esta entrega y de las etapas siguientes

Resultados de la inspección local:

| Comprobación | Resultado |
|---|---|
| DarkMoneyApp: npm run typecheck | Pasó. El script regenera los tipos de rutas ignorados por Git. |
| DarkCompanyUI: npm test | Pasaron 15 pruebas en dos archivos de core (Select y fechas). No son pruebas visuales ni de UI nativa. |
| DarkCompanyUI: npm run typecheck | Falló con TS2307 al resolver @jorgeguerrero26/darkcompany-core en ui-web, seguido de errores de tipos implícitos. El lock declara el workspace, pero la instalación local no lo resuelve. No se reparó ni reinstaló en esta entrega. |
| Diseños | Inspección textual de entregas y fuentes; sin comprobación visual ni prueba de teléfono. |
| Código/instalación de apps y biblioteca | Sin modificaciones como parte de esta fase. |
| Enlaces e inventario del documento | 129 enlaces locales comprobados; todos existen. 67 entradas de UI, sin duplicados. |
| git diff --check | Validado sobre los archivos staged antes del commit de documentación. |

Para la implementación: biblioteca (typecheck, core y componentes), consumidores
web (build/pruebas relevantes), móvil (typecheck, pruebas dirigidas y export de
iOS/Android), lint de los archivos cambiados y diff --check. Verificar el
comportamiento real en dispositivo por separado de los tests simulados.

Si una etapa toca pestañas, listas o gestos, mantener detachInactiveScreens
activo y aplicar la [prueba de swipe en iOS](swipe-audit-2026-09-26.md): filas
1, 2 y 4, varios ciclos Movimientos → Cuentas → Movimientos, con/sin scroll,
fila abierta, background y conservación de filtros. Si no se dispone del
dispositivo, registrar la validación como pendiente.

**Próxima unidad ejecutable:** etapa 1 (base reproducible y referencia de diseño).
El siguiente cambio funcional es Select nativo y un único campo de cuentas;
la generalización de sesión, offline y starters se valida en etapas posteriores.
