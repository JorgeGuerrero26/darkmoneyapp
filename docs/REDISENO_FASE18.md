# Plan de rediseño — DarkMoney (Revisión 18)

> Decimoctava tanda: **el detalle de una cuenta**. Leído sobre "Cuenta Sueldo".

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 18 (31 ago 2026), mockup `AI`.
Archivos: `app/account/[id].tsx`, `features/accounts/components/AccountMovementRow.tsx` (nuevo),
`features/accounts/components/BalanceEvolutionChart.tsx`, `app/(app)/movements.tsx`.

---

## 0. Seis veces "Cuenta Sueldo"

> El nombre aparecía en el título, otra vez en la tarjeta de identidad justo debajo, y luego en
> **cada una de las cuatro filas de transferencia**. Pero en esas filas es el único dato que ya
> sabes: estás dentro de esa cuenta. Lo que falta es a dónde fue la plata.

Es la misma falla del campo "motivo" del PDF: el sitio donde debería ir el dato que identifica la
fila, ocupado por algo constante. Cuatro transferencias distintas se veían idénticas —mismo
título, misma etiqueta, misma fecha— y solo el monto las separaba.

---

## 1. Lo aplicado

### [x] A · La fila nombra la otra cuenta
**"A Cuenta Principal", "De Yape"**. Y la tarjeta de identidad, que repetía el título entero para
añadir un solo dato nuevo —el banco—, se va: ese dato sube al subtítulo del encabezado.

### [x] B · "Actividad hace 3 meses", con un movimiento de hoy
El subtítulo decía que la cuenta llevaba tres meses quieta, cuatrocientos píxeles por encima de un
pago de hoy. Una de las dos cosas era falsa y no había manera de saber cuál. El subtítulo lleva lo
que **identifica** la cuenta —"BCP · Banco · soles"— y la actividad la cuenta la lista.

### [x] C · Editar y Archivar, dos veces cada uno
Los dos iconos del encabezado volvían a aparecer como botones grandes en "Acciones rápidas". De
las cinco acciones de ese bloque, dos eran duplicados, una era otra pantalla ("Analítica") y
**"Archivar" —que retira la cuenta de la app— tenía el mismo tamaño que "Nuevo gasto"**.

Quedan las dos que uno hace desde una cuenta: **registrar un gasto y transferir**. Editar,
Analítica y Archivar viven en el menú del encabezado, donde Archivar deja de estar al alcance del
pulgar.

### [x] D · "+12.8%" y "Mín S/ 1,610.03" no describen la misma curva
El titular decía que el saldo subió 12.8% en 90 días; el pie, que el mínimo fue 1,610 y el máximo
4,601. El porcentaje es correcto —compara el primer día con el último— pero se lee como "esta
cuenta creció poco", que es lo contrario de lo que muestra el dibujo. Sale, y queda la cifra con
su punto de partida: **"+ S/ 520.14 · desde S/ 4,075.48"**. Dos números que se pueden restar y
verificar.

### [x] E · Una curva verde que baja la mitad del tiempo
La línea y el relleno eran menta de punta a punta, incluidos los treinta días en que el saldo cae
de 4,000 a 1,600. Y pintarla por tramos tampoco ayudaría: **el saldo de una cuenta no es un
ingreso ni un gasto, es una posición**. La curva va en hueso sobre relleno tenue; el eje ya dice
si sube o baja y el color queda libre para las dos cifras que sí lo necesitan.

### [x] F · Las cápsulas "Transferencia" en azul violáceo
Cuarto sitio donde aparecía ese azul. Etiquetaba cuatro filas seguidas con la misma palabra, al
lado de un icono que decía lo mismo, debajo de un título que también lo decía. La etiqueta baja al
subtítulo, en gris, junto a la fecha —"29 ago · transferencia"— y los iconos de tipo se van con
ella: cuatro cuadrados idénticos en columna no distinguen nada. El título recupera el ancho.

### [x] G · Los montos en tres tamaños, y el botón flotante encima
Los montos usan la variante `flat` de la Revisión 17. Y el botón flotante **se retira**: tapaba el
monto de la cuarta fila y media quinta, y lo que se crea desde una cuenta ya está arriba, a la
vista, sin cubrir nada.

### [x] H · El bloque de movimientos no tenía título
La lista arrancaba sin rótulo justo después del gráfico, así que sus primeras filas parecían parte
de él. Ahora abre con **"MOVIMIENTOS · Ver todos"**, que lleva a Movimientos con la cuenta ya
filtrada (parámetro `quickAccountId`, nuevo).

---

## 2. Lo que no cambió

- `MovementRow`, la fila de la pantalla de Movimientos, se queda como está: esta revisión es del
  detalle de una cuenta, donde el contexto —ya sabes en qué cuenta estás— es distinto. Por eso la
  fila nueva es `AccountMovementRow` y no un cambio a la compartida.
- Deslizar para eliminar o repetir un movimiento sigue igual.
