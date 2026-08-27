// ─── Color palette ───────────────────────────────────────────────────────────
// Rediseño "Libro contable nocturno" (2026-08-27). Grafito CÁLIDO, no azulado: el negro
// azulado es la firma visual de cripto y de cada plantilla de dashboard. Misma luminosidad,
// temperatura opuesta. Mapa completo origen→destino y las 7 fases en docs/REDISENO.md.
export const COLORS = {
  // Backgrounds — darkest to lightest
  // El lienzo deja de ser transparent: antes lo pintaba la ventana nativa (#05070B, azul),
  // así que sin esto todo lo demás se calentaba y la base quedaba fría.
  canvas:  "#141312",   // lienzo de la app
  void:    "#0E0D0C",   // sheets / modals / teclado
  shell:   "#0A0A09",   // sidebars / navbars / tab bar
  mist:    "#1C1B19",   // cards (un paso sobre el lienzo)

  // Aliases (keep compatibility with existing screens)
  bgDeep:  "#141312",
  bgVoid:  "#0E0D0C",
  bg:      "#141312",
  bgCard:  "#1C1B19",   // matches mist
  bgInput: "#252320",   // inputs, chips, tiles, pressed — un paso MÁS que la tarjeta
  bgModal: "#0E0D0C",

  // Text — el contraste SUBE respecto a la paleta azul. Metadatos y placeholders dejan de
  // compartir token: antes ambos eran #96A2B5 (6.6:1) sin distinguirse.
  ink:     "#F4F1EC",   // primary text — 15.3:1 sobre tarjeta
  storm:   "#A39C90",   // metadatos y placeholders — 6.3:1
  fog:     "#C4BEB4",   // subtítulos, labels, stats, chips — 9.4:1
  text:    "#F4F1EC",
  textMuted:    "#A39C90",
  textDisabled: "#6B6459",   // 2.9:1
  textInverse:  "#141312",   // texto sobre superficie clara

  // Accents
  pine:     "#86CE96",  // verde hierba — ingreso, éxito
  ember:    "#9DB2DE",  // acero — transferencia, información
  gold:     "#D9B65C",  // ámbar — vence pronto, pago detectado, revisar
  // Danger split: soft para pérdida financiera, strong para acciones destructivas
  dangerSoft:   "#E2A07E",  // arcilla — gasto, saldo negativo, tope excedido
  dangerStrong: "#EC7466",  // rojo — eliminar, error, validación

  // Acción principal SIN TONO. El menta era acción, éxito, ingreso, foco y marca a la vez
  // (766 usos del mismo hex entre primary/income/pine/success): un token con cinco
  // significados no comunica ninguno, y menta neón sobre negro azulado es, literalmente, la
  // paleta de un exchange. En hueso gana contraste (16.5:1) y deja los cinco colores libres
  // para significar solo plata. Migrar aquí SOLO los botones primarios — ver fase 1 del plan.
  action:     "#F4F1EC",
  actionText: "#141312",

  // Pro / IA — tono propio y exclusivo. Lo que dice la IA es una opinión; lo que dice un
  // saldo es un hecho. Con el mismo color el usuario no sabe qué puede auditar.
  pro:      "#C0A6D8",
  proMuted: "rgba(192,166,216,0.12)",

  // Aliases
  primary:     "#86CE96",
  primaryDark: "#6FB47E",
  secondary:   "#9DB2DE",
  danger:      "#EC7466",   // now points to dangerStrong (destructive actions)
  rosewood:    "#E2A07E",   // kept for backward compat (financial loss)
  dangerMuted: "rgba(226,160,126,0.12)",
  success:     "#86CE96",
  successMuted: "rgba(134,206,150,0.12)",
  warning:     "#D9B65C",
  warningMuted: "rgba(217,182,92,0.12)",
  info:        "#9DB2DE",
  infoMuted:   "rgba(157,178,222,0.12)",

  // Financial
  income:   "#86CE96",
  expense:  "#E2A07E",   // keeps soft (spending ≠ error)
  transfer: "#9DB2DE",
  neutral:  "#A39C90",

  // Budget progress
  budgetGood: "#86CE96",
  budgetWarn: "#D9B65C",
  budgetOver: "#E2A07E",  // keeps soft (overspending ≠ destructive)

  // Tab bar — el activo va en hueso, no en color: la pestaña actual es navegación, no un
  // estado financiero. Así el verde no compite con "entró plata" en la misma pantalla.
  tabActive:   "#F4F1EC",
  tabInactive: "#A39C90",
  tabBar:      "#0A0A09",

  // Bordes — blanco puro sobre azul daba un halo frío. Ahora es el mismo hueso del texto,
  // y solo tres niveles: filete 7% · marcado 13% · foco 45% (sin color, sin glow).
  border:      "rgba(244,241,236,0.07)",   // filete
  borderLight: "rgba(244,241,236,0.05)",

  // Sombra — SIEMPRE neutra. Existe como token para que nadie vuelva a teñir una sombra con
  // un color de acento: el resplandor de menta era de lo que más acercaba la app a cripto.
  shadow: "#000000",
};

// ─── Extended palette (advanced dashboard / charts) ───────────────────────────
// Variantes de color usadas por la sección Pro del dashboard. Mantenidas
// separadas de COLORS principal para evitar inflarlo con tonos de un solo uso.
// Los nombres de familia (rose, sky, teal) se conservan para no tocar 400+ call sites; los
// VALORES pasan al grafito cálido. Donde el nombre ya no describe el tono, lo dice el comentario.
export const EXTENDED_PALETTE = {
  // Danger soft family — ahora arcilla, no rosa
  rosePink:      "#E2A07E",   // texto/dot en banners de peligro
  rosePinkSoft:  "#EBB79B",   // sub-textos en danger
  rosePale:      "#F0CDB8",   // meta/captions danger
  rosePaleBg:    "#F6E2D5",   // títulos sobre banner danger
  rosePaleBgSoft:"#F8E9DF",   // labels secundarios danger
  wineDeep:      "#4E2A1E",   // fondo de banner de peligro (tierra quemada, no vino)

  // Info family — ahora acero, no lavanda
  skyPale:       "#CFDCF2",
  skyPaler:      "#D5E0F4",
  skySoft:       "#9DB2DE",   // textos info
  lavenderInk:   "#A9B7E0",
  indigoBg:      "#14120F",   // fondos de sección Pro (grafito cálido, no índigo)

  // Familia Pro / IA — era el menta de marca de gemini, ahora violeta exclusivo
  teal:          "#C0A6D8",   // shadow + acento de IA
  mintLight:     "#D3BFE6",   // textos sobre el acento
  mintLighter:   "#DECEF0",
  greenInk:      "#171320",   // texto sobre fondo de acento

  // Chart palette (donut, ring, sparklines)
  chartIndigo:   "#9DB2DE",   // transferencia
  chartTeal:     "#86CE96",   // ingreso
  chartCoral:    "#E2A07E",   // gasto
  chartGold:     "#D9B65C",   // advertencia
  chartViolet:   "#C0A6D8",   // Pro / IA
  chartFill:     "#8FBFB8",   // relleno para series largas — SIN significado

  // Pure
  white:         "#FFFFFF",
};

// ─── Chart palette ───────────────────────────────────────────────────────────
// Paleta semantica para charts (donut, ring, sparklines, advanced dashboard).
// Usar estos tokens en lugar de hex hardcoded. Cuando se necesite agregar mas
// tonos, extender aqui y reusar — no introducir hex inline en componentes.
//
// Los cinco primeros son los MISMOS tokens semánticos de COLORS, para que un donut de gastos
// por categoría no contradiga el color de la fila que lo alimenta. chartFill es relleno y no
// significa nada: solo aparece cuando la serie supera los cinco tramos.
export const CHART_PALETTE = {
  primary:   EXTENDED_PALETTE.chartIndigo,
  secondary: EXTENDED_PALETTE.chartTeal,
  tertiary:  EXTENDED_PALETTE.chartCoral,
  quaternary: EXTENDED_PALETTE.chartGold,
  series: [
    EXTENDED_PALETTE.chartIndigo,
    EXTENDED_PALETTE.chartTeal,
    EXTENDED_PALETTE.chartCoral,
    EXTENDED_PALETTE.chartGold,
    EXTENDED_PALETTE.chartViolet,
    EXTENDED_PALETTE.chartFill,
  ] as const,
};

// ─── Badge tones ─────────────────────────────────────────────────────────────
// Tonos para badges, dots y banners contextuales. Cada tono tiene un color de
// acento + un fondo translucido derivado. Usar en componentes en lugar de hex.
export const BADGE_TONES = {
  danger:  { accent: COLORS.dangerSoft, bg: COLORS.dangerMuted },
  warning: { accent: COLORS.warning,    bg: COLORS.warningMuted },
  success: { accent: COLORS.success,    bg: COLORS.successMuted },
  info:    { accent: COLORS.info,       bg: COLORS.infoMuted },
  neutral: { accent: COLORS.storm,      bg: "rgba(163,156,144,0.12)" },
  pro:     { accent: COLORS.pro,        bg: COLORS.proMuted },
};

// ─── Glassmorphism surfaces ───────────────────────────────────────────────────
// El vidrio se retira en la fase 3 y sobrevive solo en la barra inferior y el fondo de las
// hojas. Hasta entonces se recolorea igual, para que no queden islas azules en el grafito.
export const GLASS = {
  card:             "rgba(14,13,12,0.78)",
  cardBorder:       "rgba(244,241,236,0.13)",
  cardActive:       "rgba(134,206,150,0.10)",
  cardActiveBorder: "rgba(134,206,150,0.35)",
  input:            "rgba(14,13,12,0.70)",
  inputBorder:      "rgba(244,241,236,0.13)",
  // El foco pierde el color: sin tono y sin glow, solo más opacidad del mismo hueso.
  inputFocus:       "rgba(244,241,236,0.45)",
  sheetBorder:      "rgba(244,241,236,0.07)",
  tabBorder:        "rgba(244,241,236,0.07)",
  separator:        "rgba(244,241,236,0.07)",
  handle:           "rgba(244,241,236,0.20)",
  dangerBorder:     "rgba(226,160,126,0.30)",
  dangerBg:         "rgba(226,160,126,0.14)",
};

// ─── Sombras ──────────────────────────────────────────────────────────────────
// Rediseño fase 2: de seis niveles a DOS, y ninguno de color. Las sombras teñidas de menta
// eran, junto al azul y los radios grandes, lo que más acercaba la app a una interfaz de
// cripto. Y las tarjetas dejan de tener sombra: se separan por un paso de fondo y un filete.
type ShadowStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

const NO_SHADOW: ShadowStyle = {
  shadowColor: COLORS.shadow,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 0,
  shadowRadius: 0,
  elevation: 0,
};

export const SHADOW: Record<"none" | "floating" | "sheet", ShadowStyle> = {
  /** Tarjetas, filas, banners inline: sin sombra. */
  none: NO_SHADOW,
  /** Lo que de verdad flota sobre el contenido: FAB, toast, diálogo. */
  floating: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  /** Hojas: la sombra sube, no baja — separa la hoja del contenido que tapa. */
  sheet: {
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.6,
    shadowRadius: 44,
    elevation: 24,
  },
};

// ─── Material Elevation (alias de compatibilidad) ─────────────────────────────
// Se conservan las claves 0–5 para no tocar los 12 call sites `...ELEVATION[n]`, pero ya solo
// hay dos sombras detrás. 0–2 eran tarjetas y ahora no proyectan nada; 3–5 sí flotan.
// En código nuevo usar SHADOW.none / SHADOW.floating / SHADOW.sheet, que dicen la intención.
export const ELEVATION: Record<number, ShadowStyle> = {
  0: SHADOW.none,
  1: SHADOW.none,
  2: SHADOW.none,
  3: SHADOW.floating,
  4: SHADOW.floating,
  5: SHADOW.floating,
};

// ─── Material Surface Tokens (solid, non-glass) ───────────────────────────────
// Replacements for GLASS when migrating to Material Design elevation style.
// Keeps surface backgrounds as solid colors instead of translucent rgba.
// GLASS is kept for backward compatibility; migrate components progressively.
// Los bordes siguen los tres niveles del rediseño: filete 7% · marcado 13% · foco 45%.
// Todos en el hueso del texto (244,241,236), nunca en blanco puro: sobre grafito cálido el
// blanco puro deja un halo frío que es justo lo que se está quitando.
export const SURFACE = {
  card:             COLORS.mist,          // GLASS.card            → solid
  cardBorder:       "rgba(244,241,236,0.07)",   // filete
  cardActive:       COLORS.successMuted,  // GLASS.cardActive      → from COLORS
  cardActiveBorder: GLASS.cardActiveBorder,
  input:            COLORS.bgInput,       // un paso MÁS que la tarjeta (#252320)
  inputBorder:      "rgba(244,241,236,0.13)",   // marcado
  inputFocus:       GLASS.inputFocus,           // foco 45%, sin color
  sheet:            COLORS.void,          // BottomSheet bg        → solid
  sheetBorder:      "rgba(244,241,236,0.07)",   // filete
  tabBorder:        "rgba(244,241,236,0.07)",   // filete
  separator:        "rgba(244,241,236,0.07)",   // filete
  /// Chart / progress bar track backgrounds
  track:             "rgba(244,241,236,0.07)",   // progress bar base, chart fills
  /// Pressable feedback (cards, rows, list items en estado pressed)
  pressed:           "rgba(244,241,236,0.07)",
  /// Dimming layers for media overlays and modal backdrops
  imageScrim:        "rgba(0,0,0,0.38)",
  scrim:             "rgba(0,0,0,0.45)",
  scrimStrong:       "rgba(0,0,0,0.70)",
  /// Subtle divider/border (≤ inputBorder; for step indicators, chip dividers)
  subtleBorder:      "rgba(244,241,236,0.13)",  // marcado
  /// Subtle panel backgrounds (panels, chip lists)
  softBorder:        "rgba(244,241,236,0.07)",  // executive cards, preset cards
  /// Barely-there surface tint (always backgroundColor)
  subtle:            "rgba(244,241,236,0.045)", // explanation cards, metric cards
  /// Superficie profunda del panel de IA y centro del donut. El nombre quedó del azul
  /// original; el valor ya es grafito cálido. Renombrarlo toca 6 call sites — pendiente.
  deepNavy:          "rgba(10,10,9,0.96)",      // aiSummary shell, donut center
  dangerBorder:     GLASS.dangerBorder,
  dangerBg:         GLASS.dangerBg,
};

// ─── Spacing ──────────────────────────────────────────────────────────────────
export const SPACING = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
};

// ─── Border radius ────────────────────────────────────────────────────────────
// Rediseño fase 2: la escala se cierra entera. 12/18/22/28 es de las cosas que más hacen que
// la app se vea de plantilla — una tarjeta de reporte no es un globo. Cerrar el radio hace
// que las cifras alineadas parezcan columnas de un reporte, que es el registro que se busca.
export const RADIUS = {
  sm:    4,    // mini chips / tags          (era 12)
  md:    8,    // buttons, inputs, fields    (era 18)
  lg:   10,    // icon avatars / account icons (era 22)
  xl:   14,    // cards, modals              (era 28)
  sheet: 20,   // hojas — SOLO las esquinas de arriba
  full: 9999,  // badges, status pills
};

// ─── Material Shape (alias for RADIUS) ─────────────────────────────────────────
// Semantic name following Material Design 3 shape categories.
// Use when you want to express intent: SHAPE.small vs RADIUS.sm.
export const SHAPE = RADIUS;

// ─── Font sizes ───────────────────────────────────────────────────────────────
// La escala se CONSERVA: 11–32 ya estaba bien resuelta y migrarla no compra nada. Solo se
// suman los dos tamaños de cifra que el rediseño necesita, y llevan nombre semántico porque
// tienen un único uso cada uno.
export const FONT_SIZE = {
  xs:   11,   // labels de sección, encabezado de día
  sm:   13,   // metadatos, subtítulos, chips
  md:   15,   // título de fila, cuerpo, inputs
  lg:   17,   // monto de fila
  xl:   20,   // título de hoja
  xxl:  24,   // título de pantalla
  xxxl: 32,   // cifra de tarjeta
  display:     44,   // patrimonio neto
  amountInput: 46,   // el monto mientras lo escribes
};

// ─── Font weights ─────────────────────────────────────────────────────────────
export const FONT_WEIGHT = {
  regular:  "400" as const,
  medium:   "500" as const,
  semibold: "600" as const,
  bold:     "700" as const,
};

// ─── Font families ────────────────────────────────────────────────────────────
// Loaded via @expo-google-fonts in app/_layout.tsx
//
// Rediseño fase 4. Outfit → Archivo, Manrope → IBM Plex Sans:
//
// - Outfit es GEOMÉTRICA: las O y los ceros perfectamente circulares y de ancho uniforme son
//   justo lo que hace que un dashboard se vea de plantilla. Archivo es grotesca de reporte
//   impreso, trae cifras tabulares de verdad y a 44px sigue leyéndose de un vistazo al sol.
// - Manrope pierde detalle en la ñ, los acentos y la puntuación a 11–13px, que en ESPAÑOL
//   pesa mucho más que en inglés. Plex tiene terminales rectas, aperturas más grandes y
//   diacríticos diseñados para tamaño chico.
export const FONT_FAMILY = {
  heading:       "Archivo_600SemiBold",     // titles, KPIs, enteros del monto
  // El símbolo de moneda va un peso por debajo del número, dentro de la MISMA cifra: sabes
  // en qué moneda estás sin que la moneda compita con el importe.
  headingMedium: "Archivo_500Medium",
  body:          "IBMPlexSans_400Regular",  // body text, descriptions
  bodyMedium:    "IBMPlexSans_500Medium",   // labels, subtitles
  bodySemibold:  "IBMPlexSans_600SemiBold", // caps labels, button text
};
