# El plan de pagos contra lo que de verdad entró

> No es una fase del `PLAN-REDISENO.md` del diseñador: salió de revisar el detalle en uso.
> Su Fase 24 es otra cosa —fecha y hora—, así que este documento va por nombre y no por número.

Origen: revisión del detalle de "Diversas Ventas de Productos" (obligación 3), 1 sep 2026.
La pantalla mostraba doce cuotas con nueve marcadas como pagadas mientras la barra decía 12%.

## El caso que lo destapó

| Dato | Valor |
|---|---|
| Deuda de hoy | S/ 25,355.00 (primera venta 7,175 + 14 ventas más 18,210 − 30 de descuentos) |
| Sobre cuánto reparte el plan | **S/ 7,175.00** — solo la primera venta |
| Cobrado | S/ 3,155.00 en 9 pagos |
| Lo que decía la cinta | "9 de 12 pagos" (75%) con la barra al 12% |
| Última cuota | "Ago 2027 · Cierra el saldo · S/ 2,800.00 · era S/ 485.00" — no cierra nada |

Tres pares de pagos caen en el mismo mes (abr 580+30, jul 5+690, ago 690+30) y los nueve son
**anteriores** a la primera cuota del plan, que empieza en sep-2026.

## Las tres decisiones

### 1. Cascada — el dinero llena cuotas en orden

La imputación se guía por **una sola cifra: el total acumulado**. No por la fecha del pago, no por
el mes, no por un campo que el usuario rellene.

> El siguiente cobro va a la primera cuota cuyo acumulado supera lo cobrado hasta hoy.

Con los datos reales: 3,155 cobrados contra cuotas acumuladas 540 / 1,150 / 1,900 / 2,510 / 3,170
→ **cuatro cuotas cubiertas y la quinta a 645 de 660**. Hoy la pantalla dice que la siguiente es
Jun 2027; con cascada es Ene 2027 y le faltan S/ 15.00.

Un cobro puede tocar **dos cuotas a la vez**: 150 sobre una cuota de 200 con 100 ya cubiertos
cierra esa y adelanta 50 de la siguiente.

Lo que la cascada no hace: imputar a una cuota concreta saltándose las anteriores. Si algún día
hace falta, la columna `obligation_events.installment_no` ya existe y sería un *override* sobre la
cascada, nunca en su lugar.

Se descartaron:

- **Emparejar por fecha → mes.** El plan empieza en sep y los pagos son de mar–ago: no hay mes que
  emparejar, y un mes sin pago dejaría un hueco que nunca se llena.
- **Que el usuario elija.** Es el campo "N° de cuota" que se retiró por venir con un número puesto
  que casi nunca acertaba. Los datos que dejó lo prueban: el pago del 19 de julio quedó como cuota
  7 y el del 31 de julio como cuota 6.

### 2. El plan se expande sobre la deuda de hoy, no sobre la de apertura

Hoy `expandPaymentPlan` recibe `principalAmount`, que por diseño conserva el monto de apertura. Los
aumentos viven como eventos y el plan no los ve: por eso reparte 7,175 de una deuda de 25,355 y por
eso "Ajustar monto" no movía nada del plan.

Pasa a recibir `currentPrincipalAmount` (apertura + aumentos − reducciones), que es la misma cifra
que ya enseña la tarjeta "Cómo llegó a S/ 25,355.00".

Qué se mueve al ajustar el monto, según lo que el usuario fijó al crear:

| Modo | Fijó | Se mueve |
|---|---|---|
| **Cuotas iguales** | cuántas | el monto de cada una |
| **A medida** | los montos | cuántas cuotas tiene la cola |

En "a medida" las acordadas no se tocan nunca — son montos pactados con otra persona — y la cola
crece o se acorta. Es para lo que la cola existía; solo se calculaba sobre el monto equivocado.

### 3. En cuotas iguales, recalcular solo lo que falta (opción B)

Si ya pagaron 3 de 6 a S/ 1,000 y la deuda sube a 9,000:

- **A (descartada):** 6 cuotas de 1,500. Las tres pagadas quedan cortas y el avance retrocede de
  3/6 a 2/6. Repricia hacia atrás algo que ya se cobró al precio acordado.
- **B (elegida):** las tres cubiertas se quedan como estaban; los 6,000 que faltan se reparten
  entre las tres restantes → 3 cuotas de 2,000. El avance sigue en 3/6.

Es lo que se hace en la vida real —se renegocia lo que queda, no lo que ya se cobró— y encaja con
la regla del 30-ago: **lo acordado no se reescribe**.

## Lo que cambia en pantalla

### La tarjeta "Plan y pagos"

Hoy cada pago es un bloque de tres líneas de ~117px y se pintan los doce: casi tres pantallas. La
tarjeta de justo debajo ("Movimientos · Todos · 26") ya enseña tres y ofrece "Ver los 26
movimientos"; el plan es el único que no sigue ese patrón.

- **Filas de 56px sobre el lienzo**, como movimientos. Sin recuadro por pago.
- **Ventana alrededor de la cuota que toca**, no un corte por el principio ni por el final: un plan
  mira al futuro, así que cortar por el final esconde justo la que importa. Lo ya cubierto se
  pliega en una línea con su total; se ven la que toca y las dos o tres siguientes; al pie, "Ver el
  plan completo (N pagos)".
- **La explicación de la desviación, una sola vez al pie.** Hoy "Se suma al final; el plan no
  cambia" aparece en las nueve filas pagadas: repetida nueve veces deja de explicar. La fila ya
  dice `540 · 330`, que es la desviación.

### El resto

- **"9 de 12 pagos"** cuenta pagos, no dinero, y contradice a su propia barra. Con cascada pasa a
  ser "4 de 12" y es verdad.
- **"cuota pactada S/ 540.00"** en el pie es solo la primera de siete montos distintos.
- **La etiqueta "Cuota N de M" del formulario de cobro** (publicada el 1 sep) queda correcta sola
  con las decisiones 1 y 2. Y gana una línea que reacciona al monto: "Completa esta cuota y
  adelanta S/ 50.00 de la siguiente" / "Quedarán S/ 20.00 pendientes de esta cuota".

## Orden

Los tres primeros son independientes entre sí; el 4 y el 5 dependen de que la cuota que toca esté
bien calculada, porque son una lupa sobre ese dato.

1. Cascada (`coverPlan` en `features/obligations/lib/payment-plan.ts`)
2. Plan sobre la deuda de hoy + opción B
3. Filas de 56px y desviación sin frase
4. Ventana + "Ver el plan completo" — depende de 1 y 2
5. "N de M" por dinero y la línea que reacciona al monto — depende de 1 y 2
