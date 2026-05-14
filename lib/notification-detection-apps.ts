export type FinancialAppKey =
  | "yape"
  | "plin"
  | "bcp"
  | "interbank"
  | "bbva"
  | "scotiabank"
  | "google_wallet"
  | "gmail_financial";

export type FinancialAppDefinition = {
  key: FinancialAppKey;
  label: string;
  subtitle: string;
  packageNames: string[];
  defaultEnabled?: boolean;
};

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
