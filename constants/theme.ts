// ─── Color palette ───────────────────────────────────────────────────────────
export const COLORS = {
  // Backgrounds — darkest to lightest
  canvas:  "transparent",   // root bg
  void:    "#090D12",   // sheets / modals
  shell:   "#0F141B",   // sidebars / navbars / tab bar
  mist:    "#141B24",   // cards

  // Aliases (keep compatibility with existing screens)
  bgDeep:  "transparent",
  bgVoid:  "#090D12",
  bg:      "transparent",
  bgCard:  "#141B24",
  bgInput: "#141B24",
  bgModal: "#090D12",

  // Text
  ink:     "#F5F7FB",   // primary text
  storm:   "#96A2B5",   // secondary / placeholders / muted icons
  text:    "#F5F7FB",
  textMuted:    "#96A2B5",
  textDisabled: "#4A5568",
  textInverse:  "#05070B",

  // Accents
  pine:     "#6BE4C5",  // primary action, success, focus
  ember:    "#8EA5FF",  // info, secondary, pending
  gold:     "#D7BE7B",  // alerts, warnings, due dates
  rosewood: "#FF8F9E",  // errors, danger, destructive

  // Aliases
  primary:     "#6BE4C5",
  primaryDark: "#4BC9A8",
  secondary:   "#8EA5FF",
  danger:      "#FF8F9E",
  dangerMuted: "rgba(255,143,158,0.12)",
  success:     "#6BE4C5",
  successMuted: "rgba(107,228,197,0.12)",
  warning:     "#D7BE7B",
  warningMuted: "rgba(215,190,123,0.12)",
  info:        "#8EA5FF",
  infoMuted:   "rgba(142,165,255,0.12)",

  // Financial
  income:   "#6BE4C5",
  expense:  "#FF8F9E",
  transfer: "#8EA5FF",
  neutral:  "#96A2B5",

  // Budget progress
  budgetGood: "#6BE4C5",
  budgetWarn: "#D7BE7B",
  budgetOver: "#FF8F9E",

  // Tab bar
  tabActive:   "#6BE4C5",
  tabInactive: "#96A2B5",
  tabBar:      "#0F141B",

  // Legacy border (solid fallback)
  border:      "rgba(255,255,255,0.10)",
  borderLight: "rgba(255,255,255,0.06)",
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
