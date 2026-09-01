import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { AmountDisplay } from "../../../components/ui/AmountDisplay";
import { SwipeActionRow } from "../../../components/ui/SwipeActionRow";
import { Copy, Trash2 } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { parseDisplayDate } from "../../../lib/date";
import {
  movementActsAsIncome,
  movementDisplayAmount,
  movementDisplayPrefix,
} from "../../../lib/movement-display";
import { useUiStore } from "../../../store/ui-store";
import type { MovementRecord } from "../../../types/domain";

type Props = {
  movement: MovementRecord;
  baseCurrencyCode: string;
  /** La cuenta desde la que se está mirando: decide el título y el signo. */
  accountId: number;
  accountCurrencyCode?: string | null;
  onPress: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
};

const TYPE_WORD: Record<string, string> = {
  transfer: "transferencia",
  income: "ingreso",
  refund: "devolución",
  expense: "gasto",
  subscription_payment: "suscripción",
  obligation_payment: "cobro de obligación",
  obligation_opening: "apertura",
  adjustment: "ajuste",
};

/**
 * El título de la fila nombra **la otra cuenta**, no la que estás mirando.
 *
 * Dentro de "Cuenta Sueldo", cuatro transferencias se titulaban "Cuenta Sueldo" —el único dato
 * que ya sabes— y se veían idénticas: mismo título, misma etiqueta, misma fecha, y solo el monto
 * las distinguía. Es la misma falla del campo "motivo" del PDF: el sitio donde va lo que
 * identifica la fila, ocupado por algo constante. Lo que falta es a dónde fue la plata.
 */
function transferTitle(movement: MovementRecord, accountId: number): string {
  const salioDeAqui = movement.sourceAccountId === accountId;
  const otherName = salioDeAqui
    ? movement.destinationAccountName ?? (movement.destinationAccountId != null ? `Cuenta #${movement.destinationAccountId}` : null)
    : movement.sourceAccountName ?? (movement.sourceAccountId != null ? `Cuenta #${movement.sourceAccountId}` : null);
  if (!otherName) return movement.description?.trim() || "Transferencia";
  return salioDeAqui ? `A ${otherName}` : `De ${otherName}`;
}

/**
 * Una fila de movimiento vista desde una cuenta.
 *
 * Sin ícono de tipo y sin cápsula de color: cuatro cuadrados idénticos en columna no distinguen
 * nada, y la palabra "Transferencia" repetida cuatro veces al lado de un ícono que dice lo mismo,
 * debajo de un título que también lo decía, es la misma cosa dicha tres veces. El tipo baja al
 * subtítulo, en gris, junto a la fecha — y el título recupera el ancho que le faltaba.
 */
export const AccountMovementRow = memo(function AccountMovementRow({
  movement,
  baseCurrencyCode,
  accountId,
  accountCurrencyCode,
  onPress,
  onDelete,
  onDuplicate,
}: Props) {
  useUiStore((state) => state.privacyMode);

  const isTransfer = movement.movementType === "transfer";
  const leftThisAccount = isTransfer && movement.sourceAccountId === accountId;

  const title = isTransfer
    ? transferTitle(movement, accountId)
    : movement.description?.trim() || "Sin descripción";

  const dateLabel = format(parseDisplayDate(movement.occurredAt), "d MMM", { locale: es });
  const typeWord = TYPE_WORD[movement.movementType] ?? movement.movementType;
  const subtitle = [dateLabel, typeWord].filter(Boolean).join(" · ");

  const amount = isTransfer
    ? (leftThisAccount ? movement.sourceAmount : movement.destinationAmount) ?? movementDisplayAmount(movement)
    : movementDisplayAmount(movement);
  const currencyCode = accountCurrencyCode
    ?? movement.sourceCurrencyCode
    ?? movement.destinationCurrencyCode
    ?? baseCurrencyCode;

  // El color solo lo lleva lo que entra: un gasto en rojo repetido en cada fila pinta la lista
  // entera de alarma. Una transferencia no gana ni pierde nada, así que va en hueso.
  const entra = isTransfer ? !leftThisAccount : movementActsAsIncome(movement);
  const prefix = movement.movementType === "obligation_payment"
    ? movementDisplayPrefix(movement)
    : entra ? "+" : "−";
  const amountColor = entra && !isTransfer ? COLORS.income : COLORS.ink;

  const row = (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.78} accessibilityRole="button">
      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <AmountDisplay
        flat
        amount={Math.abs(amount)}
        currencyCode={currencyCode}
        size="md"
        color={amountColor}
        prefix={prefix}
      />
    </TouchableOpacity>
  );

  if (!onDelete && !onDuplicate) return row;

  return (
    <SwipeActionRow
      revealWidth={80}
      borderRadius={0}
      leftAction={onDuplicate ? {
        label: "Repetir",
        icon: Copy,
        color: COLORS.fog,
        backgroundColor: SURFACE.cardActive,
        onPress: onDuplicate,
      } : null}
      rightAction={onDelete ? {
        label: "Eliminar",
        icon: Trash2,
        color: COLORS.danger,
        backgroundColor: COLORS.danger + "28",
        haptic: "warning",
        onPress: onDelete,
      } : null}
    >
      {row}
    </SwipeActionRow>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  copy: { flex: 1, gap: 2 },
  title: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
});
