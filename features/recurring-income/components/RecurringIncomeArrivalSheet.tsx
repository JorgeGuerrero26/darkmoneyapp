import { StyleSheet, Text, TextInput, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { CurrencyInput } from "../../../components/ui/CurrencyInput";
import { DatePickerInput } from "../../../components/ui/DatePickerInput";
import { PillSelector } from "../../../components/ui/PillSelector";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../../constants/theme";
import type { AccountSummary, RecurringIncomeSummary } from "../../../types/domain";

export type RecurringIncomeBaseChangeMode = "none" | "bonus" | "discount";

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
  newBaseAmount: string;
  onNewBaseAmountChange: (value: string) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  error: string;
  parsedNewBaseAmount: number | null;
  baseDelta: number | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

function formatYmdLocal(ymd: string) {
  const p = ymd.split("-").map(Number);
  if (p.length !== 3 || p.some((n) => Number.isNaN(n))) return ymd;
  return format(new Date(p[0], p[1] - 1, p[2]), "d MMM yyyy", { locale: es });
}

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
  newBaseAmount,
  onNewBaseAmountChange,
  notes,
  onNotesChange,
  error,
  parsedNewBaseAmount,
  baseDelta,
  loading,
  onClose,
  onSubmit,
}: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Confirmar llegada" snapHeight={0.86}>
      {item ? (
        <View style={styles.content}>
          <Text style={styles.subtitle}>
            {item.name} · Programado para {formatYmdLocal(item.nextExpectedDate)}
          </Text>

          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Monto base actual</Text>
            <Text style={styles.summaryAmount}>{formatCurrency(item.amount, item.currencyCode)}</Text>
            <Text style={styles.summaryBody}>
              Este monto se usa como base para calcular las próximas llegadas.
            </Text>
          </View>

          <DatePickerInput label="Fecha real de llegada" value={date} onChange={onDateChange} />

          <CurrencyInput
            label="Monto real recibido"
            value={amount}
            onChangeText={onAmountChange}
            currencyCode={item.currencyCode}
          />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cuenta destino del movimiento</Text>
            {item.accountId ? (
              <View style={styles.infoCard}>
                <Text style={styles.infoBody}>
                  El movimiento se registrará en {item.accountName ?? "la cuenta configurada"}.
                </Text>
              </View>
            ) : accounts.length > 0 ? (
              <>
                <Text style={styles.helper}>
                  Este ingreso fijo no tiene cuenta base. Elige una ahora para registrar el movimiento y guardarla.
                </Text>
                <PillSelector
                  options={accounts.map((account) => ({ label: account.name, value: account.id }))}
                  value={accountId}
                  onChange={onAccountIdChange}
                  horizontal={false}
                  wrap
                />
              </>
            ) : (
              <View style={styles.infoCard}>
                <Text style={styles.infoBody}>
                  No hay cuentas activas disponibles. Primero crea o reactiva una cuenta para registrar este ingreso.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Cambio de monto base desde ahora</Text>
            <Text style={styles.helper}>
              Si este ingreso cambió de forma permanente, define el nuevo monto para futuras llegadas.
            </Text>
            <PillSelector
              options={[
                { value: "none", label: "Sin cambio" },
                { value: "bonus", label: "Bonificación" },
                { value: "discount", label: "Descuento" },
              ]}
              value={baseChangeMode}
              onChange={onBaseChangeModeChange}
              horizontal={false}
              wrap
            />

            {baseChangeMode !== "none" ? (
              <>
                <CurrencyInput
                  label="Nuevo monto base"
                  value={newBaseAmount}
                  onChangeText={onNewBaseAmountChange}
                  currencyCode={item.currencyCode}
                />
                <View style={styles.infoCard}>
                  <Text style={styles.infoBody}>Base actual: {formatCurrency(item.amount, item.currencyCode)}</Text>
                  <Text style={styles.infoBody}>
                    Nuevo base: {parsedNewBaseAmount != null
                      ? formatCurrency(parsedNewBaseAmount, item.currencyCode)
                      : "Pendiente"}
                  </Text>
                  <Text style={styles.infoBody}>
                    Cambio: {baseDelta == null
                      ? "Pendiente"
                      : `${baseDelta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(baseDelta), item.currencyCode)}`}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          <TextInput
            style={styles.notesInput}
            multiline
            value={notes}
            onChangeText={onNotesChange}
            placeholder="Notas (opcional)"
            placeholderTextColor={COLORS.textDisabled}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.actions}>
            <Button label="Cancelar" variant="ghost" onPress={onClose} style={styles.actionButton} />
            <Button
              label="Confirmar y crear movimiento"
              onPress={onSubmit}
              loading={loading}
              style={styles.actionButton}
            />
          </View>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: SPACING.md,
  },
  subtitle: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
  },
  summaryCard: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "32",
  },
  summaryTitle: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  summaryAmount: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xl,
  },
  summaryBody: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionLabel: {
    color: COLORS.ink,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  helper: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
  infoCard: {
    gap: SPACING.xs,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    backgroundColor: GLASS.card,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  infoBody: {
    color: COLORS.storm,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
  },
  notesInput: {
    minHeight: 86,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    backgroundColor: GLASS.card,
    padding: SPACING.md,
    color: COLORS.ink,
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.body,
    textAlignVertical: "top",
  },
  errorText: {
    color: COLORS.danger,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  actions: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
  },
});
