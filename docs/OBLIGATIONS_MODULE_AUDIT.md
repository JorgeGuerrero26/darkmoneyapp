# Auditoria del modulo Creditos y Deudas

Fecha: 2026-05-04

## Alcance

Este documento audita el modulo de obligaciones, llamado en UI "Creditos y Deudas". Incluye listado, detalle, formularios, analiticas, eventos, adjuntos, solicitudes, invitaciones compartidas, sincronizacion con movimientos y notificaciones.

## Inventario actual

| Area | Archivo | Responsabilidad actual | Riesgo |
|---|---|---|---|
| Lista | `app/(app)/obligations.tsx` | Lista, filtros, secciones, swipe row, undo delete, archivado, analiticas, adjuntos y formularios | Archivo monolitico de 1416 lineas |
| Detalle | `app/obligation/[id].tsx` | Estado completo de detalle, historial, filtros de historial, solicitudes, links a cuentas, modales, notificaciones y forms | Archivo critico de 5155 lineas |
| Form principal | `components/forms/ObligationForm.tsx` | Crear/editar obligacion, origen, impacto inicial, compartir, validacion y navegacion a contactos | Formulario largo de 1450 lineas |
| Analiticas | `components/domain/ObligationAnalyticsModal.tsx` | KPIs, series, historial, requests, delete/edit de eventos | Modal de 3229 lineas con logica de negocio |
| Eventos | `components/forms/PaymentForm.tsx`, `components/forms/PrincipalAdjustmentForm.tsx`, `components/forms/PaymentRequestForm.tsx`, `components/forms/ObligationEventEditRequestForm.tsx` | Crear/editar pagos, ajustes, solicitudes y propuestas de edicion | Buen inicio de modularizacion, pero contratos no estan documentados |
| Componentes domain | `components/domain/ObligationEventActionSheet.tsx`, `ObligationEventDeleteImpact.tsx`, `ObligationCapitalChangesModal.tsx`, `ObligationInviteFlow.tsx` | Acciones de evento, impacto, cambios de capital, flujo de invitacion | Reutilizables, pero hay duplicacion en pantallas |
| Labels/perspectiva | `lib/obligation-viewer-labels.ts`, `lib/obligation-labels.ts` | Texto, color y direccion segun titular/viewer | Es una buena base; debe ser unica fuente |
| Datos | `services/queries/workspace-data.ts` | Snapshot, mappers, queries y mutaciones de obligaciones, eventos, shares, requests, notificaciones y movimientos | Archivo demasiado amplio de 7496 lineas |
| Tipos | `types/domain.ts` | Modelos compartidos de dominio | Bien ubicado, pero faltan tipos de vista derivados |
| Edge functions | `supabase/functions/*obligation*` | Aceptar/declinar/listar/desvincular/crear invitaciones | Separacion correcta del backend compartido |
| Integraciones | `app/_layout.tsx`, `app/notifications.tsx`, `app/movement/[id].tsx`, `app/(app)/dashboard.tsx` | Deep links, push reminders, notificaciones, asociar movimientos, dashboard | El modulo impacta pantallas externas |

## Flujos funcionales identificados

1. Crear obligacion propia: `ObligationForm` crea fila en `obligations` y opcionalmente movimiento inicial si hubo flujo de caja.
2. Editar obligacion propia: `ObligationForm` actualiza metadata editable, comparte/reasigna invitacion si corresponde.
3. Listar obligaciones: la pantalla combina `snapshot.obligations`, `obligation_shares`, `sharedObligations` y conteos pendientes.
4. Registrar pago/cobro: `PaymentForm` crea `obligation_events` y opcionalmente `movements`.
5. Ajustar capital: `PrincipalAdjustmentForm` crea aumento/reduccion y opcionalmente movimiento.
6. Ver detalle: la pantalla resuelve si el usuario es owner o viewer compartido y cambia copy, acciones, colores y permisos.
7. Viewer compartido: puede solicitar pago, solicitar editar/eliminar evento y asociar eventos a su propia cuenta.
8. Owner: acepta/rechaza solicitudes de pago, edicion o eliminacion.
9. Adjuntos: los comprobantes pueden vivir en evento y movimiento; hay merge de previews y mirror entre entidades.
10. Analiticas: la lista y el detalle abren `ObligationAnalyticsModal`, que tambien dispara acciones de eventos.
11. Archivado/eliminacion: la lista elimina solo si todos los eventos son `opening`; si no, archiva cambiando status a `cancelled`.
12. Invitaciones: links universales y funciones Edge sincronizan owner/viewer y estado de share.

## Problemas de modularidad

| Prioridad | Problema | Evidencia | Impacto |
|---|---|---|---|
| Alta | Pantallas con estado y UI entremezclados | `app/obligation/[id].tsx` declara mas de 35 estados locales y renderiza historial, requests, modales y sheets | Refactors lentos, alta probabilidad de regresion |
| Alta | Capa de datos centralizada en un unico archivo | `workspace-data.ts` contiene snapshot, obligations, events, shares, notifications, viewer links y payment requests | Dificil testear y mantener invalidaciones |
| Alta | Duplicacion de logica de adjuntos | `mergePreviewAttachments` existe en lista y detalle; la misma necesidad aparece en analiticas | Riesgo de diferencias visuales y bugs |
| Alta | Duplicacion de impacto de eliminacion | Existe `components/domain/ObligationEventDeleteImpact.tsx`, pero `app/(app)/obligations.tsx` tiene `EventDeleteImpact` local | Inconsistencia entre pantallas |
| Media | Componentes UI internos no reutilizables | `SwipeableObligationRow`, filtros, section headers e historial estan definidos dentro de pantallas | No pueden usarse en dashboard o futuras listas |
| Media | Textos hardcodeados por pantalla | Labels de eventos, estados y botones aparecen en varios archivos | Copy inconsistente y dificil localizacion |
| Media | Validacion de formularios acoplada al render | `ObligationForm` mezcla schema, focus/scroll, submit y UI | Dificil extraer pasos o tests |
| Media | Estado de modales disperso | Lista y detalle administran muchos booleans y targets | Bugs al cerrar/abrir flujos combinados |
| Media | Mojibake en strings del archivo de queries | Ej. `ObligaciÃ³n`, `crÃ©dito`, `notificaciÃ³n` en `workspace-data.ts` | Mala experiencia en errores/notificaciones |
| Baja | Codigo muerto | En `useCreateObligationEventDeleteRequestMutation`, hay `return;` antes de un bloque `upsert` legacy | Ruido y mantenimiento confuso |

## Fortalezas existentes

1. La app ya tiene tokens visuales centralizados en `constants/theme.ts`.
2. `Card`, `Button`, `BottomSheet`, `ConfirmDialog`, `EmptyState`, `ProgressBar` y `SkeletonObligationRow` son bases utiles.
3. `lib/obligation-viewer-labels.ts` encapsula correctamente la perspectiva owner/viewer.
4. Los formularios de pago, ajuste y solicitud ya estan parcialmente extraidos.
5. Las edge functions de share estan separadas del cliente.
6. React Query ya centraliza carga, cache e invalidaciones.

## Riesgos funcionales que no se deben romper

1. `obligation_events` no tiene `workspace_id`; se resuelve por `obligations.workspace_id`. Ver `docs/SCHEMA_OBLIGATION_EVENTS.md`.
2. Owner y viewer ven el mismo `direction`, pero la perspectiva cambia. Nunca calcular labels financieros sin `obligationViewerActsAsCollector`.
3. Un evento puede tener movimiento owner y movimiento viewer vinculado; editar/eliminar debe sincronizar ambos.
4. Adjuntos pueden estar en evento o movimiento; la UI debe mostrar la union sin duplicados.
5. `shared-obligations` viene por edge function, no por snapshot.
6. Los links universales de share usan `/share/obligations/{token}`. Ver `docs/UNIVERSAL_LINKS.md`.
7. El status `cancelled` se usa como archivado en UI.

## Objetivo de arquitectura

El modulo debe dividirse en cuatro capas:

1. `app/*`: pantallas delgadas, solo routing, composicion y providers.
2. `features/obligations/*`: estado de pantalla, componentes de dominio, hooks, presenters y reglas del modulo.
3. `services/queries/obligations/*`: queries/mutaciones por recurso y keys tipadas.
4. `lib/obligations/*`: funciones puras de dominio, labels, calculos, permisos, formato y agrupaciones.

## Primeras extracciones recomendadas

| Orden | Extraer | Desde | Hacia sugerido | Motivo |
|---|---|---|---|---|
| 1 | `SwipeableObligationRow` | `app/(app)/obligations.tsx` | `features/obligations/components/ObligationSwipeRow.tsx` | Reutilizable y aislado |
| 2 | Filtros y toggle archivadas | `app/(app)/obligations.tsx` | `features/obligations/components/ObligationFilterBar.tsx` | Patron comun para chips |
| 3 | Construccion de secciones | `app/(app)/obligations.tsx` | `features/obligations/lib/buildObligationSections.ts` | Funcion pura testeable |
| 4 | Estado/list controller de lista | `app/(app)/obligations.tsx` | `features/obligations/hooks/useObligationsListController.ts` | Reduce pantalla |
| 5 | `mergePreviewAttachments` | lista/detalle | `lib/attachments/merge-preview-attachments.ts` | Evita duplicacion |
| 6 | `EventDeleteImpact` local | `app/(app)/obligations.tsx` | Usar `components/domain/ObligationEventDeleteImpact.tsx` | Evita dos implementaciones |
| 7 | Historial de detalle | `app/obligation/[id].tsx` | `features/obligations/components/ObligationEventHistory.tsx` | Reduce el archivo mas riesgoso |
| 8 | Controller de detalle | `app/obligation/[id].tsx` | `features/obligations/hooks/useObligationDetailController.ts` | Aisla permisos, requests y modales |
| 9 | Formularios por seccion | `ObligationForm.tsx` | `features/obligations/components/form/*` | Reutilizacion y menor complejidad |
| 10 | Queries/mutaciones | `workspace-data.ts` | `services/queries/obligations/*` | Mantenibilidad |

## Criterio de exito

1. `app/(app)/obligations.tsx` debe quedar por debajo de 250 lineas.
2. `app/obligation/[id].tsx` debe quedar por debajo de 350 lineas.
3. Ninguna pantalla debe declarar componentes de dominio reutilizables dentro del mismo archivo.
4. Todo texto financiero owner/viewer debe pasar por `lib/obligations/perspective`.
5. Toda lista nueva debe usar componentes comunes de filtro, seccion, empty/loading y row.
6. Toda mutacion debe declarar explicitamente sus query keys a invalidar.
7. Cada funcion pura nueva debe tener tests o al menos ejemplos documentados en el playbook.
