/**
 * Iconos de categoría alineados con la web: nombres tipo Lucide (kebab-case en UI/BD).
 * Los emojis antiguos en BD se muestran como fallback en lista; al editar se sugiere elegir un icono Lucide.
 */
import type { LucideIcon } from "lucide-react-native";
import {
  Tag,
  Utensils,
  UtensilsCrossed,
  Car,
  Home,
  ShoppingBag,
  ShoppingCart,
  Heart,
  Briefcase,
  Coffee,
  Film,
  Plane,
  Gift,
  Smartphone,
  Dog,
  Pill,
  BookOpen,
  Wallet,
  Bus,
  Train,
  Bike,
  Fuel,
  Zap,
  Droplets,
  Shirt,
  Gamepad2,
  Music,
  Building2,
  Landmark,
  PiggyBank,
  Receipt,
  Stethoscope,
  Dumbbell,
  Baby,
  PawPrint,
  Wrench,
  Lightbulb,
  Tv,
  Wifi,
  CreditCard,
  Coins,
  CircleDollarSign,
} from "lucide-react-native";

/** Valor por defecto al crear categoría (mismo criterio que web / seed). */
export const DEFAULT_CATEGORY_ICON_KEY = "home";

/**
 * Iconos disponibles en el selector del formulario (orden UI).
 * Se guardan en `categories.icon` en kebab-case para coincidir con Lucide / web.
 */
export const CATEGORY_ICON_PICKER_KEYS = [
  "home",
  "car",
  "utensils",
  "utensils-crossed",
  "pill",
  "book-open",
  "plane",
  "piggy-bank",
  "film",
  "shirt",
  "dog",
  "zap",
  "smartphone",
  "shopping-bag",
  "shopping-cart",
  "heart",
  "briefcase",
  "coffee",
  "gift",
  "bus",
  "train",
  "bike",
  "landmark",
  "wallet",
  "credit-card",
  "receipt",
  "building-2",
  "stethoscope",
  "tag",
] as const;

export type CategoryIconPickerKey = (typeof CATEGORY_ICON_PICKER_KEYS)[number];

/** Mapa normalizado (lowercase + guiones bajos) → componente Lucide. */
export const LUCIDE_BY_KEY: Record<string, LucideIcon> = {
  tag: Tag,
  utensils: Utensils,
  utensils_crossed: UtensilsCrossed,
  forkknife: Utensils,
  "fork-knife": Utensils,
  car: Car,
  home: Home,
  house: Home,
  shoppingbag: ShoppingBag,
  shopping_bag: ShoppingBag,
  "shopping-bag": ShoppingBag,
  shoppingcart: ShoppingCart,
  shopping_cart: ShoppingCart,
  "shopping-cart": ShoppingCart,
  heart: Heart,
  briefcase: Briefcase,
  coffee: Coffee,
  film: Film,
  plane: Plane,
  gift: Gift,
  smartphone: Smartphone,
  phone: Smartphone,
  mobile: Smartphone,
  dog: Dog,
  pill: Pill,
  pills: Pill,
  book: BookOpen,
  bookopen: BookOpen,
  book_open: BookOpen,
  "book-open": BookOpen,
  wallet: Wallet,
  bus: Bus,
  train: Train,
  bike: Bike,
  fuel: Fuel,
  zap: Zap,
  droplets: Droplets,
  water: Droplets,
  shirt: Shirt,
  gamepad: Gamepad2,
  gamepad2: Gamepad2,
  music: Music,
  building: Building2,
  building2: Building2,
  building_2: Building2,
  "building-2": Building2,
  bank: Landmark,
  landmark: Landmark,
  piggybank: PiggyBank,
  piggy_bank: PiggyBank,
  "piggy-bank": PiggyBank,
  receipt: Receipt,
  stethoscope: Stethoscope,
  dumbbell: Dumbbell,
  baby: Baby,
  pawprint: PawPrint,
  paw_print: PawPrint,
  "paw-print": PawPrint,
  wrench: Wrench,
  lightbulb: Lightbulb,
  tv: Tv,
  wifi: Wifi,
  creditcard: CreditCard,
  credit_card: CreditCard,
  "credit-card": CreditCard,
  coins: Coins,
  circledollarsign: CircleDollarSign,
  circle_dollar_sign: CircleDollarSign,
  "circle-dollar-sign": CircleDollarSign,
  dollar: CircleDollarSign,
};

export function normalizeIconLookupKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/-/g, "_");
}

/** true si el string parece clave Lucide (no emoji suelto). */
export function looksLikeLucideIconKey(s: string): boolean {
  return /^[a-z0-9_-]+$/i.test(s.trim());
}

/** Convierte valor de BD a clave del picker (kebab). */
export function iconKeyForFormState(stored: string | null | undefined): string {
  if (!stored?.trim()) return DEFAULT_CATEGORY_ICON_KEY;
  const t = stored.trim();
  if (!looksLikeLucideIconKey(t)) return DEFAULT_CATEGORY_ICON_KEY;
  return t.toLowerCase().replace(/_/g, "-");
}

/** Resuelve componente Lucide; fallback Tag. */
export function getLucideIconForCategory(stored: string | null | undefined): LucideIcon {
  if (!stored?.trim()) return Tag;
  const k = normalizeIconLookupKey(stored);
  return LUCIDE_BY_KEY[k] ?? Tag;
}
