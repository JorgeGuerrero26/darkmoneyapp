# Plan de rediseño — DarkMoney (Revisión 09)

> Novena tanda: **las sugerencias de IA en el formulario de movimiento**. Las anteriores están
> cerradas en [`REDISENO.md`](REDISENO.md), [`REDISENO_FASE2.md`](REDISENO_FASE2.md),
> [`REDISENO_FASE3.md`](REDISENO_FASE3.md), [`REDISENO_FASE4.md`](REDISENO_FASE4.md),
> [`REDISENO_FASE5.md`](REDISENO_FASE5.md), [`REDISENO_FASE7.md`](REDISENO_FASE7.md) y
> [`REDISENO_FASE8.md`](REDISENO_FASE8.md).

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 09 (29 ago 2026), mockup `V · PASO 2 CON
SUGERENCIAS`.

---

## 0. El problema de fondo

> Cinco bloques de IA en un paso de siete campos, y tres no dicen nada. "Revisando antes de
> guardar", "Buscando contraparte" y "Detectando recurrencia" anuncian que el sistema está
> pensando: ocupan 240 px, aparecen antes de que exista un resultado y, cuando no encuentran
> nada, se convierten en dos líneas grises. El usuario termina leyendo cuatro veces que la IA no
> tuvo nada que decirle.

**Una sugerencia se muestra cuando existe.** Mientras se calcula no se anuncia, y si no hay
resultado no se ocupa espacio en decirlo.

---

## 1. Los siete puntos

### [x] A · Anunciar que estás pensando no es información
Fuera las tres tarjetas de proceso y los dos estados vacíos. `SmartSuggestionLoading` y
`SmartSuggestionEmpty` se retiran del sistema: no hay dónde volver a usarlos sin repetir el
problema. Los avisos que sí son información —riesgo y presupuesto— se quedan, pero sin su
tarjeta de "estoy revisando".

### [x] B · El borde arcoíris
El degradado verde-azul-rosa era el único lugar de la app donde DarkMoney se parece a cualquier
otra app con IA. **La marca de sugerencia es el destello en gris.** Lo que distingue una
sugerencia no es el color: es que trae un botón para aceptarla.

### [x] C · La sugerencia va pegada a la fila que cambia
Estaba al fondo de la pantalla, separada de "Categoría" por otro control, y al aplicarla
cambiaba una fila 120 px más arriba, fuera de la vista. Ahora vive **dentro de la misma
tarjeta, inmediatamente debajo de su fila**, con el fondo un paso más claro para que se lea
como una propuesta y no como un valor ya puesto. La fila de arriba cede su línea divisoria: la
sugerencia trae la suya.

La de recurrencia es la excepción, y va suelta: no cambia ninguna fila, propone crear una
suscripción o un ingreso fijo.

### [x] D · 78 % y 68 % sin nada con qué compararlos
Mismo problema que se cerró en Salud. Si el sistema solo propone por encima de su propio corte,
el número no cambia ninguna decisión. **Fuera el porcentaje**; queda la razón en palabras.

### [x] E · La justificación se corta
Cuatro datos encadenados con punto medio en una línea que no alcanza, y dos de ellos explicando
lo mismo. Queda **una sola razón, la más fuerte** (`lib/suggestion-reason.ts`: las listas ya
vienen ordenadas). La de la corrección aprendida pasa a decir **"Porque corregiste esto antes"**,
que es verificable y le dice al usuario que su corrección sirvió de algo.

### [x] F · Menta en "Aplicar" y en una acción que no es IA
"Aplicar" en menta pasa a **"Usar"** con contorno hueso: la palabra más corta, y no compite con
Guardar, que es el único botón lleno de la pantalla. Y "Dividir en varias categorías" —que no es
una sugerencia ni tiene que ver con la IA— deja la menta y su ícono verde para ser una fila más
de la tarjeta: **"Repartir entre varias categorías"**.

### [x] G · El teclado tapa el campo que se está escribiendo
Dos causas. La barra de acción colgaba del borde de la pantalla, así que el teclado la tapaba:
resuelto en [`REDISENO_FASE8.md § 4`](REDISENO_FASE8.md) al meterla dentro del sheet. Y el
desplazamiento se quedaba donde estaba cuando la hoja se encogía: enfocar las notas las dejaba
justo debajo del corte. Ahora el campo de notas se lleva arriba al enfocarlo.

---

## 2. Alcance

`SmartSuggestion` es compartida, así que el cambio alcanza también a la tarjeta de movimiento
detectado (`QuickDetectedMovementEntry`), que tenía las mismas tres tarjetas de proceso, los
mismos porcentajes y el mismo "Aplicar" en menta.

---

## 3. Lo primero que se ve al abrir la app (30 ago)

Reportado con una captura del arranque en frío: debajo del nombre, un distintivo **"Comprobando
plan"**; debajo, una tira con candado que decía **"Dashboard Avanzado · Verificando acceso…"**;
y debajo de eso, nada. Tres cuartos de pantalla en negro mientras la app hablaba de sí misma.

Es el punto A de esta misma revisión, en la primera pantalla de todas: **anunciar que estás
comprobando no es información**. El que abre su app de finanzas no viene a saber que el sistema
está preguntando por su plan.

**Por qué pasa en cada arranque.** El derecho de acceso (`user-entitlement`) está fuera de la
lista de queries que se guardan a disco, a propósito: un plan cacheado 24 h daría Pro a quien ya
lo canceló. Así que en cada arranque en frío hay una ida al servidor, y el inicio se quedaba en
blanco esperándola — el resto del tablero ya estaba en pantalla, porque el snapshot sí se
persiste.

**Arreglo.** El distintivo no se pinta mientras se comprueba: aparece cuando hay respuesta. Y en
lugar de la tira con candado va el **esqueleto** que ya usa el resto del inicio: la forma de lo
que viene, no un cartel diciendo que se está mirando.

No se toca la exclusión del caché: el plan se sigue comprobando en cada arranque, solo que en
silencio.
