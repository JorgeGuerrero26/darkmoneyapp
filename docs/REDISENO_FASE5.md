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

### [ ] FORMULARIO · 1 — Lo obligatorio primero
Nueva categoría abre con 29 íconos y 10 colores: 400 px de decoración antes del campo NOMBRE,
que es el único con asterisco. Nueva cuenta hace lo mismo. El formulario empieza por lo que no
se puede omitir y **la apariencia baja a una fila** que muestra la elección actual.

### [ ] FORMULARIO · 2 — Pasadas seis opciones, selector
Tercera vez que aparece la regla. Aplica a **proveedor, contacto, categoría, cuenta y moneda**.
27 cápsulas de categoría padre en cuadrícula, 20 de moneda, nombres cortados por el borde.

### [ ] FORMULARIO · 3 — La paleta no es del sistema
Doce círculos saturados —violeta, rosa, azul eléctrico, naranja— que no existen en ninguna otra
pantalla. Bajan a **seis tonos derivados del sistema**: son etiquetas para reconocer de un
vistazo, no decoración libre. El violeta de las tarjetas de fecha se retira.

> Nota al implementar: el violeta **sí existe** en el sistema (`COLORS.pro`), pero está
> reservado a la IA. Usarlo como color de categoría lo vacía de significado, que es
> exactamente lo que dice la crítica.

### [ ] FORMULARIO · 4 — El botón dice qué falta
"Crear suscripción" vive al final de 2.400 px: para saber si ya puedes guardar hay que volver a
subir. Pasa a **barra fija con el estado al lado**; mientras falte algo, lo nombra. Y el monto
deja de ser un `0.00` gris dentro de una caja gris, que se lee como deshabilitado.

---

## 2. O · Nueva suscripción — el caso más largo (~2.400 px)

### [ ] De tres fechas a una
Inicio, Próximo cobro y Fin, cada una en una tarjeta de 190 px con su párrafo — y el propio
texto admite que Inicio "no mueve por sí sola el próximo cobro". Queda **el próximo cobro**;
inicio y fin bajan a Opcionales. Ahorra 570 px.

### [ ] "Repetir cada N periodos" es dos preguntas
Frecuencia con seis cápsulas + Personalizado + campo numérico + la línea "Cadencia resultante".
Tres controles para responder cada cuánto se cobra. Queda **un selector que dice "Cada mes"**;
si eliges algo a medida, el número se pide ahí.

### [ ] El monto se ve editable
`PEN 0.00` en gris medio sobre caja gris parece bloqueado. El número va **en hueso con cursor
visible**, y el prefijo es el símbolo —S/— no el código ISO.

### [ ] Ocho campos opcionales no son ocho campos
Proveedor, moneda, cuenta de débito, categoría, descripción y notas suman 700 px marcados
"(opcional)". Se agrupan en **una fila que los nombra y los abre**.

### [ ] Los textos didácticos — DECISIÓN TOMADA (28 ago)
~900 px de prosa. Se aplica la propuesta: la explicación aparece **una vez, la primera vez que
abres el formulario**, y después vive **detrás del "?" del encabezado**. Se queda fija solo la
frase que desambigua el campo obligatorio: qué significa "próximo cobro". **"Así lo hará el
sistema" se retira** — es un eco: si el formulario está bien redactado, no necesita resumirse.

---

## 3. P · Nueva categoría — el más decorativo

### [ ] "ORDEN (SORT_ORDER)" no es lenguaje de usuario
Pide un número —280— y lo explica con "el servidor usa max(sort_order)+10". Es el nombre de la
columna y la lógica del backend puestos en la pantalla. **Sale**: el orden se resuelve solo al
crear y se cambia arrastrando en la lista.

### [ ] Veintinueve íconos y diez colores antes del nombre
Apariencia se vuelve **una fila con la muestra de lo elegido**. Elegir sigue siendo posible;
solo deja de ser lo primero. La nota "(Lucide, como en la web)" está escrita para quien
programa.

### [ ] Veintisiete cápsulas para la categoría padre
Selector con búsqueda. Y **"Ambos / Gasto / Ingreso" pasa a segmentado**: tres opciones
excluyentes y cortas, exactamente el caso del control.

---

## 4. Los otros cinco formularios

### [ ] Nuevo contacto
Es el que está mejor. Solo necesita que **los seis tipos dejen de ser cápsulas con emoji
cortadas**.

### [ ] Nueva obligación — el caso propio que sí vale la pena
Las tres tarjetas "¿Cómo nació esta deuda?" y los tres radios de "Impacto inicial en cuenta"
**preguntan lo mismo dos veces**: elegir "Me prestaron dinero" ya implica que entra dinero. El
segundo bloque **se deriva del primero** y aparece **solo en Manual**.

### [ ] Nueva cuenta
Hereda el arreglo de apariencia (28 íconos y 12 colores).

### [ ] Nuevo presupuesto
Los mismos selectores.

### [ ] Nuevo tipo de cambio
Los mismos selectores, y además **"1 [origen] = tasa [destino]" con corchetes es una plantilla
sin rellenar**.

---

## 5. Q · Salud (Revisión 06) — ~5.000 px de desplazamiento

### [ ] Cuatro porcentajes de confianza, ninguno es "la" confianza
86% (tres veces con tres nombres), 68%, 78% y 74%. **Queda uno**: la precisión del dato, 86%,
con el umbral por debajo del cual las proyecciones no se sostienen. El 68% de la banda
pertenece a Flujo.

### [ ] La fórmula del cierre está en la pestaña equivocada
Saldo visible, Agenda comprometida, Ritmo variable y Resultado esperado son el puente de cierre
**de Flujo**, repetido aquí. **Sale de Salud**: dos pestañas no deben responder la misma
pregunta.

### [ ] El dato más grave estaba enterrado
"409 movimientos sin contraparte" era la segunda viñeta de una tarjeta, sin tocar nada. Sube a
**primera fila de "Por revisar"**. Y "Sin categoría pesa 45%" pasa a ser **el subtítulo del 91**:
el número y su consecuencia juntos.

### [ ] Los dos bloques que miden el producto — DECISIÓN TOMADA (28 ago)
Resuelto **(c) + (b)**: en Salud queda solo la línea accionable —la precisión sube a 96% al
resolver los pendientes— y el relato del aprendizaje **se muda a Configuración → Acerca de**.
"Madurez del análisis" y "Aprendiendo de ti" suman ~1.400 px y no hay nada que el usuario pueda
hacer con ellos: la Fase 4 no sube porque él haga algo.

### [ ] El patrón semanal aparece dos veces
"sábado concentra 38% del gasto" está en dos sitios con distinta redacción, y es un patrón: su
pestaña es **Patrones**. Igual "Taxi aparece 66 veces".

### [ ] Detalles de redacción
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
