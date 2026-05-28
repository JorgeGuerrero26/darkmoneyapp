// ─── Color palette ───────────────────────────────────────────────────────────
export const COLORS = {
  // Backgrounds — darkest to lightest
  canvas:  "transparent",   // root bg
  void:    "#090D12",   // sheets / modals
  shell:   "#0F141B",   // sidebars / navbars / tab bar
  mist:    "#161F2A",   // cards (slightly separated from shell)

  // Aliases (keep compatibility with existing screens)
  bgDeep:  "transparent",
  bgVoid:  "#090D12",
  bg:      "transparent",
  bgCard:  "#161F2A",   // matches mist
  bgInput: "#161F2A",   // matches mist
  bgModal: "#090D12",

  // Text
  ink:     "#F5F7FB",   // primary text
  storm:   "#96A2B5",   // secondary / placeholders / muted icons
  fog:     "#A7B2C2",   // subtitles, metadata, stats, chips
  text:    "#F5F7FB",
  textMuted:    "#96A2B5",
  textDisabled: "#4A5568",
  textInverse:  "#05070B",

  // Accents
  pine:     "#6BE4C5",  // primary action, success, focus
  ember:    "#8EA5FF",  // info, secondary, pending
  gold:     "#D7BE7B",  // alerts, warnings, due dates
  // Danger split: soft for financial loss, strong for destructive actions
  dangerSoft:   "#FF8F9E",  // expenses, negative balance, debt (was rosewood)
  dangerStrong: "#FF637D",  // delete, error, validation, destructive

  // Aliases
  primary:     "#6BE4C5",
  primaryDark: "#4BC9A8",
  secondary:   "#8EA5FF",
  danger:      "#FF637D",   // now points to dangerStrong (destructive actions)
  rosewood:    "#FF8F9E",   // kept for backward compat (financial loss)
  dangerMuted: "rgba(255,143,158,0.12)",
  success:     "#6BE4C5",
  successMuted: "rgba(107,228,197,0.12)",
  warning:     "#D7BE7B",
  warningMuted: "rgba(215,190,123,0.12)",
  info:        "#8EA5FF",
  infoMuted:   "rgba(142,165,255,0.12)",

  // Financial
  income:   "#6BE4C5",
  expense:  "#FF8F9E",   // keeps soft (spending ≠ error)
  transfer: "#8EA5FF",
  neutral:  "#96A2B5",

  // Budget progress
  budgetGood: "#6BE4C5",
  budgetWarn: "#D7BE7B",
  budgetOver: "#FF8F9E",  // keeps soft (overspending ≠ destructive)

  // Tab bar
  tabActive:   "#6BE4C5",
  tabInactive: "#96A2B5",
  tabBar:      "#0F141B",

  // Legacy border (solid fallback)
  border:      "rgba(255,255,255,0.10)",
  borderLight: "rgba(255,255,255,0.06)",
};

// ─── Extended palette (advanced dashboard / charts) ───────────────────────────
// Variantes de color usadas por la sección Pro del dashboard. Mantenidas
// separadas de COLORS principal para evitar inflarlo con tonos de un solo uso.
export const EXTENDED_PALETTE = {
  // Rose / danger soft family
  rosePink:      "#FF9DBA",   // texto/dot en banners de peligro
  rosePinkSoft:  "#FFB7C3",   // sub-textos en danger
  rosePale:      "#FFD1D9",   // meta/captions danger
  rosePaleBg:    "#FFE3E8",   // títulos sobre banner danger
  rosePaleBgSoft:"#FFE8EC",   // labels secundarios danger
  wineDeep:      "#7F1020",   // fondo de banner de peligro

  // Sky / lavender / info family
  skyPale:       "#C8E8FF",
  skyPaler:      "#CFE0FF",
  skySoft:       "#9EB7FF",   // gemini accent + textos info
  lavenderInk:   "#9EA9FF",
  indigoBg:      "#0B1020",   // fondos de sección Pro

  // Teal / mint family (gemini brand)
  teal:          "#49D7BE",   // shadow + gemini brand
  mintLight:     "#7FE8D4",   // textos sobre teal
  mintLighter:   "#9BEDE0",
  greenInk:      "#06110F",   // texto sobre fondo verde

  // Chart palette (donut, ring, sparklines)
  chartIndigo:   "#5C8DFF",
  chartTeal:     "#49D7BE",
  chartCoral:    "#FF7D8D",
  chartGold:     "#FFD15C",

  // Pure
  white:         "#FFFFFF",
};

// ─── Chart palette ───────────────────────────────────────────────────────────
// Paleta semantica para charts (donut, ring, sparklines, advanced dashboard).
// Usar estos tokens en lugar de hex hardcoded. Cuando se necesite agregar mas
// tonos, extender aqui y reusar — no introducir hex inline en componentes.
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
  neutral: { accent: COLORS.storm,      bg: "rgba(150,162,181,0.12)" },
};

// ─── Glassmorphism surfaces ───────────────────────────────────────────────────
export const GLASS = {
  card:             "rgba(10,14,20,0.78)",
  cardBorder:       "rgba(255,255,255,0.18)",
  cardActive:       "rgba(107,228,197,0.10)",
  cardActiveBorder: "rgba(107,228,197,0.35)",
  input:            "rgba(10,14,20,0.70)",
  inputBorder:      "rgba(255,255,255,0.14)",
  inputFocus:       "rgba(107,228,197,0.30)",
  sheetBorder:      "rgba(255,255,255,0.14)",
  tabBorder:        "rgba(255,255,255,0.12)",
  separator:        "rgba(255,255,255,0.10)",
  handle:           "rgba(255,255,255,0.20)",
  dangerBorder:     "rgba(255,143,158,0.30)",
  dangerBg:         "rgba(255,143,158,0.14)",
};

// ─── Material Elevation (standard elevation scale) ────────────────────────────
// Each level provides shadow props for React Native `style`.
// Usage: style={ELEVATION[2]}
export const ELEVATION: Record<
  number,
  {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  }
> = {
  0: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  1: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  2: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  3: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  4: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  5: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.30,
    shadowRadius: 24,
    elevation: 24,
  },
};

// ─── Material Surface Tokens (solid, non-glass) ───────────────────────────────
// Replacements for GLASS when migrating to Material Design elevation style.
// Keeps surface backgrounds as solid colors instead of translucent rgba.
// GLASS is kept for backward compatibility; migrate components progressively.
export const SURFACE = {
  card:             COLORS.mist,          // GLASS.card            → solid
  cardBorder:       "rgba(255,255,255,0.10)",   // GLASS.cardBorder  → subtler
  cardActive:       COLORS.successMuted,  // GLASS.cardActive      → from COLORS
  cardActiveBorder: GLASS.cardActiveBorder,
  input:            COLORS.mist,          // GLASS.input           → solid
  inputBorder:      "rgba(255,255,255,0.12)",   // GLASS.inputBorder → subtler
  inputFocus:       GLASS.inputFocus,
  sheet:            COLORS.void,          // BottomSheet bg        → solid
  sheetBorder:      "rgba(255,255,255,0.10)",   // GLASS.sheetBorder → subtler
  tabBorder:        "rgba(255,255,255,0.10)",   // GLASS.tabBorder   → subtler
  separator:        "rgba(255,255,255,0.08)",   // GLASS.separator   → subtler
  /// Chart / progress bar track backgrounds
  track:             "rgba(255,255,255,0.07)",   // progress bar base, chart fills
  /// Pressable feedback (cards, rows, list items en estado pressed)
  pressed:           "rgba(255,255,255,0.07)",
  /// Subtle divider/border (≤ inputBorder; for step indicators, chip dividers)
  subtleBorder:      "rgba(255,255,255,0.12)",
  /// Subtle panel backgrounds (panels, chip lists)
  softBorder:        "rgba(255,255,255,0.11)",   // executive cards, preset cards
  /// Barely-there surface tint (always backgroundColor)
  subtle:            "rgba(255,255,255,0.045)",  // explanation cards, metric cards
  /// Premium deep navy for AI summary shell, donut center
  deepNavy:          "rgba(7,11,22,0.96)",       // aiSummary shell, donut center
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
export const RADIUS = {
  sm:   12,    // mini chips / tags
  md:   18,    // buttons, inputs, fields
  lg:   22,    // icon avatars / account icons
  xl:   28,    // cards, modals, sheets
  full: 9999,  // badges, status pills
};

// ─── Material Shape (alias for RADIUS) ─────────────────────────────────────────
// Semantic name following Material Design 3 shape categories.
// Use when you want to express intent: SHAPE.small vs RADIUS.sm.
export const SHAPE = RADIUS;

// ─── Font sizes ───────────────────────────────────────────────────────────────
export const FONT_SIZE = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  24,
  xxxl: 32,
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
export const FONT_FAMILY = {
  heading:      "Outfit_600SemiBold",   // titles, KPIs
  body:         "Manrope_400Regular",   // body text, descriptions
  bodyMedium:   "Manrope_500Medium",    // labels, subtitles
  bodySemibold: "Manrope_600SemiBold",  // caps labels, button text
};
