-- Plan de pagos de una obligación (Revisión 11 del rediseño).
--
-- Hasta ahora el plan eran dos columnas sueltas —`installment_amount` e `installment_count`—
-- que el formulario pedía como dos campos libres, así que admitían datos que se contradicen:
-- seis cuotas de S/ 50 sobre un monto de S/ 1.000. La cuota se calcula dividiendo el monto, y
-- eso no necesita guardarse.
--
-- Lo que sí hay que guardar es el plan A MEDIDA, que las dos columnas viejas no pueden
-- representar: un acuerdo real pacta los primeros pagos —distintos entre sí— y después "lo de
-- siempre" hasta terminar el saldo. Es un documento pequeño y siempre se lee entero, así que va
-- en una columna jsonb y no en una tabla aparte: hereda las políticas RLS de `obligations` y no
-- añade un viaje más a la base.
--
--   { "mode": "equal",  "count": 6 }
--   { "mode": "custom", "agreed": [100, 150, 300], "tail": 200 }
--
-- Las fechas no se guardan: son mensuales desde `start_date` (decisión del 2026-08-30). Y el
-- plan queda fijo: si alguien paga distinto a lo pactado se muestra la diferencia, no se
-- recalcula lo que sigue.
--
-- `installment_amount` e `installment_count` se conservan: hay obligaciones vivas que las usan
-- y el lector las sigue leyendo cuando no hay `payment_plan`.

alter table public.obligations
  add column if not exists payment_plan jsonb;

comment on column public.obligations.payment_plan is
  'Plan de pagos: {"mode":"equal","count":N} o {"mode":"custom","agreed":[..],"tail":N}. Fechas mensuales desde start_date.';

-- La vista lista sus columnas explícitamente, así que la nueva no aparece sola. Se recrea con
-- la misma definición más `payment_plan`, que va al final: create or replace view solo admite
-- columnas nuevas al final de la lista.
create or replace view public.v_obligation_summary as
WITH event_rollup AS (
         SELECT oe.obligation_id,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'principal_increase'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS principal_increase_total,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'principal_decrease'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS principal_decrease_total,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'payment'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS payment_total,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'interest'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS interest_total,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'fee'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS fee_total,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'discount'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS discount_total,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'writeoff'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS writeoff_total,
            COALESCE(sum(
                CASE
                    WHEN oe.event_type::text = 'adjustment'::text THEN oe.amount
                    ELSE 0::numeric
                END), 0::numeric)::numeric(14,2) AS adjustment_total,
            count(*) FILTER (WHERE oe.event_type::text = 'payment'::text)::integer AS payment_count,
            max(oe.event_date) FILTER (WHERE oe.event_type::text = 'payment'::text) AS last_payment_date,
            max(oe.event_date) AS last_event_date
           FROM obligation_events oe
          GROUP BY oe.obligation_id
        ), summary_base AS (
         SELECT o.id,
            o.workspace_id,
            o.direction,
            o.origin_type,
            o.status,
            o.title,
            o.counterparty_id,
            o.settlement_account_id,
            o.currency_code,
            o.principal_amount AS principal_initial_amount,
            COALESCE(er.principal_increase_total, 0::numeric)::numeric(14,2) AS principal_increase_total,
            COALESCE(er.principal_decrease_total, 0::numeric)::numeric(14,2) AS principal_decrease_total,
            (o.principal_amount + COALESCE(er.principal_increase_total, 0::numeric) - COALESCE(er.principal_decrease_total, 0::numeric))::numeric(14,2) AS principal_current_amount,
            COALESCE(er.interest_total, 0::numeric)::numeric(14,2) AS interest_total,
            COALESCE(er.fee_total, 0::numeric)::numeric(14,2) AS fee_total,
            COALESCE(er.adjustment_total, 0::numeric)::numeric(14,2) AS adjustment_total,
            COALESCE(er.discount_total, 0::numeric)::numeric(14,2) AS discount_total,
            COALESCE(er.writeoff_total, 0::numeric)::numeric(14,2) AS writeoff_total,
            COALESCE(er.payment_total, 0::numeric)::numeric(14,2) AS payment_total,
            GREATEST(0::numeric, o.principal_amount + COALESCE(er.principal_increase_total, 0::numeric) - COALESCE(er.principal_decrease_total, 0::numeric) + COALESCE(er.interest_total, 0::numeric) + COALESCE(er.fee_total, 0::numeric) + COALESCE(er.adjustment_total, 0::numeric) - COALESCE(er.discount_total, 0::numeric) - COALESCE(er.writeoff_total, 0::numeric) - COALESCE(er.payment_total, 0::numeric))::numeric(14,2) AS pending_amount,
            o.start_date,
            o.due_date,
            o.installment_amount,
            o.installment_count,
            o.interest_rate,
            o.description,
            o.notes,
            o.payment_plan,
            COALESCE(er.payment_count, 0) AS payment_count,
            er.last_payment_date,
            er.last_event_date,
            o.created_at,
            o.updated_at
           FROM obligations o
             LEFT JOIN event_rollup er ON er.obligation_id = o.id
        )
 SELECT id,
    workspace_id,
    direction,
    origin_type,
    status,
    title,
    counterparty_id,
    settlement_account_id,
    currency_code,
    principal_initial_amount,
    principal_increase_total,
    principal_decrease_total,
    principal_current_amount,
    interest_total,
    fee_total,
    adjustment_total,
    discount_total,
    writeoff_total,
    payment_total,
    pending_amount,
    start_date,
    due_date,
    installment_amount,
    installment_count,
    interest_rate,
    description,
    notes,
    payment_count,
    last_payment_date,
    last_event_date,
    created_at,
    updated_at,
        CASE
            WHEN (principal_current_amount + interest_total + fee_total + adjustment_total - discount_total - writeoff_total) <= 0::numeric THEN 0::numeric
            ELSE LEAST(100::numeric, round((principal_current_amount + interest_total + fee_total + adjustment_total - discount_total - writeoff_total - pending_amount) / NULLIF(principal_current_amount + interest_total + fee_total + adjustment_total - discount_total - writeoff_total, 0::numeric) * 100::numeric, 0))
        END AS progress_percent,
    payment_plan
   FROM summary_base sb;

alter view public.v_obligation_summary set (security_invoker = true);
