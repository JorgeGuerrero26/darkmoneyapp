# Plan de rediseño — DarkMoney (Revisión 14)

> Decimocuarta tanda: **el estado de cuenta en PDF**. Leído sobre un documento real de 21
> movimientos en dos páginas.

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 14 (30 ago 2026), mockup `AD`.
Archivo: `features/obligations/lib/obligationReport.ts`.

---

## 0. Lo que el PDF demuestra

> Las seis "cuotas" son S/ 330, 580, 30, 350, 450 y 690. Ninguna es S/ 350 salvo por
> coincidencia, y la número 3 son S/ 30 de Adobe y Apple Music. El documento llama cuota a cada
> pago que llegó, y las condiciones al pie declaran una cuota fija que la propia tabla contradice
> veintiuna veces.

Es la prueba de que el plan a medida hacía falta — y ya está construido (fase 14).

---

## 1. Lo aplicado

### [x] A · Cargo y abono: dos columnas donde una alcanza
En cada fila solo una estaba llena, así que había que ubicar en qué columna cayó el número para
saber si el saldo subió o bajó. Y son términos de partida doble: correctos en contabilidad,
ilegibles para quien vende cámaras. **Una sola columna "Movimiento" con signo**, y el saldo al
lado.

### [x] B · "Aumento de capital" trece veces, el producto en letra chica
Cada fila encabezaba con el tipo de evento —el dato que se repite— y relegaba a segunda línea lo
que la hace única. **Se invierte: el producto es el título de la fila y el tipo lo dice el
signo.** Los pagos sí llevan su etiqueta, porque "Cuota 1" solo no se entiende.

Y una fila sin concepto va marcada como **"Venta sin descripción", en cursiva**: en un documento
que se le envía a un cliente, un renglón sin explicación es una pregunta esperando, y hay que
ver que falta el dato y no que se omitió.

### [x] C · La página 2 empezaba sin encabezado y sin saldo arrastrado
El corte caía dentro de la tabla. Ahora **las filas se reparten en hojas**, cada una repite el
encabezado, y el corte lleva dos líneas: al pie, "Continúa en la página 2 · saldo arrastrado
11,415.00"; arriba de la siguiente, el mismo número como punto de partida. Es lo que hace que un
estado de cuenta impreso se pueda auditar por partes.

### [x] D · El saldo pendiente estaba al final de una lista de cinco
Sube a un **bloque en tinta plena** con la fecha de corte: es lo primero que ve quien recibe el
PDF. Debajo queda la resta completa —"Cómo se formó el saldo"—, que ahora incluye el **total**,
cifra que el resumen original no daba en ninguna parte pese a ser la base del porcentaje que sí
mostraba. Y "10% cobrado" flotando sin barra se va: en papel, la resta ya lo dice.

### [x] E · Condiciones que la tabla desmiente
Un estado de cuenta no puede afirmar una fecha que sus propios números contradicen. El
vencimiento va rotulado como **"pactado"** y con el **saldo proyectado a esa fecha** al lado, a
la cuota acordada. Si nadie pactó una fecha, la fila no sale.

### [x] F · Detalles de forma
El **periodo** ("15 mar — 31 jul 2026") entra en la cabecera, donde no figuraba. "Moneda: PEN"
pasa a **"Soles"**. El año se decía veintiuna veces siendo todas las fechas del mismo año: va
una vez, en el periodo. Y el pie repetía folio y fecha de generación que ya están arriba: en
cada página basta el folio y el número de hoja.

---

## 2. Lo que no es diseño y necesita al usuario

El diseñador lo marca aparte, y sigue abierto:

- "Pago · Cuota 3 · Adobe y Apple music" (S/ 30) y "Reducción de capital · Adobe y Apple Music
  Junio" (S/ 25) son **la misma clase de hecho registrada como dos tipos distintos**.
- "Prestamo canon M50 para viaje" figura como **reducción de capital** cuando parece un
  descuento.

Eso lo resuelve quien conoce el acuerdo, no el documento.
