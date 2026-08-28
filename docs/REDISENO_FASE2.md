# Plan de rediseño — DarkMoney (Revisión 02)

> Plan de ejecución de la **segunda tanda**. La primera (paleta, tipografía, formas, densidad,
> barra inferior) está cerrada en [`REDISENO.md`](REDISENO.md) — sus 7 fases están dentro.
>
> Vive en el repo a propósito: sobrevive a que se pierda o se compacte una conversación.

Fuente de verdad visual: `DarkMoney - Rediseño.dc.html` (Revisión 01 = Home, Revisión 02 =
Patrones / Flujo / Historial / Salud). Export en `Descargas/Diseño de app móvil.zip`.

Este archivo es el plan de ejecución. Si algo del código y algo del documento se contradicen,
manda el documento; si el documento se equivoca sobre el dato, manda el código y se corrige el
documento.

Fecha: 27 ago 2026 · es-PE · moneda base PEN

---

## 1. Decisiones que necesitan al dueño del producto

### Decisión A — el conmutador Simple / Avanzado

Situación: hoy convive con cinco pestañas (Resumen, Patrones, Flujo, Historial, Salud). Los dos
controles responden la misma pregunta —cuánto detalle quiero— y juntos empujan la primera cifra
a 390px del borde superior. El conmutador se repinta en las cinco pestañas.

| Opción | Qué implica | Riesgo para quien ya usa la app |
|---|---|---|
| **A1 — Preferencia en Ajustes** (recomendada) | El modo se elige una vez en Ajustes y se recuerda. Deja de ocupar espacio en cada pestaña. Nada se elimina, se muda. | Bajo. Quien ya tenía Avanzado sigue en Avanzado. Necesita un aviso único la primera vez: "El modo ahora vive en Ajustes". |
| A2 — Solo en Resumen | El conmutador se queda pero únicamente en la primera pestaña. Las otras heredan el modo. | Muy bajo, pero no resuelve la duplicación conceptual: siguen siendo dos controles de profundidad. |
| A3 — Se elimina y la profundidad se abre por tarjeta | Cada tarjeta tiene su "ver detalle". No hay modo global. | Alto. Es un cambio de modelo mental; quien usaba Simple para no ver ruido pierde ese refugio. |

Recomendación: **A1**. El modo es una preferencia, no un destino de navegación, y las
preferencias viven en Ajustes. Recupera ~60px en las cinco pestañas sin quitarle nada a nadie.
Si Avanzado es además una función de pago (hay `useDashboardEntitlement`), A1 es la única opción
que no confunde "modo" con "plan".

**RESUELTA 27 ago 2026: A1.** El modo se muda a Ajustes y se recuerda.

### Decisión B — las dos tarjetas de texto de cada pestaña

Cada pestaña abre con una tarjeta de título + tres viñetas, y debajo otra de "lectura rápida"
con dos párrafos. Son 300–380px de texto que describe la pantalla antes de mostrarla, cinco
veces.

Recomendación: eliminarlas. El nombre de la pestaña ya anuncia el contenido, y la nota de
alcance se conserva como una línea de 11px al pie de la tarjeta que la necesita.
**RESUELTA 27 ago 2026: se eliminan.** Sin "¿qué es esto?" por ahora.

### Decisión C — el amarillo *(añadida al ejecutar: el plan se contradice con la Revisión 01)*

La regla transversal 3 dice "el amarillo (`COLORS.gold`) sale del sistema", y la fase 1 pide
retirarlo de los usos de dashboard. Pero la **Revisión 01** —ya implementada y en producción—
define `#D9B65C` como el color semántico de **advertencia**: "vence pronto, pago detectado,
revisar".

Hoy `COLORS.gold` / `COLORS.warning` sostiene, fuera del dashboard: los vencimientos de
obligaciones, los presupuestos cerca del tope, los avisos de pago detectado y el badge de plan
por vencer. Retirarlo "del sistema" dejaría a *advertencia* sin color propio y la empujaría a
confundirse con *error*, que es justo la distinción que el brief original marcó como regla dura.

**RESUELTA 27 ago 2026:** el amarillo sale del dashboard avanzado (73 usos, decoración) y se
CONSERVA como token semántico de advertencia en el resto de la app (129 usos).

---

## 2. Reglas transversales

1. **El saludo no viaja.** "Hola, Adrian · Adrian Guerrero · fecha · Usuario Pro" existe solo en
   Resumen. Al entrar a una pestaña el encabezado colapsa a 44px con el nombre de la pestaña.
2. **Ninguna pantalla se presenta a sí misma.** Nada de párrafos que describan lo que viene abajo.
3. **El color es información.** Menta solo en deltas positivos reales. Clay solo en lo negativo o
   anómalo. Los niveles y totales van en hueso. Nunca dos cifras del mismo color compitiendo en
   una pantalla. El amarillo sale del DASHBOARD, no del sistema — ver Decisión C.
4. **Cero no es estado vacío.** Si no hay dato, se dice con palabras.
5. **Un solo aviso a la vez.** Los puntos de color en las pestañas y el contador de la barra
   inferior se retiran; queda el de la campana.
6. **Escala de grises fija:** `#F4F1EC` principal · `#C4BEB4` labels y subtítulos · `#A39C90`
   metadatos · `#6B6459` deshabilitado. No se introducen grises intermedios.

---

## 3. Fases

Orden pensado para que las primeras no puedan romper nada y las de riesgo lleguen ya con el
sistema visual estabilizado.

### [x] Fase 1 — Solo borrar y recolorear — HECHA

- Quitar las tarjetas de intro y de "lectura rápida" de las cinco pestañas (Decisión B: eliminar).
- Mover las frases explicativas de menta/clay a gris; dejar el color solo en la cifra.
- Reemplazar los `S/ 0.00` de estado vacío por texto ("Sin movimientos previstos", "Sin compromisos").
- Retirar los puntos de color de las pestañas y el contador de la barra inferior.
- Sustituir cualquier gris fuera de la escala del punto 6.

Archivos: `features/dashboard/components/advanced/AdvancedDashboard.tsx` (arreglo de viñetas
~L3865 y `scopeLabel` en toda la sección de detalles), `components/advanced/AdvancedCards.tsx`,
`components/simple/styles.ts`, `constants/theme.ts` (retirar `gold` de los usos de dashboard).

Verificación: ninguna cadena de más de 40 caracteres queda con color de dato; ningún `COLORS.gold`
ni `COLORS.warning` en `features/dashboard` (fuera de ahí se conservan).

**Hecho:**

- Las **5 tarjetas de intro** (`DashboardLayerHeader`) fuera, y con ellas el párrafo "Tres
  lecturas de estado…". El componente sigue existiendo por si vuelve a hacer falta.
- Las **3 frases interpretativas** del resumen ejecutivo pasan a gris fijo (`COLORS.storm`).
  Eran las que el diseñador señaló una por una.
- **Puntos de color de las pestañas fuera.** Sobrevive el contador de Salud, que es el único
  que apunta a trabajo concreto ("91 movimientos por categorizar"); los puntos de Patrones y
  Flujo solo decían "aquí hay algo", que es lo que ya dice estar en un dashboard.

- **El amarillo fuera del dashboard**: 73 → 0, y los 129 de fuera intactos. Repartido según
  el papel que hacía — 14 estados medios a gris, 54 señales de anomalía a clay, el sello PRO a
  violeta.
- **Estado vacío real** en la tarjeta de riesgo: sin agenda para la semana dice "Sin
  movimientos previstos" en vez de tres ceros que se leen como fallo de carga.
- **El contador de la barra inferior** deja de sumar notificaciones (ya tienen su campana) y
  se queda solo con las invitaciones a espacios compartidos — ver sección 6.

### [x] Fase 2 — Encabezado y pestañas — HECHA

- Encabezado colapsado de 44px en las pestañas internas.
- Pestañas con subrayado en vez de cápsula rellena, sin scroll horizontal cortado ("Salud" hoy
  queda a medias).
- El ámbito de la pantalla (año 2026/2025 en Historial) sube a la barra de título.

Archivos: `components/advanced/DashboardTabBar.tsx`, `hooks/useTabPersistence.ts`, `app/index.tsx`.

Verificación: las cinco etiquetas caben en 393px sin recorte; el primer monto de cada pestaña
aparece antes de los 200px.

**Hecho — las pestañas.** De cápsula rellena a **subrayado**. Cinco cápsulas competían por
atención con las tarjetas que hay justo debajo, que es donde están las cifras. Además desaparece
el scroll horizontal: la fila se reparte en cinco columnas iguales y "Salud" deja de quedar
cortada. Medido: la más larga ("Historial") ocupa 64 px de los 71 disponibles.

El contador de Salud pierde el amarillo (Decisión C): superficie neutra con la cifra en hueso.

**Hecho — el encabezado colapsado.** `AdvancedDashboard` avisa hacia arriba con
`onActiveTabChange` en vez de subir el estado entero: subirlo obligaría a mover también los dos
sitios que hacen `setActiveTab` por su cuenta (saltar a Salud desde una alerta, saltar a Flujo
desde el aviso de caja). La pantalla solo necesita saber DÓNDE estás, no mandar.

### [x] Fase 3 — La tarjeta de Gemini — HECHA

- Una sola tarjeta compartida, 128px: una línea de qué hace, selector de tono y botón. Sin borde
  degradado, sin halo, sin los cuatro puntos de color.
- El selector Informe / Asesor se queda solo en Patrones. En Salud la IA propone trabajo concreto
  ("Categorizar 91 movimientos"), no un informe.

Archivos: `components/advanced/ExplanationCard.tsx`, `hooks/useDashboardAiOrchestration.ts` (sin
cambios de lógica, solo de presentación).

Verificación: la tarjeta aparece una vez por pestaña y ocupa menos de 140px.

### [x] Fase 4 — Gráficos — HECHA

- **Flujo:** el puente de cierre necesita línea de cero visible y cada barra parte donde terminó
  la anterior. Saldo y cierre en hueso; solo el ritmo variable en menta. Fuera los cuatro botones
  de cápsula: la fila entera es tocable.
- **Historial:** eliminar la lista mes a mes que duplica el gráfico (quedan mejor y peor mes).
  Las barras negativas bajan del eje. Meses sin dato = filete gris.

Archivos: `components/advanced/DashboardCharts.tsx`, `lib/advanced-builders.ts` (solo si el
modelo no expone ya el signo por mes).

Verificación: un mes negativo se dibuja por debajo del eje; ninguna fila de mes duplica un dato
del gráfico.

### [x] Fase 5 — Simple / Avanzado — HECHA (A1)

Si A1: mover el control a Ajustes, persistir la elección, aviso único la primera vez.
Si A2: recortar el render a Resumen. Si A3: plan aparte, no entra en esta tanda.

Archivos: `app/settings.tsx`, `app/index.tsx`, store de UI.

Verificación: un usuario existente en Avanzado sigue en Avanzado después de actualizar.

### [x] Fase 6 — Listas — HECHA

- Contactos y Movimientos pasan de tarjetas a líneas de 56px sobre el lienzo.
- Quitar la etiqueta de categoría duplicada (hoy aparece como subtítulo y como chip en la misma fila).
- Botón flotante que no tape la última fila.

Verificación: entran 4 filas más por pantalla sin reducir el tamaño de texto; ningún dato aparece
dos veces en la misma fila.

> Nota de estado al crear este plan: **Movimientos ya pasó a filas de 56px** en la tanda
> anterior (`ResourceCard variant="row"`). De la fase 6 queda pendiente Contactos, la categoría
> duplicada y el flotante.

---

## 4. Lo que no se toca

- La lógica de proyección, Monte Carlo, HHI y estabilidad de ingresos. El rediseño no discute los
  cálculos, solo cómo se presentan.
- Los textos de explicación que el usuario abre a propósito (hojas de detalle). Ahí el párrafo
  largo sí corresponde.
- La hoja "Tipo de movimiento": ya quedó bien, sirve de referencia para el resto.
- `AdvancedDashboard.tsx` pasa de las 5,000 líneas. Este plan no pide refactorizarlo; pide
  cambios localizados. Si se parte el archivo, que sea en un cambio aparte y sin tocar
  presentación al mismo tiempo.

---

## 5. Registro de decisiones

| Fecha | Decisión | Resuelta por |
|---|---|---|
| 27 ago 2026 | Botón principal en hueso, no en menta: el menta queda para flujo de caja | Diseño |
| 27 ago 2026 | Gasto en clay, no en rosa; en listas largas el monto va en hueso | Diseño |
| 27 ago 2026 | Barra inferior anclada en vez de píldora flotante | Diseño |
| 27 ago 2026 | Cinta de métricas: label arriba en versalitas, cifra grande debajo | Diseño |
| 27 ago 2026 | **Decisión A: A1** — Simple/Avanzado se muda a Ajustes | Producto |
| 27 ago 2026 | **Decisión B: eliminar** las tarjetas de texto meta | Producto |
| 27 ago 2026 | **Decisión C:** amarillo fuera del dashboard, se conserva en el resto | Producto |

---

## 6. Cierre — las 6 fases están dentro

### Decisiones que se tomaron durante la ejecución, sin consultar

Eran de presentación, no de lógica. Quedan aquí por si hay que revisarlas:

- **El contador de la barra inferior no se borró del todo.** El plan pedía retirarlo. Al
  mirarlo resultó que sumaba notificaciones sin leer **+ invitaciones a espacios compartidos**.
  Las notificaciones salieron —ya tienen su campana con su propio contador, y contarlas dos
  veces no añade nada—, pero las invitaciones se quedaron: no tienen ningún otro sitio donde
  avisar, y sin eso alguien te invita a un espacio y no te enteras hasta entrar a Más por
  casualidad. Suelen ser 0 o 1, así que ya no grita.
- **El amarillo hacía dos trabajos** y se separó según cuál: estado medio de una escala de tres
  → gris (14 casos), señal de que algo se salió → clay (54), y el sello PRO → violeta.
- **El acento de la IA pasó al violeta.** `GEMINI_BRAND.teal` apuntaba al mismo verde que
  "entró plata".
- **El aviso de que Simple/Avanzado se mudó solo sale a quien le afecta**: si no se ha visto Y
  el modo guardado es avanzado. Para quien instala de cero el conmutador nunca estuvo en el
  dashboard.

### Lo que NO se hizo, y por qué

- **La tarjeta de IA no se extrajo a un componente compartido.** El plan pide "una sola tarjeta
  compartida". Hoy son cinco copias del mismo bloque, ya compactadas a una línea cada una.
  Unificarlas es un refactor de `AdvancedDashboard.tsx` (5.000+ líneas) y el propio plan dice
  que si se parte ese archivo sea en un cambio aparte, sin tocar presentación a la vez.
- ~~El selector Informe / Asesor~~ — **resuelto el 28 ago 2026, y mi lectura era errónea.**
  No es un selector de *qué se le pide* al modelo: es el **tono** (`DASHBOARD_AI_TONE_OPTIONS`),
  o sea el registro con que te habla. La caché ya guardaba una respuesta por tono y por pestaña
  (`responses[tone]`) y el valor ya se persistía por usuario en AsyncStorage. El contrato con la
  edge function no se toca.

  Así que la regla correcta no era "quitarlo de Salud" sino **elegirlo una vez**, igual que
  Simple/Avanzado. Sale a Ajustes vía `useDashboardAiTone`, extraído de la orquestación para no
  duplicar la fuente de verdad.

- ~~Categorizar necesita al modelo~~ — **falso.** `suggestCategoryFromDescription` y
  `suggestCategoryFromCounterparty` ya proponen categoría con patrones locales en los tres
  formularios; la lista de movimientos ya trae filtro `uncategorized` y `BulkActionBar`; y
  `openSummaryUncategorizedPreview` ya existía en el propio dashboard. Las piezas estaban todas.

  En Salud la tarjeta de IA **desaparece** y en su lugar va un botón que lleva a los movimientos
  sin categoría. Una pestaña de limpieza necesita una acción, no un texto generado.

### Deuda conocida que sigue viva

- La IA de Salud (`dashboardAiHealthPayload`, su caché y sus derivados) sigue calculándose
  aunque ya no la pinta nadie. Son ~10 `useMemo` que corren en cada render para nada. Se dejan
  porque la edge function sigue viva y borrarlos es una limpieza aparte, pero es trabajo
  desperdiciado en cada pintado.


- `AdvancedDashboard.tsx` sigue pasando de las 5.000 líneas.
- `ExplanationCard.tsx` y `DashboardLayerHeader` siguen existiendo sin usarse desde el
  dashboard; se dejaron por si el contenido vuelve.
- `EXTENDED_PALETTE` conserva nombres de familia (`rosePink`, `skySoft`, `teal`) cuyos valores
  ya no corresponden al nombre. Renombrarlos toca 400+ call sites.
