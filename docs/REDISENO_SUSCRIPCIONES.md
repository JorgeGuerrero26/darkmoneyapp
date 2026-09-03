# Suscripciones sólidas — de un puntero a un historial

Estado: **plan aprobado, sin implementar**. Decisiones tomadas por el usuario el 2026-09-02.

---

## 1. El problema

`subscriptions.next_due_date` es **un puntero, no un historial**. Solo avanza cuando alguien
toca "marcar pagada", así que "pagada" no significa *el dinero salió*: significa *alguien tocó
el botón*. Nada en el sistema observa la plata.

El caso que lo destapó: pagas Netflix en julio y lo registras como un movimiento normal, sin
pasar por el módulo. La suscripción sigue diciendo que julio falta, porque el movimiento no
lleva `subscription_id` y nadie lo mira.

No es un caso borde. Del mismo puntero salen todos estos:

| Situación | Qué pasa hoy |
|---|---|
| Pagas por fuera del módulo | El mes sigue "sin anotar" para siempre |
| `auto_create_movement` activo + lo registraste a mano | `useAutoSubscriptionMovements` crea **otro** movimiento: el gasto se cuenta dos veces |
| Tocas "marcar pagada" dos veces | Avanza dos períodos, sin vuelta atrás |
| Borras o anulas el movimiento del pago | La fecha ya avanzó y se queda avanzada |
| Reactivas una pausada | `rollDueDateForward` salta hasta hoy: los períodos intermedios **desaparecen**, sin distinguir pagado de saltado |
| Sube el precio | Hay un solo `amount`, así que el histórico se reescribe: "Van 3 cobros sin anotar, S/ 180.21" calcula meses viejos al precio de hoy |
| El banco avisa del cargo | La detección crea el movimiento, pero nada lo conecta con la suscripción |

## 2. El hallazgo

**`subscription_occurrences` ya existe en la base de datos** con exactamente los campos que
hacen falta:

`id` · `subscription_id` · `due_date` · `expected_amount` · `status` · `movement_id` ·
`paid_at` · `notes`

y el enum `subscription_occurrence_status` ya tiene `scheduled | paid | skipped | cancelled |
overdue`.

**La app no la usa.** La única referencia en todo el código la borra cuando eliminas una
suscripción (`services/queries/subscriptions-recurring-income.ts`, en el delete). La decisión
se tomó hace tiempo y no se terminó; el módulo se quedó funcionando con el puntero.

> Antes de la fase 1 hay que **verificar el estado real de la tabla en producción**: si tiene
> RLS habilitada (el diccionario dice que resuelve vía su padre), si existe un unique sobre
> `(subscription_id, due_date)` y si hay filas huérfanas de algún experimento viejo.

## 3. Cómo lo resuelven otras apps

- **YNAB** — transacciones programadas + *matching*: cuando entra la real, la empareja con la
  programada en vez de duplicar. Ventana de fechas, monto aproximado, y el usuario confirma.
- **Rocket Money · Monarch · Copilot · Emma** — no le piden el calendario al usuario: lo
  **derivan** de los movimientos reales (comerciante + cadencia detectada). El mes se marca
  solo cuando aparece el cargo.
- **Firefly III (bills)** — la factura tiene monto **mínimo y máximo** más una ventana de
  fechas; está pagada si hay una transacción que cae dentro. Y tiene *skip* para meses libres.

Lo común, que es lo que se roba: **el estado es una observación sobre movimientos, no un
botón**; el emparejamiento se **sugiere**; y "saltado" existe y no es lo mismo que "pagado".

Y el precedente propio: la **cascada** de obligaciones (`features/obligations/lib/payment-plan.ts`,
`coverPlan`) ya resuelve "el dinero llena períodos en orden, sin importar en cuántos pagos
venga". Esto es el mismo problema con otra ropa.

## 4. Decisiones tomadas

| # | Decisión | Elegido |
|---|---|---|
| A | Qué hace la app cuando encuentra un candidato | **Sugerir y que el usuario confirme.** Nada se marca solo |
| B | Qué pasa si el monto no coincide | **Lo acepta y actualiza el precio.** El mes queda pagado con el monto real, la ocurrencia guarda ese monto, y se pregunta **una vez** si el precio nuevo rige de ahora en adelante |
| C | Qué pasa si nunca aparece el cargo | **Queda "sin anotar"** hasta que el usuario lo resuelva o lo salte. La app no inventa un gasto que nadie vio |
| D | Qué hacer con el histórico | **Reconstruir todo** desde `start_date` y emparejar lo que se pueda. Los meses que no cuadren quedan visibles como "sin anotar" |

La decisión C tiene una consecuencia que hay que asumir: **`auto_create_movement` deja de
crear movimientos a ciegas.** Pasa a ser "cuando llegue el vencimiento, búscame el cargo y
propónmelo". Sin candidato, no hay gasto inventado. Es lo que hoy duplica.

## 5. El modelo

### 5.1 La suscripción es la regla; la ocurrencia es el hecho

Al crear o editar una suscripción se materializan las ocurrencias desde `start_date` hasta
**hoy + 2 períodos**. `next_due_date` **no se elimina** —lo leen `v_subscription_upcoming`, el
digest de notificaciones y el dashboard— pero deja de ser la verdad: pasa a ser una **caché**
de "la primera ocurrencia no resuelta", recalculada cada vez que una ocurrencia cambia de
estado. Quitar la columna sería un cambio mucho más ancho que este plan.

### 5.2 Estados de una ocurrencia

| Estado | Significa |
|---|---|
| `scheduled` | Todavía no vence |
| `overdue` | Venció y no hay movimiento emparejado (derivado de la fecha, no almacenado) |
| `paid` | Tiene `movement_id`. **Es la única forma de estar pagada** |
| `skipped` | El usuario dijo que ese mes no se cobró (mes gratis, promo, pausa) |
| `cancelled` | La suscripción se canceló o terminó antes de esta fecha |

### 5.3 Emparejamiento

**Candidato** = movimiento de gasto, no anulado, sin ocurrencia asignada, que cumple:

1. `occurred_at` dentro de la ventana `[due_date − 5d, due_date + 10d]` — asimétrica a
   propósito: un cobro se retrasa más de lo que se adelanta;
2. monto dentro de tolerancia (§5.4);
3. si la suscripción tiene `account_id`, el movimiento sale de esa cuenta.

**Puntuación** (para elegir el mejor cuando hay varios): coincidencia de cuenta, cercanía a la
fecha, monto exacto, coincidencia de `counterparty_id` o del nombre en la descripción, y un
plus si viene de la detección de notificaciones con ese comerciante.

**Nada se empareja solo** (decisión A). El candidato se ofrece en tres sitios:

- el detalle de la suscripción, sobre la rejilla: *"¿El gasto de S/ 60.07 del 4 jul en Cuenta
  Sueldo es el cobro de julio?"* con Sí / No;
- la lista de suscripciones, como recuento: *"3 cobros por confirmar"*;
- el detalle del movimiento: *"¿Pertenece a una suscripción?"* → elegir suscripción y período.

"No" marca ese movimiento como **descartado para esa ocurrencia** (hace falta una tabla o un
campo en metadata) para que no lo vuelva a proponer cada vez que abras la pantalla.

### 5.4 Precio

`expected_amount` se congela en cada ocurrencia al materializarla, así el histórico no se
reescribe cuando cambia el precio. Al emparejar:

- diferencia ≤ **2 %** o ≤ **S/ 1**: pasa sin comentarios (impuestos, redondeos, tipo de cambio);
- diferencia mayor: **empareja igual** y pregunta una vez *"Netflix ahora cuesta S/ 65.00.
  ¿Actualizo el precio para los próximos meses?"*. Sí → `subscriptions.amount = 65`, y las
  ocurrencias futuras (solo las `scheduled`) se regeneran con el nuevo monto.

### 5.5 Reglas de integridad

- Anular o borrar un movimiento emparejado devuelve su ocurrencia a `scheduled`. Esto pide un
  trigger en la base o el manejo explícito en la mutación de anular/borrar movimiento.
- Una ocurrencia tiene **como mucho un** movimiento; un movimiento pertenece **como mucho a
  una** ocurrencia. Unique en las dos direcciones.
- Pausar no borra nada: las ocurrencias que caen dentro de la pausa quedan `skipped` con nota.
  Reactivar deja de destruir el pasado.
- Editar la cadencia regenera solo las `scheduled` futuras. Lo pagado y lo saltado no se toca.

## 6. La pantalla

El detalle enseña una **rejilla de doce meses**: cada uno pagado / sin anotar / saltado, con su
monto real. Ahí el julio del problema se ve resuelto de un vistazo, y el cambio de precio se
lee como lo que es (los meses viejos a 44.90, los nuevos a 60.07).

`subscriptionStanding` (revisión 24) pasa a leer ocurrencias en vez de contar períodos a ojo:
"Van 3 cobros sin anotar" deja de multiplicar el precio de hoy y suma los `expected_amount`
reales.

## 7. Fases

| Fase | Qué entra | Riesgo |
|---|---|---|
| **1** | Materializar ocurrencias + backfill de todo el histórico + `next_due_date` derivado. Sin cambios visibles salvo que las cifras se corrigen | Alto: toca datos existentes. Backfill idempotente y probado en local antes de producción |
| **2** | Emparejamiento **manual** desde el detalle del movimiento y desde la rejilla. Ya resuelve el caso de julio a mano | Bajo |
| **3** | Candidatos + sugerencias en los tres sitios, con "No, no es" | Medio: la puntuación necesita tests con casos reales |
| **4** | Rejilla de doce meses, "saltar mes", `auto_create_movement` convertido en propuesta | Medio |
| **5** | Precio por ocurrencia con la pregunta de actualización, y el enganche con la detección de notificaciones | Bajo |

Cada fase termina en un commit con typecheck y tests verdes, y las fases 1 y 3 llevan tests
unitarios de sus funciones puras antes de tocar pantalla.

## 8. Piezas de código

**Nuevas, puras y con test** (`features/subscriptions/lib/`):

- `occurrences.ts` — `generateOccurrences({ subscription, from, to })`: la serie de
  vencimientos. Aquí viven los meses de 31 días, los bisiestos y el `day_of_month` 31 en
  febrero, que es donde esto se equivoca solo.
- `matchOccurrence.ts` — `scoreCandidate()` y `pickBestCandidate()`: la ventana, la tolerancia
  y la puntuación, sin Supabase de por medio.
- `subscriptionStanding.ts` — reescrito sobre ocurrencias.

**Migración** (`supabase/migrations/`): unique `(subscription_id, due_date)`, unique parcial
sobre `movement_id`, índice por `(subscription_id, status)`, RLS vía `subscriptions`, y el
backfill. **Actualizar `DATABASE_DICTIONARY.md` en la misma tarea** — la tabla ya está
documentada pero sin índices ni policies.

**Servicios**: `services/queries/subscription-occurrences.ts` (listar, emparejar, desemparejar,
saltar), invalidando `["workspace-snapshot"]` y `["movements"]`.

**Retirar**: la generación a ciegas de `useAutoSubscriptionMovements` (fase 4).

## 9. Lo que queda por decidir

- **Dónde vive el descarte** ("este movimiento no es el cobro de julio"): tabla propia o
  `metadata` del movimiento. Se decide al implementar la fase 3.
- **Recurring income**: tiene el mismo modelo de puntero y el mismo fallo. Este plan no lo
  toca; si funciona, se replica.
- **Cuántos meses enseña la rejilla** cuando la suscripción tiene años: doce con "ver todo",
  probablemente.
