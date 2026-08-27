# Rediseño visual "Libro contable nocturno"

> Plan de implementación. Vive en el repo **a propósito**: sobrevive a que se pierda o se
> compacte una conversación. Si retomas esto sin contexto, este archivo es la única fuente
> de verdad. Marca las fases hechas con `[x]` conforme avances.

- **Origen**: propuesta de Claude Design, 27 ago 2026. Export en
  `Descargas/Diseño de app móvil.zip` → `DarkMoney - Rediseño.dc.html`.
- **Concepto**: un grafito cálido y opaco donde el color solo significa dinero. Nada brilla,
  nada es de vidrio, nada flota sin razón.
- **Alcance**: las 41 rutas de `app/`. Es un cambio solo-JS: viaja por EAS Update, no
  requiere APK nuevo ni reinstalar el iPhone.

---

## 1. Por qué esto no son 41 pantallas

Medido en el repo antes de empezar:

| Señal | Tokenizado | A mano | Cobertura |
|---|---:|---:|---:|
| `FONT_FAMILY.*` vs `fontFamily: "…"` | 693 | 3 | 99,6 % |
| `SURFACE.*` vs `GLASS.*` | 416 | 14 | 96,7 % |
| `RADIUS.*` vs `borderRadius: <n>` | 375 | 74 | 83,5 % |
| Hex sueltos fuera de `constants/theme.ts` | — | 110 en 23 archivos | — |
| `rgba(` inline | — | 168 | — |

**Conclusión**: el 90 % del rediseño entra cambiando `constants/theme.ts`. El resto es una
lista cerrada y conocida de archivos que se saltaron los tokens — está en la fase 5.

Todas las pantallas de recurso pasan por `ResourceModuleTemplate` y los componentes de
`components/ui/`, así que un cambio ahí llega a los once módulos de una vez.

---

## 2. Mapa de tokens — origen → destino

Esta tabla es la entrega del diseñador, verbatim. **Es la referencia canónica**: si el
export se pierde, con esto se reconstruye todo.

### 2.1 Fondos

| Rol | Hoy | Nuevo |
|---|---|---|
| Hojas, modales, teclado | `#090D12` | `#0E0D0C` |
| Lienzo de la app | (transparent) | `#141312` |
| Tarjetas y filas | `#161F2A` | `#1C1B19` |
| Inputs, chips, tiles, pressed | `#161F2A` | `#252320` |
| Barra inferior | `#0F141B` | `#0A0A09` al 86 % + blur 20 |

### 2.2 Texto — el contraste SUBE, no baja

| Rol | Hoy | Nuevo | Contraste sobre tarjeta |
|---|---|---|---|
| Principal — cifras y títulos | `#F5F7FB` | `#F4F1EC` | 15,3:1 |
| Secundario — subtítulos, labels | `#A7B2C2` | `#C4BEB4` | 9,4:1 |
| Metadatos y placeholders | `#96A2B5` | `#A39C90` | 6,3:1 |
| Deshabilitado | `#4A5568` | `#6B6459` | 2,9:1 |

Hoy `#96A2B5` sirve para metadatos **y** placeholders a la vez (6,6:1). El diseño los
separa: metadatos a 6,3:1 con mejor peso óptico en cálido, y lo que era secundario sube a
9,4:1.

### 2.3 Colores financieros y semánticos

| Rol | Hoy | Nuevo | Contraste |
|---|---|---|---|
| Ingreso — entra plata, éxito | `#6BE4C5` | `#86CE96` verde hierba | 9,3 |
| Gasto — sale plata, saldo negativo, tope excedido | `#FF8F9E` | `#E2A07E` arcilla | 7,8 |
| Transferencia — se mueve, ni gana ni pierde | `#8EA5FF` | `#9DB2DE` acero | 8,1 |
| Advertencia — vence pronto, pago detectado | `#D7BE7B` | `#D9B65C` ámbar | 8,9 |
| Destructivo / error — eliminar, validación | `#FF637D` | `#EC7466` rojo | 6,0 |
| **Pro / asistente — solo IA y analítica** | (no existía) | `#C0A6D8` violeta | 8,6 |

### 2.4 Acción principal — el cambio grande

El botón principal deja de ser menta y pasa a **hueso `#F4F1EC` sobre tinta, sin tono**
(16,5:1). Hoy el menta significa acción, éxito, ingreso, foco y marca a la vez: un token con
cinco significados no comunica ninguno. Sin tono, la acción gana contraste y los cinco
colores quedan libres para significar solo plata.

### 2.5 Gráficos

`#9DB2DE` · `#86CE96` · `#E2A07E` · `#D9B65C` · `#C0A6D8` · `#8FBFB8`

Los cinco primeros son los mismos tokens semánticos, para que un donut de gastos por
categoría no contradiga el color de la fila que lo alimenta. `#8FBFB8` es relleno para
series largas y **no tiene significado**.

### 2.6 Tipografía

| Rol | Hoy | Nuevo |
|---|---|---|
| Cifras y títulos | Outfit SemiBold | **Archivo** 400·500·600·700 |
| Cuerpo, labels, metadatos | Manrope 400·500·600 | **IBM Plex Sans** 400·500·600 |

Paquetes verificados: `@expo-google-fonts/archivo@0.4.2` y
`@expo-google-fonts/ibm-plex-sans@0.4.1`. Ambos son assets JS → viajan por OTA.

Motivo: Outfit es geométrica (ceros circulares, ancho uniforme) y es lo que hace que un
dashboard se vea de plantilla; Archivo trae cifras tabulares reales. Manrope pierde detalle
en **ñ y acentos** a 11–13 px, que en español pesa más que en inglés.

**Escala**: se conserva 11 · 13 · 15 · 17 · 20 · 24 · 32 y se agregan **44** (patrimonio) y
**46** (input de monto).

### 2.7 Jerarquía del monto — tres pesos en una cifra

| Parte | Tratamiento |
|---|---|
| Símbolo `S/` | 43 % del tamaño, peso 500, color de metadato |
| Enteros | 100 %, peso 600, tinta plena, tracking −0.035em |
| Decimales | 48 %, tinta al 55 % |
| Signo `+` / `−` | Siempre explícito en listas y **a tamaño completo** — es información, no puntuación |

### 2.8 Radios — se cierran todos

| Uso | Hoy | Nuevo |
|---|---:|---:|
| Chips y tags | 12 | **4** |
| Botones e inputs | 18 | **8** |
| Tiles y avatares | 22 | **10** |
| Tarjetas | 28 | **14** |
| Hojas (solo arriba) | 28 | **20** |
| Pill | 9999 | 9999 (solo badges numéricos) |

### 2.9 Bordes y sombras

Bordes: blanco puro al 6–18 % sobre azul da un halo frío. Se cambia al mismo hueso del
texto y solo tres niveles:

- **filete** 7 % — tarjetas, separadores
- **marcado** 13 % — inputs, botón fantasma
- **foco** 45 % — sin color, sin glow

El separador de lista se sangra **62 px** para alinearse con el texto, no con el borde.

Sombras: de seis niveles a **dos**, ninguno de color.

- **flotante** `0 6px 20px rgba(0,0,0,.45)`
- **hoja** `0 −10px 44px rgba(0,0,0,.6)`

Las tarjetas **no tienen sombra**: se separan por un paso de fondo y un filete.

### 2.10 Espaciado — sin cambios

4 · 8 · 12 · 16 · 20 · 24 · 32 se conserva. Dos reglas de uso nuevas: **20 es el margen
lateral único de toda la app**, y los grupos de hermanos van siempre con `gap`, nunca con
márgenes individuales.

---

## 3. Fases

Una fase = un commit = una validación. Cada una es revertible sola.

### [x] Fase 1 — Color — HECHA

**Qué**: reemplazar la paleta en `constants/theme.ts` (COLORS, EXTENDED_PALETTE,
CHART_PALETTE, BADGE_TONES, SURFACE, GLASS). Agregar el token `pro` violeta. Cambiar la
acción principal a hueso sin tono.

**Archivos**: `constants/theme.ts` únicamente.

**Riesgo**: bajo. Un solo archivo, revertible con un revert.

**La complicación real — medida en el repo**:

| Token | Usos | Valor hoy |
|---|---:|---|
| `COLORS.primary` | 412 | `#6BE4C5` |
| `COLORS.pine` | 147 | `#6BE4C5` |
| `COLORS.income` | 199 | `#6BE4C5` |
| `COLORS.success` | 8 | `#6BE4C5` |

**766 usos del mismo menta.** Es exactamente lo que el diseñador diagnosticó sin ver el
código: un token con cinco significados. Por eso `primary` NO se puede apuntar directo al
hueso — entre esos 412 usos hay focos de input, spinners, estados activos y éxitos, que no
son botones de acción.

Plan para desenredarlo sin romper nada:

1. Token nuevo `COLORS.action = "#F4F1EC"` (hueso) + `actionText` oscuro para el texto encima.
2. `income` / `success` → `#86CE96`. Se mueven solos y quedan bien.
3. `primary` / `pine` → `#86CE96` de entrada, para que nada quede sin color mientras tanto.
4. Migrar a `action` **solo los call sites que son botón primario** (`Button` variant
   primary, FAB, "Confirmar", "Guardar"). El resto se queda con el verde.

El paso 4 es acotado y verificable: el resto de los 766 usos conserva el significado que ya
tenía. **Pasos 1–3 hechos; el paso 4 (migrar botones primarios a `action`) queda pendiente.**

**Hallazgos al ejecutarla:**

- **El lienzo era `transparent`.** Lo pintaba la ventana nativa en `#05070B` (azul), vía
  `AppTheme.colors.background` en `app/_layout.tsx`. Sin cambiar eso, todo se calentaba y la
  base quedaba fría debajo. Ahora apunta a `COLORS.canvas`.
- **`app.json` tiene `backgroundColor: "#05070B"` en splash y adaptiveIcon.** Eso es
  **configuración nativa**: NO viaja por OTA. La pantalla de arranque del sistema seguirá
  azul en el APK e IPA actuales hasta que se haga un binario nuevo. El splash interno de la
  app (`app/_layout.tsx`) sí quedó en grafito.
- **`npm run check:no-hex` YA fallaba en HEAD antes del rediseño** (verificado con
  `git stash`). Es deuda previa: el baseline se generó cuando `lib/` no estaba en
  `SCAN_DIRS`. **No bloquear por esto**; se regenera el baseline en la fase 5, que es donde
  se limpia esa deuda de verdad.

### [ ] Fase 2 — Forma: radios, bordes y sombras

**Qué**: cerrar `RADIUS`, reducir `ELEVATION` de seis niveles a dos y sin tinte, pasar los
bordes de blanco puro al hueso del texto en tres niveles.

**Archivos**: `constants/theme.ts`, más los 12 archivos con `borderRadius` literal
(sección 5).

**Riesgo**: bajo-medio. `ELEVATION` está indexado por número (`ELEVATION[3]`) en 12 sitios:
mantener las claves 0–5 mapeando a los dos niveles nuevos evita romper llamadas.

### [ ] Fase 3 — Quitar el vidrio esmerilado

**Qué**: el blur sobrevive **solo** en la barra inferior y el fondo de las hojas. Todo lo
demás pasa a superficie opaca con filete de 1 px.

**Archivos** (15 con blur):
`app/(app)/_layout.tsx` · `app/(auth)/login.tsx` · `app/settings.tsx` · `app/_layout.tsx` ·
`components/ui/SafeBlurView.tsx` · `components/ui/BottomSheet.tsx` ·
`components/ui/ConfirmDialog.tsx` · `components/ui/DatePickerInput.tsx` ·
`components/ui/ActivityNotice.tsx` · `components/ui/BiometricLock.tsx` ·
`components/layout/OfflineBanner.tsx` · los 4 `components/domain/*AnalyticsModal.tsx`

**Riesgo**: medio. `BottomSheet` y `ConfirmDialog` acaban de recibir el arreglo de iOS
(un solo `<Modal>` a la vez, `overlay` + `inline`). **No romper esa estructura** al tocar
el fondo — ver `__tests__/dialog-inside-sheet.test.ts`.

**Beneficio colateral**: menos blur = menos batería y menos trabajo de GPU en listas largas.

### [ ] Fase 4 — Tipografía

**Qué**: `npm i @expo-google-fonts/archivo @expo-google-fonts/ibm-plex-sans`, registrar en
`app/_layout.tsx`, remapear `FONT_FAMILY` y agregar los tamaños 44 y 46 a `FONT_SIZE`.

**Archivos**: `package.json`, `app/_layout.tsx`, `constants/theme.ts`, más los 3
`fontFamily` literales.

**Riesgo**: medio. Archivo e IBM Plex tienen métricas distintas a Outfit/Manrope: hay que
barrer la app buscando texto cortado, sobre todo en las 5 etiquetas de la barra inferior y
en los chips de filtro. **Probar con la letra del sistema agrandada.**

**No olvidar**: la pantalla de carga vive en `app/_layout.tsx` y espera a que las fuentes
carguen. Sumar dos familias alarga ese paso — verificar que no reaparezcan los timeouts de
`bootstrap` que ya están instrumentados.

### [ ] Fase 5 — Limpieza de valores a mano

**Qué**: llevar a tokens los 110 hex y 168 `rgba()` sueltos. Sin esto quedan islas azules
en medio del grafito.

**Archivos por prioridad** (nº de ocurrencias):

| Archivo | hex | rgba | radius |
|---|---:|---:|---:|
| `lib/account-institutions.ts` | 20 | — | — |
| `components/domain/AttachmentPicker.tsx` | — | 17 | 6 |
| `features/dashboard/components/advanced/AdvancedDashboard.tsx` | — | 10 | — |
| `components/domain/AttachmentPreviewModal.tsx` | — | 10 | — |
| `app/_layout.tsx` | 6 | 9 | 3 |
| `features/accounts/lib/composition.ts` | 8 | — | — |
| `features/accounts/components/form/AccountTypePicker.tsx` | 7 | — | — |
| `components/domain/AccountAnalyticsModal.tsx` | — | 8 | 5 |
| `components/ui/DatePickerInput.tsx` | — | 8 | — |
| `components/forms/PaymentRequestForm.tsx` | — | 7 | 3 |
| `components/DarkMoneyToast.tsx` | 5 | 5 | 3 |
| `app/(auth)/login.tsx` | — | 5 | 3 |
| `app/settings.tsx` | — | — | 5 |
| `features/accounts/components/form/ColorPicker.tsx` | 3 | — | — |

**Excepción deliberada**: `features/obligations/lib/obligationReport.ts` tiene 8 hex y
**no se toca**. Es la paleta clara de impresión del PDF, documentada en `CLAUDE.md`; no es
tema de la app.

**Ojo con `lib/account-institutions.ts`**: son los colores de marca de los bancos (BCP,
Interbank, etc.). No son tokens de tema — se revisan uno a uno para que no vibren contra el
grafito, pero conservan su identidad.

### [ ] Fase 6 — Anatomía de componentes

**Qué**: la parte que toca componentes, no tokens.

1. **Fila de movimiento**: de tarjeta ~72 px a fila de **56 px** sobre lienzo, sin sombra ni
   fondo propio, separador sangrado 62 px. Caben 4 filas más por pantalla sin bajar ningún
   tamaño de letra. Área táctil 56 > 44.
2. **Encabezado de día pegajoso** de 26 px con total parcial del día.
3. **Cinta de métricas**: una sola pieza con reglas verticales en vez de tres tarjetas.
   La columna del neto lleva fondo elevado. Las cifras omiten el símbolo (ya está en el label).
4. **Tarjeta de recurso**: cuatro niveles fijos — identidad, cifra, avance, acción. El badge
   de vencimiento sube al bloque de la cifra. Máximo un badge visible.
5. **Chips**: dos registros distintos. Selección = rectángulo lleno de tinta; filtro activo =
   más chico, gris, removible, **sin color de estado** (no es un estado, es un residuo).
6. **Avisos**: 3 tonos, 1 forma. Tope excedido y error del sistema se distinguen por **tres
   canales**: color de filete, color del label y borde completo teñido solo en el error.
7. **Estado vacío**: fuera el círculo con icono gigante. Borde punteado, copy que nombra el
   filtro causante y acción que lo deshace.

**Archivos**: `components/ui/ResourceCard.tsx`, `ResourceSectionList.tsx`,
`MetricSummaryBar.tsx`, `MetricSummaryCard.tsx`, `FilterToolbar.tsx`, `ActiveFilterBar.tsx`,
`EmptyState.tsx`, `Badge.tsx`, `ActivityNotice.tsx`, y la fila de movimientos en
`features/movements/`.

**Riesgo**: alto. Toca layout compartido por los once módulos. **`ResourceModuleTemplate` y
su orden de 8 slots NO cambian** — solo cambia el peso tipográfico dentro de cada franja.

### [ ] Fase 7 — Barra inferior y flotante

**Qué**: de píldora flotante a **franja anclada** con blur y filete superior, 78 px con el
safe area. El flotante mantiene forma de tarjeta (no círculo), 58 px, a 96 px del borde.

**Por qué**: la píldora obliga a que cada lista y cada flotante reserven 68 px a mano, y con
la letra del sistema agrandada las cinco etiquetas se cortan. Anclada reserva su espacio
sola y se comporta igual en iPhone con notch y en Android.

**Archivos**: `app/(app)/_layout.tsx`, `components/ui/FAB.tsx`, y todos los sitios que hoy
reservan padding inferior a mano.

**Riesgo**: alto. Es lo único del plan que no es estética pura. **Va al final a propósito**:
si algo se rompe, las seis fases anteriores ya están dentro y son independientes.

---

## 4. Inventario de pantallas — dónde se resuelve cada una

Las 41 rutas de `app/`. La columna dice qué fase la deja lista.

| Pantalla | Ruta | Se resuelve en |
|---|---|---|
| Bienvenida | `(auth)/welcome` | 1–4 |
| Inicio de sesión | `(auth)/login` | 1–5 (tiene 5 rgba + 3 radius + blur) |
| Registro | `(auth)/register` | 1–4 |
| Recuperar contraseña | `(auth)/recovery` | 1–4 |
| Restablecer contraseña | `(auth)/reset-password` | 1–4 |
| Arranque / splash | `index`, `_layout` | 1–5 (6 hex + 9 rgba + 3 radius + blur) |
| Onboarding | `onboarding` | 1–4 |
| **Dashboard** | `(app)/dashboard` | 1–4, 6 (cinta de métricas) |
| Dashboard Pro | `features/dashboard/.../AdvancedDashboard` | 1–5 (10 rgba) + token `pro` violeta |
| **Movimientos** | `(app)/movements` | 1–4, **6** (fila 56 px, encabezado de día) |
| Detalle de movimiento | `movement/[id]` | 1–4 |
| **Cuentas** | `(app)/accounts` | 1–5 (AccountTypePicker, ColorPicker, composition) |
| Detalle de cuenta | `account/[id]` | 1–4, 6 |
| **Créditos y deudas** | `(app)/obligations`, `obligations` | 1–4, 6 |
| Detalle de obligación | `obligation/[id]` | 1–4, 6 |
| Invitación a obligación | `obligation-invite/[token]` | 1–4 |
| Obligación compartida | `share/obligations/[token]` | 1–4 |
| **Presupuestos** | `(app)/budgets`, `budgets` | 1–4, 6 |
| Detalle de presupuesto | `budget/[id]` | 1–4, 6 |
| **Suscripciones** | `(app)/subscriptions` | 1–4, 6 |
| Detalle de suscripción | `subscription/[id]` | 1–4, 6 |
| **Ingresos fijos** | `(app)/recurring-income` | 1–4, 6 |
| Detalle de ingreso fijo | `recurring-income/[id]` | 1–4, 6 |
| **Categorías** | `(app)/categories`, `categories` | 1–5 (CategoryForm: 4 hex) |
| **Contactos** | `(app)/contacts`, `contacts/index` | 1–4, 6 |
| Detalle de contacto | `contacts/[id]` | 1–4, 6 |
| **Notificaciones** | `(app)/notifications` | 1–4, 6 (avisos: 3 tonos, 1 forma) |
| Detección de notificaciones | `(app)/notification-detection` | 1–4 |
| Onboarding de detección | `(app)/notification-onboarding` | 1–4 |
| Sugerencia detectada | `detected-suggestion/[id]` | 1–4 (botones a 44 px) |
| **Asistente** | `assistant` | 1–4 + token `pro` violeta |
| **Tipos de cambio** | `(app)/exchange-rates`, `exchange-rates` | 1–4 |
| **Configuración** | `(app)/settings`, `settings` | 1–5 (5 radius + blur) |
| Más | `(app)/more` | 1–4 |
| Invitación a espacio | `workspace-invite/[token]` | 1–4 |
| **Barra inferior** (todas) | `(app)/_layout` | **7** |
| **Formularios** (10 hojas) | `components/forms/*` | 1–5 |

---

## 5. Lo que el diseñador dijo que NO hay que tocar

Conservar tal cual:

1. **La separación `dangerSoft` / `dangerStrong`.** Está mejor pensada que en la mayoría de
   apps de finanzas. Solo cambian los tonos y se le suma un segundo canal además del color.
2. **La anatomía de 8 slots de `ResourceModuleTemplate`.** Once módulos con un solo orden
   visual es la mejor decisión estructural de la app.
3. **La escala de espaciado 4–32.**
4. **El flujo sugerencia → confirmar/descartar.** Solo sube contraste y botones a 44 px,
   porque es la interacción que ocurre en la calle.

---

## 6. Fuera de alcance (vuelta aparte, cuando se decida)

- Dashboard Pro con analítica avanzada, donde la paleta de gráficos se pone a prueba.
- Asistente en modo voz: necesita su propio lenguaje de estado.
- Revisión de la app entera con el tipo de letra del sistema al 200 %.
- Reporte PDF de obligaciones: paleta clara de impresión, no es tema de la app.

---

## 7. Validación y publicación

Por cada fase:

```bash
npm run typecheck
npx jest
git diff --check
```

Publicar (recordar el **doble publish**: el iPhone corre un IPA con runtime 1.0.8 congelado
y el repo va en 1.0.9):

```bash
npx eas-cli update --channel preview --message "…"
# app.json version -> 1.0.8, publicar de nuevo, restaurar a 1.0.9
```

El changelog de usuario va en `constants/changelog.ts` siguiendo `docs/CHANGELOG_STYLE.md`.
Un rediseño se anuncia **una sola vez y al final**, cuando todas las fases estén dentro; no
una entrada por fase.
