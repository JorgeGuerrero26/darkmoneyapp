# Plan de rediseño — DarkMoney (Revisión 04)

> Cuarta tanda: **las pantallas de sistema** — Más, Detección automática y Configuración.
> Las anteriores están cerradas en [`REDISENO.md`](REDISENO.md) (sistema visual),
> [`REDISENO_FASE2.md`](REDISENO_FASE2.md) (dashboard) y
> [`REDISENO_FASE3.md`](REDISENO_FASE3.md) (módulos de lista).

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 04 (28 ago 2026).

---

## 0. El hallazgo que abre la revisión — YA ESTABA HECHO

La Revisión 04 abre diciendo que *"la Decisión A ya está tomada en el código"* y que el
conmutador Simple/Avanzado y el selector de tono **sobran** en el dashboard.

Correcto, y ya se hizo: la fase 5 de la Revisión 02 movió el modo a Ajustes, y el tono salió de
las cinco pestañas poco después. El diseñador estaba mirando un build anterior a esa
publicación. Verificado al recibir esta revisión: en el dashboard solo quedaban **un comentario
y un import muerto**, ya retirados.

---

## 1. L · Más

### [x] Nueve tarjetas idénticas son una lista disfrazada
Las nueve entradas comparten borde, fondo y chevrón, así que la tarjeta no separa nada: solo
suma **94 px por opción**. Pasan a filas de 56 px sobre el lienzo y el menú cabe entero sin
desplazarse, agrupado por para qué sirve cada cosa.

### [x] El subtítulo cambia por un dato
"Pagos recurrentes", "Organiza tus movimientos", "Tasas para conversión de monedas" explican
palabras que ya se entienden. En su lugar va **lo que hay dentro**: `S/ 60.07 al mes`,
`27 categorías`, `1 USD = 3.3516`. Un menú que dice el estado de cada sección ahorra entrar a
mirar.

### [x] El menta no es decoración
Los nueve iconos venían en menta, el color que en el resto de la app significa dinero que entra.
Aquí no significa nada, y con nueve seguidos tampoco decora. **Salen**: sin ellos los títulos se
alinean al mismo borde. El badge de 94 pasa del amarillo al **rojo de la campana**, que es como
ya lo ves en el Home.

### [x] "Cerrar sesión" estaba dos veces
Aquí como botón de 68 px con borde clay, y otra vez al fondo de Configuración. **Se queda solo
en Configuración**, que es donde vive lo de tu cuenta. Un menú de navegación no debería terminar
en la única acción irreversible de la app.

---

## 2. M · Detección automática

### [x] "Elegir cuenta" siete veces significa que nada está configurado
Cada app trae un desplegable vacío, así que activar el interruptor no basta: quedan **ocho
decisiones pendientes** que nadie va a tomar. La cuenta destino **se preselecciona con la
principal** y el desplegable desaparece: la fila dice "a Cuenta Principal" y se toca solo para
cambiarla. De 110 px por app a 60 px.

### [x] Una app apagada no necesita mostrar su configuración
Los bancos en off dibujan igual su desplegable en gris: 60 px de control inactivo cada uno.
Apagados son **una línea de 52 px** con el nombre y el interruptor; el destino aparece al
encenderlos.

### [x] La cápsula "Activa" contradecía el aviso de arriba
La pantalla dice que la detección no está disponible en este build y tres dedos más abajo una
cápsula verde dice "Activa". Se cambia por el **conteo real de apps activas**, que es un dato y
no una afirmación que el aviso desmiente.

### [x] Dos tarjetas de texto antes del primer control
Suman 260 px de párrafo, y la segunda ofrece "Abrir ajustes del sistema" para un permiso que
este build no puede usar. Queda el aviso —en **clay**, porque es una limitación real— y la
explicación de privacidad como una línea sobre la lista. El botón vuelve cuando el permiso sirva
de algo.

---

## 3. N · Configuración

### [x] El perfil no se edita en línea, se abre
Foto, nombre, correo, moneda base y "Guardar perfil" ocupan **620 px de formulario** antes de la
primera preferencia. Y el correo es un campo editable con el texto en gris de placeholder, así
que no se sabe si está puesto o vacío. El perfil pasa a **una fila que abre su propia pantalla**.

### [x] Veinte cápsulas de moneda, otra vez
Misma falla que en Tipos de cambio y misma solución: **una fila que dice PEN y abre la lista**.
Ocupaba 200 px en cuadrícula. De paso, *"Se sincronizara"* va con tilde.

### [x] El morado no existe en el sistema
El tono del asistente está como **par de tarjetas de 90 px** con borde y texto violeta, y
compite con "Modo avanzado", que es la preferencia importante de esa sección. Pasa a **una fila
con el valor a la derecha**; la explicación de cada tono se lee al abrirla, que es cuando
importa.

> Nota al implementar: el violeta **sí existe** en el sistema desde la Revisión 01 — es el token
> `COLORS.pro`, reservado a la IA, y se usa en el dashboard y en el sello Pro. Lo que sobra no es
> el color sino **la forma**: dos tarjetas de 90 px para una preferencia secundaria. La fila
> puede conservar el violeta en el valor.

### [x] No todo interruptor necesita dos líneas de explicación
El paréntesis con el sistema operativo y la promesa de alertas no cambian nada al decidir. Push
y Resumen diario se explican solos y quedan en **52 px**; Alertas predictivas conserva su línea,
porque ahí sí hay algo que no es obvio.

### [x] Dos botones primarios y una acción irreversible
"Guardar perfil" y "Generar dirección" son los dos hueso lleno, que en el resto de la app
significa **acción principal**. Guardar se va con el perfil a su pantalla; "Detectar pagos por
correo" se vuelve **una fila más** y su párrafo de privacidad se lee dentro. "Cerrar sesión"
queda al final —es su lugar— pero **en texto, sin recuadro**: un botón de 68 px con borde clay
pesa más que cualquier preferencia de la pantalla.

---

## 4. Lo que hereda de revisiones anteriores

- La fila de 56 px, el chevrón y el separador sangrado ya existen en `ResourceCard variant="row"`.
- El selector para más de seis opciones ya existe en `FilterToolbar` (`MAX_INLINE_OPTIONS`). La
  lista de 20 monedas de Configuración debería reusar ese patrón en vez de inventar otro.
- El amarillo ya está acotado a "vence en ≤ 7 días" (`lib/due-tone.ts`), así que el badge de Más
  no puede ser amarillo: no es un vencimiento.
