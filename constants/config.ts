export const MOVEMENTS_PAGE_SIZE = 30;

/** Eventos por página en historial de obligaciones (análisis y detalle). */
export const OBLIGATION_EVENT_HISTORY_PAGE_SIZE = 8;

export const UPCOMING_DAYS_WINDOW = 7;

export const TOAST_DURATION_MS = 3000;

export const BUDGET_WARN_DEFAULT_PERCENT = 80;

export const SUPABASE_STORAGE_BUCKET = "receipts";

export const APP_SCHEME = "darkmoney";

/** Hostname para Universal Links / App Links (mismo que en correo: https://HOST/share/obligations/...). */
export const UNIVERSAL_LINK_HOST = process.env.EXPO_PUBLIC_UNIVERSAL_LINK_HOST?.trim() ?? "";
