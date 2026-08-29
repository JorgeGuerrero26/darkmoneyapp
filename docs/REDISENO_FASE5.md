# Plan de rediseño — DarkMoney (Revisiones 05 y 06)

> Quinta y sexta tanda: **los siete formularios de creación** y **la pestaña Salud**.
> Las anteriores están cerradas en [`REDISENO.md`](REDISENO.md) (sistema visual),
> [`REDISENO_FASE2.md`](REDISENO_FASE2.md) (dashboard), [`REDISENO_FASE3.md`](REDISENO_FASE3.md)
> (módulos de lista) y [`REDISENO_FASE4.md`](REDISENO_FASE4.md) (pantallas de sistema).

Fuente: `DarkMoney - Rediseño.dc.html`, Revisiones 05 y 06 (28 ago 2026).

---

## 0. Dos piezas que ya existen y nadie usa

Antes de escribir nada nuevo, dos componentes están en el repo **sin un solo consumidor**:

| Componente | Qué hace | Sirve para |
|---|---|---|
| `components/ui/FormSheetScaffold.tsx` | Sheet + banner de error + botón de envío | Regla 4 (barra fija que dice qué falta) |
| `components/ui/SearchableSelectSheet.tsx` | Lista con búsqueda dentro de un sheet | Regla 2 (pasadas seis opciones, selector) |

Los siete formularios montan su `BottomSheet` y su `Button` a mano. **Adoptarlos es la mitad
del trabajo**: la regla se arregla una vez y se propaga, como en la Revisión 03 con
`ResourceModuleTemplate`.

---

## 1. Las cuatro reglas transversales

### [x] FORMULARIO · 1 — Lo obligatorio primero
Nueva categoría abre con 29 íconos y 10 colores: 400 px de decoración antes del campo NOMBRE,
que es el único con asterisco. Nueva cuenta hace lo mismo. El formulario empieza por lo que no
se puede omitir y **la apariencia baja a una fila** que muestra la elección actual.

### [x] FORMULARIO · 2 — Pasadas seis opciones, selector
Tercera vez que aparece la regla. Aplica a **proveedor, contacto, categoría, cuenta y moneda**.
27 cápsulas de categoría padre en cuadrícula, 20 de moneda, nombres cortados por el borde.

### [x] FORMULARIO · 3 — La paleta no es del sistema
Doce círculos saturados —violeta, rosa, azul eléctrico, naranja— que no existen en ninguna otra
pantalla. Bajan a **seis tonos derivados del sistema**: son etiquetas para reconocer de un
vistazo, no decoración libre. El violeta de las tarjetas de fecha se retira.

> Nota al implementar: el violeta **sí existe** en el sistema (`COLORS.pro`), pero está
> reservado a la IA. Usarlo como color de categoría lo vacía de significado, que es
> exactamente lo que dice la crítica.

### [x] FORMULARIO · 4 — El botón dice qué falta
"Crear suscripción" vive al final de 2.400 px: para saber si ya puedes guardar hay que volver a
subir. Pasa a **barra fija con el estado al lado**; mientras falte algo, lo nombra. Y el monto
deja de ser un `0.00` gris dentro de una caja gris, que se lee como deshabilitado.

---

## 2. O · Nueva suscripción — el caso más largo (~2.400 px)

### [x] De tres fechas a una
Inicio, Próximo cobro y Fin, cada una en una tarjeta de 190 px con su párrafo — y el propio
texto admite que Inicio "no mueve por sí sola el próximo cobro". Queda **el próximo cobro**;
inicio y fin bajan a Opcionales. Ahorra 570 px.

### [x] "Repetir cada N periodos" es dos preguntas
Frecuencia con seis cápsulas + Personalizado + campo numérico + la línea "Cadencia resultante".
Tres controles para responder cada cuánto se cobra. Queda **un selector que dice "Cada mes"**;
si eliges algo a medida, el número se pide ahí.

### [x] El monto se ve editable
`PEN 0.00` en gris medio sobre caja gris parece bloqueado. El número va **en hueso con cursor
visible**, y el prefijo es el símbolo —S/— no el código ISO.

### [x] Ocho campos opcionales no son ocho campos
Proveedor, moneda, cuenta de débito, categoría, descripción y notas suman 700 px marcados
"(opcional)". Se agrupan en **una fila que los nombra y los abre**.

### [x] Los textos didácticos — DECISIÓN TOMADA (28 ago)
~900 px de prosa. Se aplica la propuesta: la explicación aparece **una vez, la primera vez que
abres el formulario**, y después vive **detrás del "?" del encabezado**. Se queda fija solo la
frase que desambigua el campo obligatorio: qué significa "próximo cobro". **"Así lo hará el
sistema" se retira** — es un eco: si el formulario está bien redactado, no necesita resumirse.

---

## 3. P · Nueva categoría — el más decorativo

### [x] "ORDEN (SORT_ORDER)" no es lenguaje de usuario
Pide un número —280— y lo explica con "el servidor usa max(sort_order)+10". Es el nombre de la
columna y la lógica del backend puestos en la pantalla. **Sale**: el orden se resuelve solo al
crear y se cambia arrastrando en la lista.

### [x] Veintinueve íconos y diez colores antes del nombre
Apariencia se vuelve **una fila con la muestra de lo elegido**. Elegir sigue siendo posible;
solo deja de ser lo primero. La nota "(Lucide, como en la web)" está escrita para quien
programa.

### [x] Veintisiete cápsulas para la categoría padre
Selector con búsqueda. Y **"Ambos / Gasto / Ingreso" pasa a segmentado**: tres opciones
excluyentes y cortas, exactamente el caso del control.

---

## 4. Los otros cinco formularios

### [x] Nuevo contacto
Es el que está mejor. Solo necesita que **los seis tipos dejen de ser cápsulas con emoji
cortadas**.

### [x] Nueva obligación — YA ESTABA HECHO
Las tres tarjetas "¿Cómo nació esta deuda?" y los tres radios de "Impacto inicial en cuenta"
"preguntan lo mismo dos veces", dice la revisión. En el código **ya no**: `getAutoOpeningImpact`
deriva el impacto de `cash_loan`, `sale_financed` y `purchase_financed`, y el bloque de radios
está envuelto en `{originType === "manual" ? ...}`. En Manual el origen no determina el impacto
—ese es el sentido de Manual—, así que ahí no hay duplicación que quitar.

Igual que el hallazgo que abría la Revisión 04, el diseñador miraba un build anterior.

### [x] Nueva cuenta
Hereda el arreglo de apariencia (28 íconos y 12 colores).

### [x] Nuevo presupuesto
Los mismos selectores.

### [x] Nuevo tipo de cambio
Los mismos selectores, y además **"1 [origen] = tasa [destino]" con corchetes es una plantilla
sin rellenar**.

---

## 5. Q · Salud (Revisión 06) — ~5.000 px de desplazamiento

### [x] Cuatro porcentajes de confianza, ninguno es "la" confianza
86% (tres veces con tres nombres), 68%, 78% y 74%. **Queda uno**: la precisión del dato, 86%,
con el umbral por debajo del cual las proyecciones no se sostienen. El 68% de la banda
pertenece a Flujo.

### [x] La fórmula del cierre está en la pestaña equivocada
Saldo visible, Agenda comprometida, Ritmo variable y Resultado esperado son el puente de cierre
**de Flujo**, repetido aquí. **Sale de Salud**: dos pestañas no deben responder la misma
pregunta.

### [x] El dato más grave estaba enterrado
"409 movimientos sin contraparte" era la segunda viñeta de una tarjeta, sin tocar nada. Sube a
**primera fila de "Por revisar"**. Y "Sin categoría pesa 45%" pasa a ser **el subtítulo del 91**:
el número y su consecuencia juntos.

### [x] Los dos bloques que miden el producto — DECISIÓN TOMADA (28 ago)
Resuelto **(c) + (b)**: en Salud queda solo la línea accionable —la precisión sube a 96% al
resolver los pendientes— y el relato del aprendizaje **se muda a Configuración → Acerca de**.
"Madurez del análisis" y "Aprendiendo de ti" suman ~1.400 px y no hay nada que el usuario pueda
hacer con ellos: la Fase 4 no sube porque él haga algo.

### [x] El patrón semanal aparece dos veces
"sábado concentra 38% del gasto" está en dos sitios con distinta redacción, y es un patrón: su
pestaña es **Patrones**. Igual "Taxi aparece 66 veces".

### [x] Detalles de redacción
"300 correcciónes tuya" lleva tilde de más y falta concordancia. Los chips "Activos", "Media" y
"Visible" no dicen nada verificable. "QUE CONVIENE LIMPIAR O REFORZAR" → "Qué conviene limpiar".

---

## 6. Orden de ejecución

1. Piezas compartidas: adoptar `FormSheetScaffold` con la barra de estado, y `FormOptionRow`
   (la fila que muestra la elección y abre un sheet).
2. Categoría y Cuenta — apariencia, `sort_order`, segmentado.
3. Suscripción — el más largo.
4. Obligación — el bloque derivado.
5. Contacto, Presupuesto, Tipo de cambio.
6. Salud.

---

## 7. Estado al cerrar la pasada de formularios (29 ago)

Hecho y publicado: las cuatro reglas transversales, categoría, cuenta, suscripción, contacto,
tipo de cambio y presupuesto. La moneda quedó unificada en los seis formularios que la piden.

### [x] Listas de entidades en dos formularios
Quedan como cápsulas que se desplazan y deberían ser selector, por la misma regla 2:

- **Nueva obligación**: contacto, cuenta de liquidación y cuenta de apertura.
- **Nuevo ingreso fijo**: pagador, cuenta destino, categoría, día del mes (31 opciones) y día de
  la semana. No es uno de los siete de la revisión, pero comparte las mismas fallas.

Hechos el 29 ago. Iban por número de línea con aserción en los dos extremos, comprobando que
el rango contuviera cápsulas antes de tocarlo — el detector automático de límites falló dos
veces antes.

### [x] Revisión 06 (Salud)
Hecha el 29 ago. Ver sección 5.

---

## 8. Cerrado (29 ago)

Revisiones 05 y 06 completas y publicadas por OTA en los tres runtimes.

Dos cosas que NO se hicieron, a propósito:

- **La frase del mockup «el orden se cambia arrastrando las filas en Categorías».** Esa lista no
  tiene reordenamiento por arrastre. Prometer un gesto que no existe es peor que no decir nada.
- **El bloque derivado de Nueva obligación**, porque ya estaba hecho (ver sección 4).

Componentes retirados por quedarse sin usuarios: `IconPicker`, `ColorPicker`, `CurrencyPicker`
(cuentas), `LearningPanel`, `ProjectionFormulaBreakdown`, `ActivityTimeline`, `DataQuality`.
