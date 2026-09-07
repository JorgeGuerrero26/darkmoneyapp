import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { CurrencyInput } from "../../../components/ui/CurrencyInput";
import { FormDateRow } from "../../../components/ui/FormDateRow";
import { FormOptionRow } from "../../../components/ui/FormOptionRow";
import { InlineFormSheet } from "../../../components/ui/InlineFormSheet";
import { SearchableSelectSheet } from "../../../components/ui/SearchableSelectSheet";
import { TextField } from "../../../components/ui/TextField";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import {
  arrivalConfirmLabel,
  arrivalConfirmSentence,
  arrivalDiffSentence,
} from "../lib/arrivalCopy";
import { parseMoneyInput, type RecurringIncomeBaseChangeMode } from "../lib/arrival-validation";
import type { AccountSummary, RecurringIncomeSummary } from "../../../types/domain";

export type { RecurringIncomeBaseChangeMode };

type Props = {
  item: RecurringIncomeSummary | null;
  visible: boolean;
  accounts: AccountSummary[];
  date: string;
  onDateChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  accountId: number | null;
  onAccountIdChange: (value: number | null) => void;
  baseChangeMode: RecurringIncomeBaseChangeMode;
  onBaseChangeModeChange: (value: RecurringIncomeBaseChangeMode) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  error: string;
  loading?: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

function formatYmdShort(ymd: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  // Sin el año: la llegada que se confirma es de hace semanas, no de hace años.
  return format(new Date(p[0], p[1] - 1, p[2]), "d MMM", { locale: es });
}

/**
 * "¿Llegó tu ingreso?" — la hoja que afirma lo que va a hacer.
 *
 * **Preguntaba cuatro cosas y en el caso frecuente la respuesta a todas era "lo que ya dice".**
 * Fecha precargada con el día esperado, monto con el monto pactado, cuenta con la cuenta del
 * ingreso y cambio de base con "Sin cambio": confirmar una llegada normal —llegó lo esperado, el
 * día esperado— obligaba a leer cuatro campos para no tocar ninguno.
 *
 * Ahora es una frase y un botón. Lo excepcional —otro monto, otra fecha, otra cuenta— entra por
 * "Llegó distinto", que es la misma plantilla del formulario de suscripción: lo obligatorio
 * arriba, lo raro detrás de una fila.
 */
export function RecurringIncomeArrivalSheet({
  item,
  visible,
  accounts,
  date,
  onDateChange,
  amount,
  onAmountChange,
  accountId,
  onAccountIdChange,
  baseChangeMode,
  onBaseChangeModeChange,
  notes,
  onNotesChange,
  error,
  loading,
  onClose,
  onSubmit,
}: Props) {
  const [differentOpen, setDifferentOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  if (!item) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Confirmar llegada" snapHeight={0.86}>
        <View />
      </BottomSheet>
    );
  }

  const money = (value: number) => formatCurrency(value, item.currencyCode);
  const parsedAmount = parseMoneyInput(amount);
  const accountName =
    accounts.find((account) => account.id === accountId)?.name ?? item.accountName ?? null;
  const diff = parsedAmount != null ? arrivalDiffSentence(parsedAmount, item.amount, money) : "";
  const changed = diff !== "";

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Confirmar llegada"
      snapHeight={0.86}
      footer={
        <View style={styles.footer}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {/* "Cancelar" se retira: la hoja ya tiene su ×, y dos salidas compiten entre sí. El
              botón gana el ancho completo y deja de partirse en dos líneas. */}
          <Button
            label={arrivalConfirmLabel(parsedAmount, item.amount, money)}
            onPress={onSubmit}
            loading={loading}
            size="lg"
          />
        </View>
      }
      overlay={
        <>
          <InlineFormSheet
            visible={differentOpen}
            title="Llegó distinto"
            onBack={() => setDifferentOpen(false)}
            footer={
              <View style={styles.footer}>
                <Button
                  label={arrivalConfirmLabel(parsedAmount, item.amount, money)}
                  onPress={() => { setDifferentOpen(false); onSubmit(); }}
                  loading={loading}
                  size="lg"
                />
              </View>
            }
          >
            <View style={styles.differentContent}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Cuánto llegó</Text>
                <CurrencyInput
                  value={amount}
                  onChangeText={onAmountChange}
                  currencyCode={item.currencyCode}
                />
                {diff ? (
                  <Text
                    style={[
                      styles.diff,
                      { color: (parsedAmount ?? 0) > item.amount ? COLORS.income : COLORS.expense },
                    ]}
                  >
                    {diff}
                  </Text>
                ) : null}
              </View>

              <View style={styles.group}>
                <FormDateRow label="Cuándo llegó" value={date} onChange={onDateChange} grouped />
                <FormOptionRow
                  label="Entró a"
                  value={accountName}
                  placeholder="Elige la cuenta"
                  onPress={() => setAccountPickerOpen(true)}
                  grouped
                  last
                />
              </View>

              {/* Solo cuando hay diferencia: si llegó lo mismo, no hay nada que decidir. */}
              {changed ? (
                <View style={styles.baseCard}>
                  <Text style={styles.baseTitle}>¿Es así de ahora en adelante?</Text>
                  <Text style={styles.baseBody}>Cambia lo que se espera en las próximas llegadas.</Text>
                  <View style={styles.segmented}>
                    {(["once", "forever"] as const).map((mode) => {
                      const active = baseChangeMode === mode;
                      return (
                        <Text
                          key={mode}
                          style={[styles.segment, active && styles.segmentActive]}
                          onPress={() => onBaseChangeModeChange(mode)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          {mode === "once" ? "Solo esta vez" : "Desde ahora"}
                        </Text>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Notas</Text>
                <TextField
                  style={styles.notesInput}
                  multiline
                  value={notes}
                  onChangeText={onNotesChange}
                  placeholder="Bonificación de julio"
                  placeholderTextColor={COLORS.textDisabled}
                />
              </View>
            </View>
          </InlineFormSheet>

          {/* El selector va DESPUÉS de la hoja que lo abre: se pinta encima. Al revés queda
              por debajo de "Llegó distinto" y no se ve (mismo fallo que en el formulario). */}
          <SearchableSelectSheet
            inline
            visible={accountPickerOpen}
            title="Entró a"
            options={accounts.map((account) => ({ value: account.id as number | null, label: account.name }))}
            value={accountId}
            onChange={onAccountIdChange}
            onClose={() => setAccountPickerOpen(false)}
          />

          <InlineFormSheet
            visible={notesOpen}
            title="Notas"
            onBack={() => setNotesOpen(false)}
            doneLabel="Listo"
            onDone={() => setNotesOpen(false)}
          >
            <TextField
              style={styles.notesInput}
              multiline
              autoFocus
              value={notes}
              onChangeText={onNotesChange}
              placeholder="Bonificación de julio"
              placeholderTextColor={COLORS.textDisabled}
            />
          </InlineFormSheet>
        </>
      }
    >
      <View style={styles.content}>
        <Text style={styles.lead}>
          La llegada del <Text style={styles.leadStrong}>{formatYmdShort(item.nextExpectedDate)}</Text>{" "}
          de {item.name}.
        </Text>
        <Text style={styles.amount}>{money(parsedAmount ?? item.amount)}</Text>
        <Text style={styles.lead}>
          {arrivalConfirmSentence({ accountName, dateLabel: formatYmdShort(date) })}
        </Text>

        <View style={styles.group}>
          <FormOptionRow
            label="Llegó distinto"
            support="Otro monto, otra fecha u otra cuenta"
            value={changed ? money(parsedAmount ?? item.amount) : null}
            placeholder=""
            onPress={() => setDifferentOpen(true)}
            grouped
          />
          <FormOptionRow
            label="Notas"
            value={notes.trim() || null}
            placeholder="Ninguna"
            onPress={() => setNotesOpen(true)}
            grouped
            last
          />
        </View>

        <Text style={styles.footnote}>
          El monto esperado de las próximas llegadas no cambia. Si este ingreso subió o bajó para
          siempre, se cambia en Editar.
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACING.md },
  lead: {
    color: COLORS.fog,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 21,
  },
  leadStrong: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold },
  amount: {
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxxl,
    letterSpacing: -0.5,
    marginTop: -SPACING.xs,
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  footnote: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    lineHeight: 18,
  },
  differentContent: { gap: SPACING.lg },
  field: { gap: SPACING.sm },
  fieldLabel: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  diff: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium },
  baseCard: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  baseTitle: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  baseBody: { color: COLORS.storm, fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body },
  segmented: {
    flexDirection: "row",
    gap: SPACING.xs,
    marginTop: SPACING.sm,
    padding: 3,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
  },
  segment: {
    flex: 1,
    textAlign: "center",
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
    color: COLORS.storm,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  segmentActive: {
    backgroundColor: COLORS.action,
    color: COLORS.actionText,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  notesInput: {
    minHeight: 110,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    padding: SPACING.md,
    color: COLORS.ink,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    textAlignVertical: "top",
  },
  footer: { gap: SPACING.sm },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
});
