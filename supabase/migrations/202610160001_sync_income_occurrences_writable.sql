-- Motor offline, Fase 5.1 (paso 4): la llegada de un ingreso fijo sin conexión.
-- Plan: docs/OFFLINE_PHASE5_ATOMIC_GROUPS_PLAN.md
--
-- Anotar la llegada de un ingreso fijo escribe TRES filas que deben ir juntas (grupo atómico de push_batch):
-- el movimiento de ingreso, su fila en el historial de llegadas (recurring_income_occurrences) y el avance de la próxima
-- fecha del ingreso (recurring_income). Las dos últimas ya son tablas sincronizables, pero el historial de llegadas estaba
-- registrado como SOLO LECTURA. Esta migración lo hace escribible para que viaje dentro del grupo.
--
-- Sin cambios de esquema ni de políticas: el cliente ya insertaba esta tabla directamente (RLS de pertenencia al
-- espacio: workspace_members_insert/update/delete_recurring_income_occurrences). Los clientes anteriores no se ven
-- afectados: siguen escribiendo la tabla directamente, y pull_changes la sigue entregando igual.

update public.sync_tables
   set writable = true
 where table_name = 'recurring_income_occurrences';
