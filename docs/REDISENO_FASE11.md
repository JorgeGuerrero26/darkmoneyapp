# Plan de rediseño — DarkMoney (Revisión 11)

> Undécima tanda: **Nueva obligación**, y la funcionalidad nueva del plan de pagos a medida.
> Las anteriores están cerradas en [`REDISENO.md`](REDISENO.md) y las fases 2 a 9.

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 11 (30 ago 2026), mockups `X · NUEVA
OBLIGACIÓN`, `Y · MÁS DETALLES` y `Z · PLAN A MEDIDA`.

---

## 0. El problema de fondo

> Cuatro campos son obligatorios y hay dieciocho en pantalla. Los otros catorce dicen
> "(opcional)" en su propia etiqueta y están listados uno debajo del otro con el mismo peso
> visual que los obligatorios. Registrar que un amigo te debe S/ 200 exige atravesar tres
> pantallas de scroll.

La regla 4 de la plantilla ya lo resuelve: **los opcionales se agrupan en una fila que los nombra
y los abre**.

---

## 1. La pantalla X — el formulario

### [x] A · "Por cobrar" y "Por pagar" desde el lado equivocado
Son términos de contabilidad: describen la deuda, no la relación. Quien registra que le prestó
S/ 200 a un amigo piensa "me deben". Van **"Me deben"** y **"Yo debo"**.

### [x] B · El monto obligatorio estaba en gris de campo vacío
Va como el monto de Registrar movimiento: hueso, Archivo tabular y el símbolo de prefijo, con su
rótulo fuera en mayúscula espaciada. "Principal" sobra: no hay otro monto en el formulario.

### [x] C · El formulario preguntaba dos veces lo mismo
"Me prestaron dinero · Entra dinero al crear" es la misma respuesta que "Entra dinero a mi
cuenta" del bloque de abajo. Ahora la consecuencia se muestra como **una línea de confirmación**
bajo la elección, y el bloque de radios aparece **solo en Manual**, que es el único caso donde el
impacto no está determinado.

### [x] D · Las cápsulas repetían el texto que tenían encima
Fuera las tres cápsulas de impacto —"Entra dinero al crear", "Sin impacto en cuenta",
"Configurable"— y con ellas los tres emoji, que eran el único uso de emoji en toda la app.

### [x] E · Dos colores de selección en la misma pantalla
Todo lo elegido va en hueso. El verde es plata que entra, y aquí marcaba una deuda que sale.

### [x] F · Catorce campos opcionales, uno debajo del otro
Se agrupan en la fila **"Más detalles · Cuotas, tasa, vencimiento, notas"**.

### [x] G · Invitar por correo antes de que exista la obligación
Una tarjeta de 300 px con dos campos convertía el botón de guardar en un botón que además le
escribe a alguien, sin previsualización. Sale del formulario de creación; la barra dice
**"Podrás invitar a Juan cuando esté creada"**. Al editar sigue estando el bloque de compartir,
que actúa sobre algo que ya existe.

### [x] H · Detalles heredados
"FECHA DE INICIO" es **"Desde"**, y una fecha que por defecto es hoy no necesita rótulo de
sección. La moneda se dice en palabras y **solo cuando no es la del patrimonio**. Los asteriscos
se van: lo que falta lo nombra el botón.

---

## 2. La pantalla Y — Más detalles

Filas con el valor a la derecha, y **"(opcional)" no aparece ni una vez**: lo dice el subtítulo
de la fila que abre la hoja. Cada valor por defecto se dice con palabras —"Sin interés", "Sin
fecha", "Ninguna"— porque un campo vacío no aclara si es cero o si el sistema no lo sabe.

"Guardar detalles" **no crea la obligación**: guarda lo de esta hoja y vuelve al formulario.
Volver con el chevrón descarta solo lo de esta hoja.

---

## 3. La pantalla Z — el plan de pagos (nuevo)

### La cuota se calcula, no se escribe
Eran dos campos libres, "cuota" y "# cuotas", que admitían datos que se contradicen: seis cuotas
de S/ 50 sobre un monto de S/ 1.000. La cuota sale de dividir el monto y la fila muestra la
operación.

### Lo acordado se escribe; el resto se calcula
Un acuerdo real casi nunca lista todos los pagos: se pactan los primeros —los distintos— y
después "lo de siempre". Arriba, los pagos acordados uno por uno; abajo, un solo monto que se
repite hasta terminar el saldo. **Cuántos pagos son en total no se declara: se deduce.**

Las calculadas se ven pero no se editan ahí: van en gris sobre el fondo un paso más claro, y la
última se ajusta al saldo que queda —S/ 50, no 200—. Es el número que un plan a medida suele
calcular mal, así que va a la vista con su etiqueta.

### El pie cuadra la suma con el monto
Mientras los pagos no sumen el monto, el plan está incompleto: el pie lo dice con la diferencia
—"Faltan S/ 120.00 por programar"— y el botón queda apagado. Va al lado del botón porque es donde
el usuario mira antes de guardar.

---

## 4. Las dos decisiones que el diseño no podía zanjar

Preguntadas y respondidas el 30 de agosto:

- **Cuando alguien paga distinto a lo pactado, el plan queda fijo** y se muestra la diferencia.
  Es un acuerdo entre dos personas: cambiarlo solo es peor que enseñar que no se cumplió.
- **Las fechas son siempre mensuales**, con el día tomado de la fecha de inicio.

---

## 5. Dónde vive el plan

Columna `payment_plan` (jsonb) en `obligations`:

```json
{ "mode": "equal",  "count": 6 }
{ "mode": "custom", "agreed": [100, 150, 300], "tail": 200 }
```

Es un documento pequeño que siempre se lee entero, así que no gana nada en una tabla aparte:
así hereda las políticas RLS y no añade un viaje a la base. Las fechas no se guardan porque se
deducen. `features/obligations/lib/payment-plan.ts` hace el cálculo, con 16 casos de prueba
sobre la ruta del dinero.

`installment_amount` e `installment_count` **se conservan y se siguen escribiendo**: hay
obligaciones vivas que las usan, y el detalle y los reportes las leen. Salen del plan, no de dos
campos que el usuario pueda contradecir.

---

## 6. Lo que queda fuera

- **Invitar al terminar.** El formulario ya no invita, y la barra lo anuncia; el flujo de
  invitación al crear —la pantalla que ofrece invitar cuando la obligación ya existe— no está en
  ningún mockup todavía. Mientras tanto se invita desde Editar, que es donde ya vivía.
- **Comparar los pagos reales contra el plan.** El plan queda fijo por decisión, pero enseñar
  "pagó S/ 320 donde decía S/ 300" es una pantalla de detalle que esta revisión no dibuja.
