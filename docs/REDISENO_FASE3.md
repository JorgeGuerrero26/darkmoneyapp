# Plan de rediseño — DarkMoney (Revisión 03)

> Tercera tanda: **los ocho módulos de lista**. Las anteriores están cerradas en
> [`REDISENO.md`](REDISENO.md) (sistema visual) y [`REDISENO_FASE2.md`](REDISENO_FASE2.md)
> (dashboard).
>
> Vive en el repo a propósito: sobrevive a que se pierda o se compacte una conversación.

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 03 (28 ago 2026). Export en
`Descargas/Diseño de app móvil.zip`.

Las ocho pantallas salen de `ResourceModuleTemplate`, así que **casi nada se arregla pantalla
por pantalla**: se arregla una vez en la plantilla y se propaga.

---

## 0. Lo primero: esto corrige lo que se publicó el 27 de agosto

La cinta de tres columnas que se implementó ayer **se retira**. No es un cambio de opinión
gratuito: la propia Revisión 01 pedía "cinta de métricas, 2 o 3 columnas", y al aplicarla a los
ocho módulos quedó claro que **tres celdas del mismo tamaño obligan a inventar un tercer dato**.

Verificado en el código, no solo en la maqueta:

| Módulo | Las tres celdas | El problema |
|---|---|---|
| Créditos y deudas | `receivableTotal` · `payableTotal` · `netTotal` | Si no debes nada, `net` **es** `receivable`: la misma cifra dos veces, en dos colores |
| Categorías | `totalCount` · `activeCount` · `systemCount` | "27 · 27 · 0" son una sola frase: tienes 27 y todas están activas |
| Notificaciones | 6 items | Labels partidos: "SIN…", "LEÍ…", "INV…" |

---

## 1. Las cuatro reglas de la plantilla

### [ ] PLANTILLA 1 — La tira de tres cifras se vuelve una línea

**Una** cifra principal (34 px) y el resto como línea de apoyo en gris. **Si el módulo no tiene
una cifra que merezca 34 px, no lleva cifra** — solo la línea.

```
Te deben
S/ 24,133.30
No debes nada · 4 obligaciones activas, 1 compartida contigo
```

Sin cifra principal (Contactos, Categorías):

```
9 contactos · 4 con saldo abierto por S/ 24,133.30
```

### [ ] PLANTILLA 2 — Conteos en hueso, soles en color

"CONTACTOS 9", "MONEDAS 20", "CATEGORÍAS 27" venían en menta. **No son plata.** El menta se
reserva para dinero que entra y el clay para lo que sale o se salió de rango.

**El amarillo no se retira: se acota a una sola cosa** — ver la sección 3, ya resuelta.

### [ ] PLANTILLA 3 — Los filtros no se cortan a media palabra

"Incumpl…", "Cor…", "CHF" cortado por el borde. La fila sigue desplazándose, pero el recorte cae
**entre cápsulas** y un degradado avisa que hay más.

Cuando las opciones pasan de **seis** —20 monedas en Tipos de cambio— deja de ser filtro y se
vuelve **selector**: un control que abre lista.

### [ ] PLANTILLA 4 — Una etiqueta por fila y una sola acción

La categoría aparece dos veces (subtítulo "Persona" + cápsula "Persona") y hay hasta **tres
botones por fila** (fijar, pausar, gráfico) sobre 44 px. La fila entera es tocable con chevrón;
fijar y pausar pasan a **deslizar**, que ya se usa en Categorías. La lista termina con 140 px de
aire para que el botón flotante no tape la última.

---

## 2. Por pantalla

### [ ] F · Créditos y deudas
- Una cifra ("Te deben") + "No debes nada · 4 activas, 1 compartida".
- La tarjeta traía cuatro etiquetas y ningún dato nuevo: el título se repetía en las cuatro filas.
- Barra de progreso de 340 px → **56 px** junto al monto.
- Fuera el icono de gráfico por fila: abría analítica de UNA obligación desde la lista,
  compitiendo con el toque de la fila.

### [ ] G · Notificaciones
- "Leer todas" / "No leer" / "Eliminar leídas" salen del recuadro de cifras.
- Dos filas de filtros (severidad + tipo) se unifican.
- Cada fila: fuera las dos cápsulas y el icono en recuadro de color → **un punto de 6 px**
  (rojo si no leída, gris si leída).
- El texto perdía la fecha por truncado; sin los dos botones caben dos líneas completas.

### [ ] H · Contactos
- Sin cifra principal: "9 contactos · 4 con saldo abierto por S/ 24,133.30".
- **Agrupar**: quienes te deben primero, no orden alfabético. Hoy ChatGPT y Cine ocupan lo mismo
  que las cuatro personas que te deben S/ 24,133.30.
- Fuera la cápsula de tipo (el icono ya lo dice) y "Cobra" (ya está en el monto).

### [~] I · Suscripciones — PARCIAL
- El importe y la frecuencia aparecían dos veces en la misma tarjeta.
- ~~El amarillo marcaba "PAUSADAS 1", la cápsula "Pausada" y el icono~~ — **hecho**: pausado va
  en gris apagado, y el próximo cobro usa el umbral único.
- Fijado es un **atributo** (estrella) que ordena, no un grupo con encabezado propio.

### [ ] J · Categorías
- Sin cifra: "27 categorías, todas activas · 9 sin movimientos este año".
- Fuera el punto de color sobre el icono y la cápsula "Gasto" (el subtítulo ya lo dice).
- **Ordenar por uso**; las no usadas al final. Hoy Restaurantes con 0 sale antes que Transporte
  con 158.
- Fuera "Creada por ti" (cierto para las 27) y el conteo de suscripciones (cero en casi todas).

### [~] K · Tipos de cambio — PARCIAL
- ~~La tira en amarillo~~ — **hecho**: una tasa es dato neutro, va en hueso.
- Cifra principal: "1 USD en soles · 3.3516".
- 20 monedas en fila horizontal → **selector**.
- La tira mostraba "PEN/USD 3.352" redondeado mientras las filas decían 3.3516: tres números
  para un solo tipo de cambio.

### [ ] Ingresos recurrentes
- "Es la misma pantalla con el signo invertido, así que no se rediseña aparte": cifra principal
  en menta, porque ahí sí es dinero que entra.

---

## 3. El amarillo — RESUELTO el 28 ago 2026

La Revisión 03 volvió sobre el amarillo con un argumento más concreto que el de la víspera: en
estas pantallas marcaba **vencimiento, tasa de cambio y estado pausado a la vez**, o sea nada.

La precisión que lo salva: **el amarillo es advertencia de algo que todavía no pasó pero está
cerca.** Lo ya vencido es un hecho, no un aviso.

| Estado | Color | Ejemplo |
|---|---|---|
| Ya venció | clay | "Venció el 4 jun · marca el pago" |
| Vence en ≤ 7 días | **amarillo** | Lo único que urge |
| Vence más adelante | gris | "Vence 31 ene 2027" no advierte de nada |
| Pausado | gris apagado | Es un estado, no un aviso |
| Tasa de cambio | hueso | Dato neutro |

Sin la línea entre *vencido* y *por vencer*, amarillo y clay significarían los dos
"vencimiento" y volveríamos al problema.

**El umbral se define en UN solo sitio**: `lib/due-tone.ts` (`DUE_SOON_DAYS = 7`). Si cada
módulo decide cuándo pinta amarillo, en tres meses vuelve a significar tres cosas. Antes estaba
repartido —3 días en Suscripciones, 7 en Notificaciones, 30 en el dashboard— y el vencimiento
de una obligación iba **fijo en amarillo sin mirar la fecha**.

Hecho: `lib/due-tone.ts` con 8 tests, aplicado a obligaciones, suscripciones (próximo cobro y
estado pausado) y tipos de cambio.
