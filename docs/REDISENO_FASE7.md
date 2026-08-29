# Plan de rediseño — DarkMoney (Revisión 07)

> Séptima tanda: **Registrar movimiento** — el formulario de mayor uso de la app.
> Las anteriores están cerradas en [`REDISENO.md`](REDISENO.md) (sistema visual),
> [`REDISENO_FASE2.md`](REDISENO_FASE2.md) (dashboard), [`REDISENO_FASE3.md`](REDISENO_FASE3.md)
> (módulos de lista), [`REDISENO_FASE4.md`](REDISENO_FASE4.md) (pantallas de sistema) y
> [`REDISENO_FASE5.md`](REDISENO_FASE5.md) (formularios y Salud).

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 07 (29 ago 2026).

Archivos: `components/forms/MovementForm.tsx` (1.378 líneas) y sus tres pasos en
`features/movements/components/form/steps/`.

---

## 0. El hallazgo que ordena todo lo demás

> El paso 3 **no tiene un solo campo obligatorio**. Descripción, Categoría, Contraparte, Notas y
> Comprobantes: los cinco lo dicen en su propia etiqueta. Y aun así el paso 2 termina en
> "Siguiente →", que obliga a pasar por una pantalla entera de campos que nadie tiene que llenar
> antes de poder guardar.

Con el monto y la cuenta elegidos el movimiento **ya es válido**. Así que:

- El botón del paso de monto es **Guardar**.
- Los detalles pasan a ser **un destino al que se entra a propósito**, no un peaje.
- Tipo y estado son dos controles de una línea cada uno, no una pantalla: **suben al paso de
  monto**.

El formulario queda en **dos pasos**: `1 · Monto` y `2 · Detalles · opcional`.

Para el que solo anota un taxi, el formulario se acaba en el paso 1; para el que adjunta el
comprobante, sigue estando todo.

---

## 1. Los ocho puntos

### [x] A · Dos colores de selección en la misma pantalla
La cuenta origen elegida se marca con borde **naranja** y la destino con borde **azul**. Son el
mismo estado —"esto es lo que elegiste"— pintado de dos colores, y el azul no existe en el
sistema.

> Causa real: `components/domain/AccountPicker.tsx` usa `acc.color` —el color **de la cuenta**—
> como borde de selección. Como cada cuenta tiene el suyo, el estado "seleccionado" cambia de
> color según qué cuenta toques.

Estar seleccionado se ve igual en toda la app: **borde hueso y etiqueta en hueso**, sin color.
El color queda libre para decir de qué tipo es el movimiento.

### [x] B · En una transferencia nadie gana ni pierde
Las dos tarjetas de proyección pintan el saldo que baja en rojo y el que sube en verde. Es la
misma plata cambiándose de bolsillo: **el patrimonio no se mueve un centavo**. Pintarlo así dice
que la mitad de la operación fue una pérdida.

Los cuatro montos van **en hueso**, con el saldo anterior **tachado** al costado, y una línea al
pie que dice que el patrimonio no cambia. **El rojo se reserva para saldo negativo de verdad.**

### [x] C · "PEN 21.3" no es un monto en soles
Código ISO en vez del símbolo y el número sin los dos decimales. En el resto de la app el mismo
monto es **S/ 21.30**: símbolo, dos decimales, separador de miles y fuente tabular.

Y **"Cuenta Sueldo PEN" sobra**: la moneda de la cuenta solo importa cuando las dos no coinciden,
y ese caso ya tiene su propia línea.

### [x] D · De dónde salen 50, 20 y 300
"Frecuentes: 50 · 20 · 300" son tres números **sin procedencia declarada**, y ninguno es el monto
que estás escribiendo. Con el teclado numérico ya abierto, tocar "50" no es más rápido que
escribirlo. **Se retiran.**

### [x] E · "Confirmado" en verde dice ingreso
El estado se pinta en menta y el tipo en clay, a diez píxeles de distancia. Menta significa plata
que entra: un gasto confirmado se ve por un instante como un ingreso. **Estado no es plata**: va
como **control segmentado**, con lo elegido en hueso sobre fondo oscuro.

### [x] F · Tres señales para un solo estado
La tarjeta "Gasto" elegida lleva borde clay, ícono clay, etiqueta clay **y un punto clay debajo**.
Cuatro marcas para decir una cosa. Queda el borde y el peso de la etiqueta; **el punto se va**.

### [x] G · El botón Guardar solo aparece si haces scroll
Es la regla 3 de la plantilla —barra fija al pie— sin aplicar. Además el indicador de pasos
desaparece en el último paso, justo donde más falta hace saber cuánto queda. **La barra queda
anclada y el indicador se mantiene en los dos pasos.**

### [x] H · Detalles de redacción
- "Descripcion y categoria" → con tildes. Y el título miente: la pantalla tiene seis campos.
- "Se guardaran junto con el movimiento" y "Camara o galeria" → con tildes.
- "0/5" se lee como fracción de progreso cuando es un **cupo**: va **"0 de 5"**.
- **"(opcional)" aparece en cuatro campos con dos formatos distintos**. Si el paso entero es
  opcional, se dice una vez en el indicador de pasos y se retira de cada campo.

---

## 2. Textos exactos del mockup

Paso 1 (gasto): `Monto` · `Cuenta` · `Saldo después` · `Estado` · botón **Guardar** ·
enlace **"Añadir categoría, nota o comprobante"**.

Paso 1 (transferencia): `Sale de` · `Entra a` · `Saldos después` · la línea
*"Las dos cuentas son en soles: se transfiere el mismo monto. Tu patrimonio no cambia."* ·
enlace **"Añadir nota o comprobante"** (sin categoría: una transferencia no la lleva).

Paso 2: `Descripción — se genera sola si la dejas vacía` · `Categoría` · `Contraparte` ·
`Fecha y hora` · `Notas / Para lo que no cabe en la descripción` · `Comprobantes 0 de 5` ·
*"Cámara o galería. Se guardan junto al movimiento cuando termines de crearlo."* ·
botones **Atrás** y **Guardar**.

---

## 3. Riesgos conocidos

- `MovementFormStep` es `1 | 2 | 3` y se usa en la validación por paso y en el scroll-to-error.
  Pasar a dos pasos toca `validateStep1/2/3`, `handleNext`, `handleBack` y el `setStep(2)` de
  edición.
- `AccountPicker` lo usan también otros formularios: comprobar antes de cambiar el color de
  selección.
- Guardar desde el paso 1 debe correr **toda** la validación, no solo la del paso visible.

---

## 4. Cerrado (29 ago)

Los ocho puntos aplicados y publicados por OTA en los tres runtimes.

### Un bug que introdujo el propio cambio
Editar y duplicar hacían `setStep(2)` porque el 2 **era** el paso de monto. Al pasar a dos pasos
ese número es el de detalles, así que abrían en la pantalla equivocada. Corregido a `setStep(1)`.

### Componentes retirados
`StepTypeAndStatus` (sus dos controles viven ahora en el paso de monto) y
`features/movements/lib/frequent-amounts.ts` con su test, al retirarse los montos frecuentes.

### Lo que NO cambió, y por qué
El indicador de pasos sigue oculto al **editar**: editar un movimiento no es un flujo de dos
pasos con progreso, es una hoja con los mismos campos. La crítica era que el indicador
desaparecía en el último paso de la creación, y eso sí está resuelto.

---

## 5. Segunda pasada — el paso de detalles (29 ago)

La primera pasada aplicó los ocho puntos escritos, pero dejó el paso 2 con su maquetación vieja:
el mockup lo dibuja distinto y eso no estaba en la lista numerada.

- Descripción **sin etiqueta encima**: el placeholder lleva la frase entera.
- Categoría, Contraparte y Fecha y hora en **un grupo de tres filas** con el valor a la derecha.
  Eran dos scrollers horizontales de cápsulas —cada uno con su buscador— y dos selectores de
  fecha sueltos lado a lado.
- **Notas** pasa de etiqueta de campo a rótulo de sección.
- **Comprobantes**: rótulo + cupo a la derecha. Había insignia dorada, ante-título, título, ayuda
  y cápsula: cinco elementos donde el diseño pide dos.
- El indicador dice `2 · Detalles · opcional` desde el paso 1 —que es cuando esa palabra decide
  si entras— y `2 · Detalles` una vez dentro, como en los dos mockups.

`FormOptionRow` gana `grouped`/`last`: tres filas con borde propio dibujan tres cajas, y el
mockup pide una con líneas finas.

**Lo que no está en el mockup y se conserva:** los bloques de sugerencia (categoría, contraparte,
recurrente, cuenta) y los avisos de riesgo y presupuesto. Solo aparecen cuando hay algo que
sugerir, así que el diseñador no los vio. Van después del grupo, no entre sus filas.

---

## 6. Tercera pasada — el paso de monto (29 ago)

Mismo caso que la segunda pasada: los ocho puntos escritos se aplicaron, pero el mockup dibuja
el paso 1 con una maquetación que no estaba en la lista numerada.

### Lo que pide el mockup

- **Las cuentas son filas, no cápsulas.** `Sale de` y `Entra a` van en un grupo de dos filas con
  el nombre de la cuenta a la derecha y el chevron, igual que `Categoría` y `Contraparte` en el
  paso 2. Hoy son dos scrollers horizontales de cápsulas: si tienes seis cuentas, las últimas se
  cortan por el borde y no hay forma de saber que están ahí.
- **El enlace de detalles va DEBAJO del botón Guardar.** Hoy está al final del scroll, encima de
  la barra fija, así que el orden de lectura es "detalles primero, guardar después" — justo al
  revés de lo que el paso decide: guardar es lo normal, entrar a detalles es la excepción.
- **`Saldos después` es una sola tarjeta.** Las dos cuentas y la línea *"Tu patrimonio no
  cambia"* viven dentro de la misma caja. Hoy son dos tarjetas con borde y un tercer recuadro
  aparte para la frase: tres cajas para una sola idea.

### Cómo se resuelve

`AccountPicker` **no se toca**: lo usan también Detección automática y la tarjeta de movimiento
detectado, que no están en esta revisión. El formulario pasa a `FormOptionRow` + la lista
buscable, que es la pieza que ya usan categoría y contraparte.

Los dos selectores de cuenta van `inline` por la prop `overlay` del sheet: **iOS presenta un
Modal a la vez**, y un selector hermano del formulario no llega a aparecer (fallo del
2026-08-13).

`BalanceImpactPreview` gana `grouped`, igual que `FormOptionRow`: sin caja propia, para que el
grupo dibuje una sola. El aviso de saldo negativo conserva su fondo rojo — es lo único de esa
tarjeta que sí es una alarma.

### Lo que NO se copia del mockup

El mockup dibuja los saldos **sin el símbolo de la moneda** (`4,205.62`). El punto C de esta
misma revisión pide lo contrario —`S/ 21.30`, con símbolo y dos decimales, como en el resto de
la app— y esa regla se aplicó hace dos días. Se mantiene el símbolo.
