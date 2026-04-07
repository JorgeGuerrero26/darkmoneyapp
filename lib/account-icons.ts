import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BadgeDollarSign,
  Banknote,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Briefcase,
  Building2,
  ChartColumn,
  ChartColumnDecreasing,
  ChartColumnIncreasing,
  CircleDollarSign,
  Coins,
  CreditCard,
  Gem,
  HandCoins,
  Landmark,
  PiggyBank,
  Receipt,
  ReceiptText,
  Shield,
  Target,
  TrendingDown,
  TrendingUp,
  Vault,
  Wallet2,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";

export type AccountIconOption = {
  value: string;
  label: string;
  Icon: LucideIcon;
};

export const ACCOUNT_ICON_OPTIONS: AccountIconOption[] = [
  { value: "wallet", label: "Billetera", Icon: Wallet2 },
  { value: "wallet-cards", label: "Tarjetero", Icon: WalletCards },
  { value: "landmark", label: "Banco", Icon: Landmark },
  { value: "building-2", label: "Edificio", Icon: Building2 },
  { value: "piggy-bank", label: "Ahorros", Icon: PiggyBank },
  { value: "credit-card", label: "Tarjeta", Icon: CreditCard },
  { value: "banknote", label: "Billete", Icon: Banknote },
  { value: "banknote-arrow-up", label: "Ingreso", Icon: BanknoteArrowUp },
  { value: "banknote-arrow-down", label: "Salida", Icon: BanknoteArrowDown },
  { value: "arrow-up", label: "Flecha arriba", Icon: ArrowUp },
  { value: "arrow-down", label: "Flecha abajo", Icon: ArrowDown },
  { value: "arrow-left-right", label: "Transferencia", Icon: ArrowLeftRight },
  { value: "coins", label: "Monedas", Icon: Coins },
  { value: "hand-coins", label: "Cobranza", Icon: HandCoins },
  { value: "circle-dollar-sign", label: "Dinero", Icon: CircleDollarSign },
  { value: "badge-dollar-sign", label: "Precio", Icon: BadgeDollarSign },
  { value: "trending-up", label: "Crecimiento", Icon: TrendingUp },
  { value: "trending-down", label: "Caida", Icon: TrendingDown },
  { value: "chart-column", label: "Grafico", Icon: ChartColumn },
  { value: "chart-column-increasing", label: "Grafico arriba", Icon: ChartColumnIncreasing },
  { value: "chart-column-decreasing", label: "Grafico abajo", Icon: ChartColumnDecreasing },
  { value: "briefcase", label: "Portafolio", Icon: Briefcase },
  { value: "gem", label: "Inversion", Icon: Gem },
  { value: "shield", label: "Respaldo", Icon: Shield },
  { value: "target", label: "Meta", Icon: Target },
  { value: "receipt", label: "Comprobante", Icon: Receipt },
  { value: "receipt-text", label: "Recibo", Icon: ReceiptText },
  { value: "vault", label: "Caja fuerte", Icon: Vault },
];

const ACCOUNT_ICON_MAP: Record<string, LucideIcon> = ACCOUNT_ICON_OPTIONS.reduce<Record<string, LucideIcon>>(
  (acc, option) => {
    acc[option.value] = option.Icon;
    return acc;
  },
  {},
);

const ACCOUNT_TYPE_ICON_FALLBACKS: Record<string, string> = {
  cash: "banknote",
  bank: "landmark",
  savings: "piggy-bank",
  credit_card: "credit-card",
  investment: "trending-up",
  loan: "briefcase",
  loan_wallet: "wallet",
  checking: "wallet-cards",
  other: "wallet",
};

export function getAccountIcon(iconName?: string | null, accountType?: string | null): LucideIcon {
  const normalizedIcon = iconName?.trim().toLowerCase() ?? "";
  if (normalizedIcon && ACCOUNT_ICON_MAP[normalizedIcon]) {
    return ACCOUNT_ICON_MAP[normalizedIcon];
  }

  const fallbackIcon = accountType ? ACCOUNT_TYPE_ICON_FALLBACKS[accountType] : null;
  if (fallbackIcon && ACCOUNT_ICON_MAP[fallbackIcon]) {
    return ACCOUNT_ICON_MAP[fallbackIcon];
  }

  return Wallet2;
}

export function getAccountIconOption(iconName?: string | null): AccountIconOption | null {
  if (!iconName) return null;
  const normalizedIcon = iconName.trim().toLowerCase();
  return ACCOUNT_ICON_OPTIONS.find((option) => option.value === normalizedIcon) ?? null;
}
