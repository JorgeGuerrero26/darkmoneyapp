import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CalendarCheck } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { CurrencyInput } from "../../../components/ui/CurrencyInput";
import { FormDateField } from "../../../components/forms/FormDateField";
import { todayPeru } from "../../../lib/date";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import type { AccountSummary, SubscriptionSummary } from "../../../types/domain";

type Props = {
  visible: boolean;
  subscription: SubscriptionSummary | null;
  accounts: AccountSummary[];
  isPending: boolean;
  onClose: () => void;
  onConfirm: (args: { paidDate: string; amount: number; accountId: number }) => void;
};

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function MarkSubscriptionPaidSheet({
  visible,
  subscription,
  accounts,
  isPending,
  onClose,
  onConfirm,
}: Props) {
  const [paidDate, setPaidDate] = useState(() => todayPeru());
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible || !subscription) return;
    setPaidDate(subscription.nextDueDate); // prefer the due date over today
    setAmount(String(subscription.amount));
    setAccountId(subscription.accountId ?? accounts[0]?.id ?? null);
    setError("");
  }, [visible, subscription, accounts]);

  const eligibleAccounts = useMemo(
    () => accounts.filter((a) => !a.isArchived),
    [accounts],
  );

  function handleConfirm() {
    if (!subscription) return;
    const parsed = Number(amount.replace(/,/g, "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Ingresa un monto válido mayor a cero.");
      return;
    }
    if (accountId == null) {
      setError("Selecciona la cuenta desde la que pagaste.");
      return;
    }
    onConfirm({ paidDate, amount: parsed, accountId });
  }

  if (!subscription) return null;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Marcar como pagada" snapHeight={0.7}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.name} numberOfLines={1}>
          {subscription.name}
        </Text>
        <Text style={styles.subtitle}>
          Próximo cobro programado: {format(parseYmd(subscription.nextDueDate), "d MMM yyyy", { locale: es })}
        </Text>

        <FormDateField
          title="Fecha de pago"
          description="Cuándo se hizo el cobro."
          value={paidDate}
          onChange={setPaidDate}
          Icon={CalendarCheck}
          accentColor={COLORS.primary}
        />

        <CurrencyInput
          label="Monto pagado"
          value={amount}
          onChangeText={(t) => {
            setAmount(t);
            setError("");
          }}
          currencyCode={subscription.currencyCode}
        />

        <View>
          <Text style={styles.label}>Cuenta de origen *</Text>
          {eligibleAccounts.length === 0 ? (
            <Text style={styles.helperError}>
              No hay cuentas activas. Crea una desde el módulo Cuentas antes de registrar el pago.
            </Text>
          ) : (
            <View style={styles.pillRow}>
              {eligibleAccounts.map((account) => {
                const selected = account.id === accountId;
                return (
                  <TouchableOpacity
                    key={account.id}
                    style={[styles.pill, selected && styles.pillActive]}
                    onPress={() => {
                      setAccountId(account.id);
                      setError("");
                    }}
                  >
                    <Text style={[styles.pillText, selected && styles.pillTextActive]} numberOfLines={1}>
                      {account.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {error ? <Text style={styles.helperError}>{error}</Text> : null}

        <Button
          label="Confirmar pago"
          onPress={handleConfirm}
          loading={isPending}
          disabled={isPending || eligibleAccounts.length === 0}
        />
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  name: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.text,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.textMuted,
    marginTop: -SPACING.sm,
  },
  label: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  pillActive: {
    backgroundColor: COLORS.primary + "20",
    borderColor: COLORS.primary,
  },
  pillText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textMuted,
  },
  pillTextActive: {
    color: COLORS.primary,
  },
  helperError: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.danger,
  },
});
