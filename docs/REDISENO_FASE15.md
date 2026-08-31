# Plan de rediseño — DarkMoney (Revisión 15)

> Decimoquinta tanda: **las cinco hojas de la obligación** — cobro/pago, aumentar, reducir,
> editar. Leídas después del PDF de la Revisión 14, que es donde se ve el daño.

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 15 (31 ago 2026), mockups `AE` y `AF`.
Archivos: `components/forms/PaymentForm.tsx`, `components/forms/PrincipalAdjustmentForm.tsx`,
`components/forms/ObligationForm.tsx`, `components/domain/AttachmentPicker.tsx`.

---

## 0. El hallazgo, y viene del PDF

> La fila del 11 de abril salió sin concepto en el estado de cuenta.

No es un error de impresión: el campo donde vive "Canon M50" se llamaba **"Motivo (opcional)"** y
se preguntaba como una justificación administrativa. Es exactamente el texto que el PDF imprime
como concepto de cada fila — el dato que distingue un movimiento de otro y el que el cliente lee
para reconocer su deuda. Opcional, se quedó vacío.

---

## 1. Lo aplicado

### [x] A · "Por qué" deja de ser opcional (AF)
Pasa a ser obligatorio y su ayuda nombra los casos: **"Un producto, un préstamo, un servicio. Es
lo que {nombre} verá en su estado de cuenta."** Sigue siendo genérico —lo que aumenta la deuda
puede ser una venta o plata prestada— pero ya no puede quedar vacío.

### [x] B · Aumentar y reducir eran la misma hoja dos veces (AF)
Idénticas salvo el signo, la flecha, el color del título y la explicación del interruptor. Una
sola hoja, **"Ajustar monto"**, con un conmutador *Le debe más / Le debe menos*: lo mismo que se
hizo con el plan de pagos.

En "Editar obligación" eso deja **una sola fila "Ajustar monto"** donde había dos botones en
menta y en rojo, que prometían dos formularios que ya no existen y pintaban de color de dinero
una acción que todavía no tiene monto.

### [x] C · El interruptor nombraba una causa cuando lo que importa es el efecto (AF)
"Crea un gasto real porque estás prestando más dinero" es cierto cuando le prestas efectivo y
falso en las trece filas del PDF, que son cámaras y monitores. Y al revés: si compraste la cámara
para revendérsela, sí salió plata de tu cuenta. Lo que decide si hay movimiento es **si salió o
entró plata**, y eso es lo que se pregunta: *"Salió plata de tu cuenta"* / *"Entró plata a tu
cuenta"*.

### [x] D · Dos números distintos como "el monto", en hojas hermanas
"Registrar cobro" abría con *Pendiente S/ 21,020.00* y "Agregar monto" con *Principal actual
S/ 23,455.00*: dos cifras correctas de dos cosas distintas, con la misma tipografía en el mismo
lugar de la misma pantalla padre. Abiertas seguido, parece que una está mal. **Las dos hojas
hablan de lo que le debe hoy**; el total acumulado se queda en el desglose del detalle.

### [x] E · "Cuenta de abono" y "tu contabilidad" (AE)
Dos cápsulas bajo un rótulo, con la elegida en menta —el caso ya corregido en las revisiones 07 y
08—, y encima un interruptor que prometía "registra también un ingreso en tu contabilidad". La
fila dice **"Entra a · Cuenta Principal"** y el interruptor, **"Sumar a esa cuenta · Aparece como
ingreso en tus movimientos"**: la misma información, dicha desde lo que se verá después.

### [x] F · El "N° cuota" precargado (AE)
Venía con un **8** en una cuenta que registra seis pagos. Numerar cuotas exige que existan
cuotas, y aquí se paga 330, 580, 30, 350, 450 y 690. **El campo se retira**; al editar un evento
viejo su número se conserva, para no borrar lo que alguien escribió.

### [x] G · "Agregar" dos veces en el recuadro de comprobantes
Era la etiqueta pintada dos veces, no una decisión. Y la ayuda explicaba una condición del
sistema —"Si este evento crea un movimiento, el comprobante se copiara tambien…", con dos tildes
faltantes—. Queda una sola frase: **"Se guardan con el cobro, y con el ingreso si lo sumas a la
cuenta."**

### [x] H · La misma hoja espejada para una deuda
Cuando la obligación es por pagar, las etiquetas se dan vuelta sin cambiar la estructura:
"Cuánto te pagó" → "Cuánto le pagaste", "Entra a" → "Sale de", "Sumar a esa cuenta" → "Restar de
esa cuenta · Aparece como gasto en tus movimientos", "Le faltaba/faltará" → "Le debías/le
deberás". En AF, "Le debe más/menos" → "Le debo más/menos" y "Salió plata" → "Entró plata". **Un
solo componente con la dirección como parámetro.**

### [x] I · La tarjeta de Compartir en "Editar obligación"
La hoja está bien; lo que sobraba es la tarjeta del pie. Una cápsula en menta —el color de la
plata que entra— decía *"Ya compartido con Kevin Chaname Yafac"*: un estado con forma de botón. Y
debajo, dos acciones de texto en verde y en rojo con el mismo peso, aunque una cambia un correo y
la otra le quita el acceso a alguien.

El estado va **como fila** —"Compartido con · Kevin Chaname Yafac"—, tocarla es lo que abre el
cambio de correo, y **"Desvincular acceso" baja al final**, en texto, separada del resto, porque
es destructiva y no se toca por error. La invitación pendiente sigue el mismo patrón.

---

## 2. Lo que no cambió

- La lógica de guardado, el impacto en cuentas y la sincronización de comprobantes con el
  movimiento vinculado: la revisión es de lenguaje y de anatomía, no de reglas.
- `installmentNo` sigue existiendo en la base y se preserva al editar. Si algún día hay cuotas de
  verdad —hoy las hay: el plan a medida de la fase 14—, el número sale de ahí, no de un campo
  suelto que el usuario tenga que llevar de memoria.
