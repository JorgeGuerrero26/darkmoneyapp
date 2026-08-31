# Plan de rediseño — DarkMoney (Revisión 17)

> Decimoséptima tanda: **el detalle de un movimiento**. Leído sobre un chicle de S/ 1.50.

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 17 (31 ago 2026), mockup `AH`.
Archivos: `app/movement/[id].tsx`, `features/movements/components/detail/*`,
`components/ui/AmountDisplay.tsx`.

---

## 0. Siete tarjetas para seis datos

> El movimiento es un chicle de S/ 1.50 con seis datos: descripción, fecha, categoría, cuenta,
> estado y cuándo se creó. Ocupaba **dos pantallas de scroll y siete tarjetas**, dos de las
> cuales existían solo para decir que estaban vacías.

Cada tarjeta cuesta un rótulo en mayúsculas, un borde, un fondo y 16 px de aire arriba y abajo.
Para seis filas de texto, eso es más envoltorio que contenido. Los datos van en **una sola lista
sobre el lienzo**, con el monto arriba: todo entra en una pantalla sin scroll.

---

## 1. Lo aplicado

### [x] A · Tres maneras de editar lo mismo
"Toca para editar" bajo el monto, el botón "Editar" de Acciones rápidas, y las filas, que también
abrían la edición. **Queda una**: cada fila abre su propio campo, que es lo que uno quiere cuando
entra a corregir la categoría. (El botón "Editar" sigue al pie, como acción de la pantalla.)

### [x] B · "Anular" con el mismo peso que "Duplicar"
Tres botones que medían lo mismo, a la misma altura y en la misma fila. **Solo uno de los tres no
se puede deshacer con otro toque**, y estaba a un centímetro de los otros dos. Editar es la
principal y va en hueso; Duplicar, en contorno; **Anular baja al final, en texto, separada**. El
rojo tampoco hace falta: la posición y el peso ya dicen que es distinta, y el rojo en esta app
significa saldo negativo.

### [x] C · "Confirmado" en menta, otra vez
Cuarta aparición del mismo caso tras las revisiones 07, 08 y 16: un estado pintado con el color
de la plata que entra, a treinta píxeles de un monto en clay que dice gasto. El estado va en gris
y **en la misma línea que "Gasto"**, porque son dos rótulos del mismo movimiento y ninguno es una
cifra. El color en esta pantalla lo lleva el monto, y nada más.

### [x] D · El monto partido en tres tamaños
"− S/ 1.50" usaba cuatro tamaños distintos en cinco caracteres. Achicar los céntimos es un
recurso de precios de tienda, y aquí hacía que S/ 1.50 se leyera como S/ 1. La cifra va completa
**en un solo tamaño**, con el símbolo y el signo en gris a un cuerpo menor.

Es una variante nueva de `AmountDisplay` (`flat`), no un cambio global: la jerarquía de tres
escalas está pensada para una columna de cifras que se comparan de un vistazo, y ahí sigue.

### [x] E · Dos tarjetas para decir que no hay nada
"COMPROBANTES · Sin adjuntos · Este movimiento no tiene comprobantes visibles todavía" decía lo
mismo tres veces en 90 px —y "todavía" insinuaba que aparecerían solos—. Al lado, "+ Asociar a
crédito / deuda", un recuadro punteado de otros 80 px con la acción en menta. **Las dos pasan a
filas**: "Comprobante · Agregar" y "Parte de un crédito · No". Ocupan 58 px cada una en vez de
170, y siguen abriendo lo mismo. Cuando sí hay comprobantes, la galería se despliega bajo su
fila.

### [x] F · "CUENTA / Desde: Cuenta Principal"
Un rótulo de sección, una etiqueta de fila y un valor: tres niveles de jerarquía para un dato. Y
"Desde" es vocabulario de transferencia; en un gasto de una sola cuenta no hay desde ni hacia.
Queda **"Cuenta · Cuenta Principal"**, una fila como las demás. En una transferencia sí hay dos,
y se llaman "Sale de" y "Entra a".

Como el saldo resultante es lo que uno mira después de un gasto, aparece bajo el monto:
**"Cuenta Principal · queda S/ 33.64"**.

### [x] G · "Adrian Guerrero", "por Sistema", "ID: 1078"
Tres datos que no son del movimiento. El nombre bajo el título es el dueño de la cuenta —el único
usuario que ve esta pantalla—, así que no distingue nada. "por Sistema" es falso: el chicle lo
registró él. Y "ID: 1078" es la clave de la base de datos, centrada al pie. Queda una línea gris:
**"Lo creaste hoy a las 12:21."**

### [x] H · Redacción
"Categoria", "Alimentacion", "credito" y "ACCIONES RAPIDAS" iban sin tilde. Y "31 de agosto 2026"
—sin el "de"— era, siendo hoy, la fecha que menos falta hace escribir completa: **"Hoy, 12:21"**,
que además trae la hora, que hasta ahora solo aparecía en Historial.

---

## 2. Lo que no cambió

- Anular, duplicar, vincular a una obligación y la galería de comprobantes funcionan igual: la
  revisión es de anatomía y de lenguaje.
- Un movimiento anulado no ofrece acciones ni filas que abran el formulario, como antes.
