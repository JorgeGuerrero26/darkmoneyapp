# Plan de rediseño — DarkMoney (Revisión 10)

> Décima tanda: **la lista de cuentas**. Las anteriores están cerradas en
> [`REDISENO.md`](REDISENO.md), [`REDISENO_FASE2.md`](REDISENO_FASE2.md),
> [`REDISENO_FASE3.md`](REDISENO_FASE3.md), [`REDISENO_FASE4.md`](REDISENO_FASE4.md),
> [`REDISENO_FASE5.md`](REDISENO_FASE5.md), [`REDISENO_FASE7.md`](REDISENO_FASE7.md),
> [`REDISENO_FASE8.md`](REDISENO_FASE8.md) y [`REDISENO_FASE9.md`](REDISENO_FASE9.md).

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 10 (30 ago 2026), mockup `W · CUENTAS`.

---

## 0. El cambio de fondo

> Con dos cuentas, la pantalla dedica 500 px al vacío y la mitad del encabezado a controles para
> buscar y filtrar dos filas. Buscador y filtro aparecen a partir de ocho cuentas; antes de eso
> no ahorran nada. Ese espacio lo ocupa el dato que un cuentahabiente sí mira.

---

## 1. Los ocho puntos

### [x] A · Buscar y filtrar dos filas
Buscador y filtro aparecen a partir de **ocho cuentas** (`LIST_CONTROLS_MIN_ACCOUNTS`), que es
cuando la lista deja de verse de un vistazo. La barra de filtros activos les acompaña.

### [x] B · "Filtrar · 8 opciones" dice cuántas hay, no qué está aplicado
Un control de filtro dice **su estado**. Sin filtro puesto, el botón lleva la etiqueta de la
opción "todas" del propio módulo — en Cuentas, "Todas las cuentas". Cuántas opciones ofrece se
descubre al abrirlo. Alcanza a todos los módulos que usan `FilterToolbar`.

### [x] C · PEN escrito tres veces
La moneda sale del subtítulo de la fila: el monto de al lado ya empieza por su símbolo, y cuando
la cuenta está en otra moneda que el patrimonio **ya lo dice su distintivo** (`pickAccountBadge`,
que existía desde antes). El conmutador de moneda sigue la misma regla: solo aparece cuando el
patrimonio suma cuentas de más de una moneda.

### [x] D · El azul no está en el sistema
Dos cuentas del mismo tipo salían una azul y otra naranja, porque el color venía del preset del
tipo. `ResourceCardIcon` acepta ahora quedarse **sin color**: contenedor en el gris de superficie
e ícono en hueso. El color se usa cuando lo eligió el usuario en Apariencia — se distingue
comparando con el preset del tipo, que es lo que se guarda al crear la cuenta.

### [x] E · El ícono de barritas antes del monto
Se retira de la fila; el monto queda solo. La analítica no se pierde: **se muda al detalle de la
cuenta**, junto a Editar y Archivar. El mockup asume que el chevrón lleva ahí, y ahí es donde
tiene sentido pedirla.

### [x] F · Dos botones redondos sin etiqueta
"Ver archivadas" se dice con palabras en el encabezado. El de agrupar por tipo se queda dentro de
la barra de filtros —que ahora solo aparece a partir de ocho cuentas, que es cuando agrupar
ayuda— y ya declaraba su estado en la barra de filtros activos.

### [x] G · "Actualizado hace 21 s"
Fuera. En una pantalla cuyos saldos escribe el propio usuario no hay sincronización que pueda ir
atrasada. La marca de tiempo que sí importa va con el total: **"2 cuentas activas · al 30 de
agosto"**.

### [x] H · Institución en una fila y no en la otra
Se resuelve solo al quitar la moneda: queda "BCP" y "Banco", y la asimetría se lee como lo que es
—un dato pendiente de llenar—. Y el botón flotante pasa a **fila "Agregar cuenta"** al final de
la lista: un FAB sobre 500 px de vacío anuncia una lista larga que no existe.

---

## 2. Riesgos

- `ResourceCardIcon` y `FilterToolbar` son compartidos. El primero solo cambia si el llamador
  pasa un color vacío, así que el resto de los módulos queda igual. El segundo cambia la etiqueta
  del selector en todos: donde antes decía "Filtrar · N opciones" ahora dice la opción "todas"
  del módulo. Es el mismo arreglo, aplicado donde también estaba mal.
- Con menos de ocho cuentas los filtros no se pueden abrir. Si había uno puesto y luego se
  archivan cuentas hasta bajar del umbral, la lista escondería cuentas sin decir por qué y sin
  forma de destaparlas: al cruzar el umbral hacia abajo, los filtros se limpian solos.
