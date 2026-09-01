import { memo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { isoToDateStr, isoToTimeStr, parseDisplayDate, todayPeru } from "../../../../lib/date";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";
import type { MovementRecord } from "../../../../types/domain";
import { MovementDetailRow } from "./MovementDetailRow";

type Props = {
  movement: MovementRecord;
  isTransfer: boolean;
  isExpense: boolean;
  transferSourceCurrencyCode: string;
  transferDestinationCurrencyCode: string;
  fxRate: number | null;
  attachmentsCount: number;
  attachmentsLoading: boolean;
  onPressAttachments: () => void;
  /** Lo que se enseña bajo la fila de comprobantes cuando está abierta. */
  attachmentsSlot?: ReactNode;
  obligationId: number | null | undefined;
  obligationTitle: string | null;
  subscriptionId: number | null | undefined;
  subscriptionName: string | null;
  canLink: boolean;
  onPressObligation: (obligationId: number) => void;
  onPressSubscription: (subscriptionId: number) => void;
  onRequestLink: () => void;
};

/**
 * "Hoy, 12:21" — y la hora, que hasta ahora solo aparecía en Historial.
 *
 * La fecha decía "31 de agosto 2026" (sin el "de", además) el mismo día en que se registró: es
 * la fecha que menos falta hace escribir completa.
 */
function formatWhen(occurredAt: string) {
  const day = isoToDateStr(occurredAt);
  const time = isoToTimeStr(occurredAt);
  const today = todayPeru();
  if (day === today) return `Hoy, ${time}`;
  const yesterday = new Date(parseDisplayDate(today).getTime() - 86_400_000);
  if (day === format(yesterday, "yyyy-MM-dd")) return `Ayer, ${time}`;
  return `${format(parseDisplayDate(occurredAt), "d MMM yyyy", { locale: es })}, ${time}`;
}

function exchangeRateLabel(from: string, to: string, rate: number) {
  const a = from.trim().toUpperCase();
  const b = to.trim().toUpperCase();
  if (!a || !b || !Number.isFinite(rate) || rate <= 0) return "";
  return `1 ${a} = ${rate.toLocaleString("es-PE", { maximumFractionDigits: 6 })} ${b}`;
}

/**
 * Los datos del movimiento, en una sola lista sobre el lienzo.
 *
 * Eran **siete tarjetas para seis datos** —dos de ellas existían solo para decir que estaban
 * vacías: "Este movimiento no tiene comprobantes visibles todavía" y "+ Asociar a crédito /
 * deuda"—, repartidas en dos pantallas de scroll. Cada tarjeta costaba un rótulo en mayúsculas,
 * un borde, un fondo y 16 px de aire arriba y abajo; para seis filas de texto, eso es más
 * envoltorio que contenido. Ahora son filas de 56 px y todo entra sin scroll.
 */
export const MovementDetailFields = memo(function MovementDetailFields({
  movement,
  isTransfer,
  isExpense,
  transferSourceCurrencyCode,
  transferDestinationCurrencyCode,
  fxRate,
  attachmentsCount,
  attachmentsLoading,
  onPressAttachments,
  attachmentsSlot,
  obligationId,
  obligationTitle,
  subscriptionId,
  subscriptionName,
  canLink,
  onPressObligation,
  onPressSubscription,
  onRequestLink,
}: Props) {
  const currenciesDiffer =
    transferSourceCurrencyCode.toUpperCase() !== transferDestinationCurrencyCode.toUpperCase();
  const fxLabel = isTransfer && currenciesDiffer && fxRate
    ? exchangeRateLabel(transferSourceCurrencyCode, transferDestinationCurrencyCode, fxRate)
    : "";

  const sourceAccount = movement.sourceAccountName
    ?? (movement.sourceAccountId != null ? `Cuenta #${movement.sourceAccountId}` : null);
  const destinationAccount = movement.destinationAccountName
    ?? (movement.destinationAccountId != null ? `Cuenta #${movement.destinationAccountId}` : null);

  const attachmentsValue = attachmentsLoading
    ? "Cargando…"
    : attachmentsCount === 0
      ? "Agregar"
      : `${attachmentsCount} ${attachmentsCount === 1 ? "archivo" : "archivos"}`;

  // "Origen" no anunciaba un origen: anunciaba un campo vacío que pregunta si esto forma parte
  // de un crédito. Es una fila más, y dice que no cuando no.
  const linkRow = obligationId
    ? {
        label: "Parte de un crédito",
        value: obligationTitle ?? `#${obligationId}`,
        onPress: () => onPressObligation(obligationId),
      }
    : subscriptionId
      ? {
          label: "Parte de una suscripción",
          value: subscriptionName ?? `#${subscriptionId}`,
          onPress: () => onPressSubscription(subscriptionId),
        }
      : canLink
        ? { label: "Parte de un crédito", value: "No", onPress: onRequestLink }
        : null;

  return (
    <View style={styles.list}>
      <MovementDetailRow
        label="Descripción"
        value={movement.description?.trim() || "Sin descripción"}
        muted={!movement.description?.trim()}
      />
      <MovementDetailRow
        label="Categoría"
        value={movement.category || "Sin categoría"}
        muted={!movement.category}
      />
      <MovementDetailRow label="Fecha" value={formatWhen(movement.occurredAt)} />

      {isTransfer ? (
        <>
          <MovementDetailRow
            label="Sale de"
            value={sourceAccount ?? "—"}
            muted={!sourceAccount}
          />
          <MovementDetailRow
            label="Entra a"
            value={destinationAccount ?? "—"}
            muted={!destinationAccount}
          />
          {movement.destinationAmount != null && currenciesDiffer ? (
            <MovementDetailRow
              label="Llegó"
              value={formatCurrency(movement.destinationAmount, transferDestinationCurrencyCode)}
            />
          ) : null}
          {fxLabel ? <MovementDetailRow label="Tipo de cambio" value={fxLabel} /> : null}
        </>
      ) : (
        <MovementDetailRow
          label="Cuenta"
          value={(isExpense ? sourceAccount : destinationAccount) ?? "—"}
          muted={!(isExpense ? sourceAccount : destinationAccount)}
        />
      )}

      {movement.counterparty ? (
        <MovementDetailRow label="Contacto" value={movement.counterparty} />
      ) : null}
      {movement.notes?.trim() ? (
        <MovementDetailRow label="Notas" value={movement.notes.trim()} />
      ) : null}

      <MovementDetailRow
        action
        label="Comprobante"
        value={attachmentsValue}
        onPress={onPressAttachments}
        last={!linkRow && !attachmentsSlot}
      />
      {attachmentsSlot}

      {linkRow ? (
        <MovementDetailRow
          action
          label={linkRow.label}
          value={linkRow.value}
          onPress={linkRow.onPress}
          last
        />
      ) : null}

      {/* Qué se toca y qué no, dicho una vez. Las filas de dato ya no llevan chevrón, así que la
          pregunta "¿y esto dónde se cambia?" se responde aquí y no probando. */}
      <Text style={styles.note}>
        Los cuatro primeros datos se cambian en Editar. Comprobante y crédito abren su propia hoja.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  list: { paddingTop: SPACING.xs },
  note: {
    marginTop: SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
});
