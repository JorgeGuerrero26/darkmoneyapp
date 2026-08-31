# Plan de rediseño — DarkMoney (Revisión 13)

> Decimotercera tanda: **el detalle de una obligación real**. Una cuenta corriente con un
> cliente, no un préstamo.

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 13 (30 ago 2026), mockup `AC · DETALLE`.

---

## 0. El hallazgo

> Esto no es un préstamo, es una cuenta corriente con un cliente. Empezó en S/ 7,175 y hoy son
> S/ 23,455 después de 12 aumentos: cada venta nueva se sumó a lo que ya debía. La pantalla está
> construida para lo contrario: un monto fijo, una cuota de S/ 350 y un vencimiento. Con
> S/ 21,025 pendientes, esa cuota son sesenta pagos más.

Se invierte el orden: primero cuánto falta, después cómo llegó a ese número, y el historial
completo sin filtro previo.

---

## 1. Lo aplicado

### [x] A · El filtro por defecto ocultaba los catorce eventos
El historial abría en "Mes actual" y respondía "Ningún evento en este rango de fechas" sobre una
obligación con catorce guardados. **Abre completo.** Los filtros aparecen a partir de doce
eventos —la misma regla que el buscador de Cuentas— y el rótulo dice qué se está viendo:
"Todos · 21".

### [x] B · Dos cápsulas que explicaban el modelo de datos
"Los cobros reducen el saldo pendiente" y "Capital cambia el monto prestado o debido" eran notas
al pie con forma de filtro: enseñaban vocabulario interno. Se van. En su lugar, **cada fila
muestra el saldo que quedó** —"quedan 21,025.00"—, que enseña la mecánica sin una sola línea de
instrucción. El cálculo vive en `features/obligations/lib/running-balance.ts`, con test.

### [x] C · "Resumen de capital" en cuatro cajas de dos colores
Cuatro cifras de una sola resta, presentadas como cuatro indicadores independientes. Pasa a ser
**una operación que se lee de arriba abajo** y termina en el total, con el título diciendo qué
pregunta responde: "Cómo llegó a S/ 23,455.00". Sin verde y sin rojo: nadie perdió nada cuando le
vendiste más.

Y "capital" es la palabra del contador: cuando la obligación nació de una venta a cuotas, los
aumentos se llaman **ventas** y las reducciones **descuentos**.

### [x] D · "Editar obligación" era lo más llamativo de la pantalla
Menta plena, ancho completo, para cambiar datos administrativos. **Se va al menú de la esquina**,
junto a Compartir y Reducir monto. **Aumentar monto** queda como acción secundaria al lado de
"Registrar cobro", que es lo que uno viene a hacer — y ocurre doce veces contra dos.

### [x] E · Cuatro líneas para decir un número
La tarjeta apilaba la dirección en menta, el nombre del contacto, el rótulo y la cifra, todo
centrado. **El nombre y la dirección van al encabezado**, junto al título. Queda el rótulo y el
número, alineados a la izquierda como el resto de las cifras de la app.

### [x] F · La cuota de S/ 350 contra un saldo de S/ 21,025
La cuota y el vencimiento eran datos firmes en su propia sección, y se contradicen. Bajan a una
**línea de contexto** al pie de la cifra: "Activa desde el 15 de marzo · cuota pactada S/ 350.00 ·
vence 31 ene 2027", con "pactada" diciendo que es lo acordado, no lo que está pasando.

### [x] G · Detalles menores
La cápsula "PEN" en violeta —color que no está en el sistema— pasa a decir "Soles" en gris.
"Ningun", "Este ano", "Interes" y "liquidacion" recuperan sus tildes.

---

## 2. Lo que queda pendiente

**La pregunta que la pantalla sigue sin contestar:** al ritmo de los últimos meses, cuándo queda
en cero. Es un cálculo que la app tiene los datos para hacer —hay fechas y montos de veintiún
movimientos— y el diseñador lo marca como material para una revisión aparte. No se inventa aquí.

---

## 3. Revisión 16 — todos los movimientos (31 ago)

### [x] A · El signo estaba al revés
El 19 de julio tiene un pago de S/ 5 y dos reducciones de S/ 5 y S/ 25 —los tres bajan la deuda—
y la cabecera decía **+ S/ 35.00 en menta**, sumando magnitudes como si hubiera crecido, mientras
el saldo de la derecha de la misma fila bajaba. **El signo dice hacia dónde se movió la deuda**:
`+` cuando le debe más, `−` cuando menos. `signedNet` lo calcula, con test.

### [x] B · Dos vocabularios para el mismo tipo de evento
"Reducción de capital · Préstamo canon M50" y "Viper V3 Pro · venta" estaban titulados al revés.
**El concepto va siempre en el título** —es lo que identifica la fila y lo que el PDF imprime— y
el mecanismo baja al subtítulo dicho en lo que le pasa a la deuda: "le debe más", "le debe
menos". "Capital" sale.

### [x] C · Cuota 7 con fecha anterior a la cuota 6
El pago del 31 de julio era "Cuota 6" y el del 19, doce días antes, "Cuota 7". No es un error de
datos: es que la numeración no describe nada en una cuenta donde se paga 330, 580, 30, 350, 450 y
690. **El número se retira**; el subtítulo queda para la referencia que sí escribiste.

### [x] D · La cabecera de día pesaba más que las filas
Siete grupos para ocho filas, cinco de ellos encabezando un solo movimiento, y la fecha repetida
dos renglones más abajo. **El agrupamiento pasa a mes**, con el neto del mes; el día vive en el
subtítulo de cada fila.

### [x] E · "Mov." y los puntos sin leyenda
Una cápsula de cuatro letras en un azul que no existe en el sistema, y unos puntos que
distinguían dos clases sin decir cuáles. **Las dos señales se van**: el signo ya dice la
dirección, y el vínculo con el movimiento es un dato del detalle de la fila.

### [x] F · "Todo" en menta y el aviso redundante
Los cinco filtros pasan a **una sola pista segmentada** con lo elegido en hueso, y la línea
"Mostrando todos los eventos del historial" se retira: es lo que ya dice el filtro marcado.
"Rango…" pierde los puntos.

### [x] G · Títulos cortados y "quedan" ocho veces
El saldo va **debajo del monto**, así que el título gana el ancho que le faltaba. Y "quedan" no
se repite en cada fila: la columna siempre significa lo mismo.
