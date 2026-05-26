export type FinancialAppKey =
  | "yape"
  | "plin"
  | "bcp"
  | "interbank"
  | "bbva"
  | "scotiabank"
  | "banbif"
  | "banco_nacion"
  | "mibanco"
  | "pichincha"
  | "banco_falabella"
  | "banco_ripley"
  | "caja_arequipa"
  | "caja_huancayo"
  | "caja_cusco"
  | "caja_sullana"
  | "caja_trujillo"
  | "caja_piura"
  | "tunki"
  | "google_wallet"
  | "gmail_financial";

export type FinancialAppDefinition = {
  key: FinancialAppKey;
  label: string;
  subtitle: string;
  packageNames: string[];
  defaultEnabled?: boolean;
  /** ISO country code. Default "PE". Used for future multi-country support. */
  country?: string;
};

// Package names for newly added Peruvian banks/wallets (banbif, banco_nacion, mibanco,
// pichincha, banco_falabella, banco_ripley, caja_*, tunki) were sourced from public
// listings and have NOT been verified by installing each app. They are marked
// defaultEnabled:false so users opt in only after their bank actually triggers a detection.
// If a user reports a missing detection, verify the actual package via:
//   adb shell pm list packages | grep -i <bank>
export const FINANCIAL_APPS: FinancialAppDefinition[] = [
  {
    key: "yape",
    label: "Yape",
    subtitle: "Pagos y transferencias de Yape",
    packageNames: ["com.bcp.innovacxion.yapeapp"],
  },
  {
    key: "plin",
    label: "Plin",
    subtitle: "Operaciones Plin desde apps bancarias",
    packageNames: [
      "com.bcp.innovacxion.yapeapp",
      "pe.com.interbank.mobilebanking",
      "com.bbva.nxt_peru",
      "pe.com.scotiabank.blpm.android.client",
    ],
  },
  {
    key: "bcp",
    label: "BCP",
    subtitle: "Notificaciones del banco",
    packageNames: ["com.bcp.bank.bcp", "com.bcp.innovacxion.yapeapp"],
  },
  {
    key: "interbank",
    label: "Interbank",
    subtitle: "Notificaciones del banco",
    packageNames: ["pe.com.interbank.mobilebanking"],
  },
  {
    key: "bbva",
    label: "BBVA",
    subtitle: "Notificaciones del banco",
    packageNames: ["com.bbva.nxt_peru"],
  },
  {
    key: "scotiabank",
    label: "Scotiabank",
    subtitle: "Notificaciones del banco",
    packageNames: ["pe.com.scotiabank.blpm.android.client"],
  },
  {
    key: "banbif",
    label: "BanBif",
    subtitle: "Notificaciones del banco",
    packageNames: ["pe.com.banbif.mobilebanking"],
    defaultEnabled: false,
  },
  {
    key: "banco_nacion",
    label: "Banco de la Nación",
    subtitle: "Notificaciones del banco",
    packageNames: ["pe.gob.bn.bnmasapp"],
    defaultEnabled: false,
  },
  {
    key: "mibanco",
    label: "Mibanco",
    subtitle: "Notificaciones del banco",
    packageNames: ["pe.com.mibanco.mibancoapp"],
    defaultEnabled: false,
  },
  {
    key: "pichincha",
    label: "Banco Pichincha",
    subtitle: "Notificaciones del banco",
    packageNames: ["pe.com.pichincha.pichinchapp"],
    defaultEnabled: false,
  },
  {
    key: "banco_falabella",
    label: "Banco Falabella",
    subtitle: "Notificaciones del banco",
    packageNames: ["pe.com.bancofalabella.movil"],
    defaultEnabled: false,
  },
  {
    key: "banco_ripley",
    label: "Banco Ripley",
    subtitle: "Notificaciones del banco",
    packageNames: ["com.bancoripley.bancoripleyapp"],
    defaultEnabled: false,
  },
  {
    key: "caja_arequipa",
    label: "Caja Arequipa",
    subtitle: "Notificaciones de la caja",
    packageNames: ["pe.com.cajaarequipa.app"],
    defaultEnabled: false,
  },
  {
    key: "caja_huancayo",
    label: "Caja Huancayo",
    subtitle: "Notificaciones de la caja",
    packageNames: ["pe.com.cajahuancayo.app"],
    defaultEnabled: false,
  },
  {
    key: "caja_cusco",
    label: "Caja Cusco",
    subtitle: "Notificaciones de la caja",
    packageNames: ["pe.com.cajacusco.app"],
    defaultEnabled: false,
  },
  {
    key: "caja_sullana",
    label: "Caja Sullana",
    subtitle: "Notificaciones de la caja",
    packageNames: ["pe.com.cajasullana.app"],
    defaultEnabled: false,
  },
  {
    key: "caja_trujillo",
    label: "Caja Trujillo",
    subtitle: "Notificaciones de la caja",
    packageNames: ["pe.com.cajatrujillo.app"],
    defaultEnabled: false,
  },
  {
    key: "caja_piura",
    label: "Caja Piura",
    subtitle: "Notificaciones de la caja",
    packageNames: ["pe.com.cajapiura.app"],
    defaultEnabled: false,
  },
  {
    key: "tunki",
    label: "Tunki",
    subtitle: "Pagos y transferencias de Tunki",
    packageNames: ["pe.com.interbank.tunki"],
    defaultEnabled: false,
  },
  {
    key: "google_wallet",
    label: "Google Wallet",
    subtitle: "Pagos con Google Wallet",
    packageNames: ["com.google.android.apps.walletnfcrel"],
  },
  {
    key: "gmail_financial",
    label: "Correos bancarios",
    subtitle: "Alertas transaccionales de bancos peruanos recibidas en Gmail",
    packageNames: ["com.google.android.gm"],
    defaultEnabled: false,
  },
];

export function getFinancialAppByKey(key?: string | null) {
  return FINANCIAL_APPS.find((app) => app.key === key) ?? null;
}

export function resolveFinancialAppByPackage(packageName?: string | null) {
  if (!packageName) return null;
  return FINANCIAL_APPS.find((app) => app.packageNames.includes(packageName)) ?? null;
}

export function packageNamesForEnabledApps(enabledKeys: string[]) {
  const packages = new Set<string>();
  for (const app of FINANCIAL_APPS) {
    if (!enabledKeys.includes(app.key)) continue;
    app.packageNames.forEach((packageName) => packages.add(packageName));
  }
  return [...packages];
}
