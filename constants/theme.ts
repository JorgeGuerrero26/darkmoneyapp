export const COLORS = {
  // Brand accents
  primary: "#6be4c5",       // pine — verde agua (botones primarios, focus)
  primaryDark: "#4bc9a8",
  primaryLight: "#a8f0de",
  secondary: "#8ea5ff",     // ember — azul lavanda
  gold: "#d7be7b",          // gold — alertas, notificaciones
  danger: "#ff8f9e",        // rosewood — error/peligro
  dangerMuted: "#4a1a22",

  // Backgrounds (de más oscuro a más claro)
  bgDeep: "#05070b",        // canvas
  bgVoid: "#090d12",        // void
  bg: "#0f141b",            // shell — fondo principal de la app
  bgCard: "#141b24",        // mist — cards
  bgCardHover: "#1a2333",
  bgInput: "#141b24",
  bgModal: "#141b24",

  // Text
  text: "#f5f7fb",          // ink — texto principal
  textMuted: "#96a2b5",     // storm — secundario / placeholders
  textDisabled: "#4a5568",
  textInverse: "#05070b",

  // Status
  success: "#6be4c5",       // pine
  successMuted: "#0d2e27",
  warning: "#d7be7b",       // gold
  warningMuted: "#2e2510",
  info: "#8ea5ff",          // ember
  infoMuted: "#1a2040",

  // Financial
  income: "#6be4c5",
  expense: "#ff8f9e",
  transfer: "#8ea5ff",
  neutral: "#96a2b5",

  // Borders
  border: "#1e2a38",
  borderLight: "#141b24",

  // Budget progress
  budgetGood: "#6be4c5",
  budgetWarn: "#d7be7b",
  budgetOver: "#ff8f9e",

  // Tab bar
  tabActive: "#6be4c5",
  tabInactive: "#96a2b5",
  tabBar: "#0f141b",
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
};

export const FONT_SIZE = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  xxxl: 30,
};

export const FONT_WEIGHT = {
  regular: "400" as const,
  medium: "500" as const,
  semibold: "600" as const,
  bold: "700" as const,
};
