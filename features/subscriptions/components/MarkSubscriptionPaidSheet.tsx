import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { CurrencyInput } from "../../../components/ui/CurrencyInput";
import { FormDateRow } from "../../../components/ui/FormDateRow";
import { FormOptionRow } from "../../../components/ui/FormOptionRow";
import { SearchableSelectSheet } from "../../../components/ui/SearchableSelectSheet";
import { computeNextRecurringDate } from "../../../lib/subscription-helpers";
import { sortByName } from "../../../lib/sort-locale";
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

/**
 * Confirmar el cobro del mes: la hoja más repetida de la app.
 *
 * Se abre una vez por suscripción y por mes, y con la fecha y el monto ya resueltos **lo único
 * que se elige es la cuenta**. Estaba al final, sin preseleccionar, en dos cápsulas sueltas — y
 * "Confirmar pago" quedaba activo mientras faltaba justo ese dato. Ahora viene precargada con la
 * que la suscripción ya guarda, así que lo normal es **un solo toque**; cuando no la tiene, el
 * botón lo nombra en vez de aparentar que se puede confirmar.
 *
 * **Y dice qué va a pasar.** Confirmar hace dos cosas que la hoja no mencionaba: anota el gasto
 * en la cuenta y **mueve el próximo cobro un período**. Lo segundo es lo que uno querría revisar
 * antes de tocar, sobre todo si la fecha de pago no es la programada, así que la tarjeta de
 * contexto enseña el antes y el después — el mismo patrón de las hojas de cobro de la fase 18.
 */
export function MarkSubscriptionPaidSheet({
  visible,
  subscription,
  accounts,
  isPending,
  onClose,
  onConfirm,
}: Props) {
  const [paidDate, setPaidDate] = useState("");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [error, setError] = useState("");

  const eligibleAccounts = useMemo(
    () => sortByName(accounts.filter((account) => !account.isArchived)),
    [accounts],
  );

  useEffect(() => {
    if (!visible || !subscription) return;
    setPaidDate(subscription.nextDueDate); // la fecha programada gana a hoy: es la del cobro
    setAmount(String(subscription.amount));
    // La cuenta con la que se paga ya está guardada en la suscripción. Sin esto, el único dato
    // obligatorio de la hoja era el único que llegaba vacío.
    setAccountId(subscription.accountId ?? null);
    setAccountOpen(false);
    setError("");
  }, [visible, subscription]);

  if (!subscription) return null;

  const money = (value: number) => formatCurrency(value, subscription.currencyCode);
  const selectedAccount = eligibleAccounts.find((account) => account.id === accountId) ?? null;
  const dueDate = parseYmd(subscription.nextDueDate);
  const nextDueDate = parseYmd(
    computeNextRecurringDate(
      subscription.nextDueDate,
      subscription.frequency,
      subscription.intervalCount,
      subscription.dayOfMonth,
    ),
  );
  const parsedAmount = Number(amount.replace(/,/g, "."));
  const amountForCopy = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : subscription.amount;

  function handleConfirm() {
    if (!subscription) return;
    if (accountId == null) {
      // El botón ya lo nombra; tocarlo lleva a resolverlo, no a un error.
      setAccountOpen(true);
      return;
    }
    const parsed = Number(amount.replace(/,/g, "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Escribe cuánto pagaste.");
      return;
    }
    onConfirm({ paidDate, amount: parsed, accountId });
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      /* En una lista de doce suscripciones, lo primero que se confirma es cuál se abrió. */
      title={`${subscription.name} · pago de ${format(dueDate, "LLLL", { locale: es })}`}
      snapHeight={0.7}
      overlay={
        <SearchableSelectSheet
          inline
          visible={accountOpen}
          title="Se pagó con"
          options={eligibleAccounts.map((account) => ({ value: account.id as number | null, label: account.name }))}
          value={accountId}
          onChange={(id) => { setAccountId(id); setError(""); }}
          onClose={() => setAccountOpen(false)}
        />
      }
      footer={
        <View style={styles.footer}>
          {selectedAccount ? (
            <Text style={styles.footNote}>
              Se anota un gasto de {money(amountForCopy)} en {selectedAccount.name}.
            </Text>
          ) : null}
          <Button
            label={accountId == null ? "Elige la cuenta" : "Confirmar pago"}
            onPress={handleConfirm}
            loading={isPending}
            size="lg"
            disabled={isPending || eligibleAccounts.length === 0}
          />
        </View>
      }
    >
      {/* Estaba en una caja gris con la etiqueta dentro y sin cursor: se leía como la
          confirmación de algo ya decidido. Es el campo que importa cuando el cobro no salió por
          lo esperado — un aumento de precio, un mes prorrateado. */}
      <Text style={styles.fieldLabel}>Cuánto pagaste</Text>
      <CurrencyInput
        value={amount}
        onChangeText={(text) => { setAmount(text); setError(""); }}
        currencyCode={subscription.currencyCode}
        style={styles.amountField}
      />

      {/* "Fecha de pago" era una caja con acento verde que contenía otra caja con "4 jun" y su
          chevrón, cada una con su ícono de calendario: dos niveles de anidación y dos íconos
          para cuatro caracteres. Es una fila, en la misma tarjeta que la cuenta. */}
      <View style={styles.group}>
        <FormOptionRow
          grouped
          label="Se pagó con"
          value={selectedAccount?.name ?? null}
          placeholder="Elegir cuenta"
          onPress={() => setAccountOpen(true)}
        />
        <FormDateRow grouped last label="Cuándo" value={paidDate} onChange={setPaidDate} />
      </View>

      <View style={styles.context}>
        <View style={styles.contextRow}>
          <Text style={styles.contextLabel}>Estaba programado</Text>
          <Text style={styles.contextValue}>
            {format(dueDate, "d MMM", { locale: es })} · {money(subscription.amount)}
          </Text>
        </View>
        <View style={styles.contextRow}>
          <Text style={styles.contextLabel}>Siguiente cobro</Text>
          <Text style={styles.contextValueStrong}>
            {format(nextDueDate, "d MMM yyyy", { locale: es })}
          </Text>
        </View>
      </View>

      {eligibleAccounts.length === 0 ? (
        <Text style={styles.error}>
          No tienes cuentas activas. Crea una en Cuentas antes de registrar el pago.
        </Text>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: -SPACING.xs,
  },
  /** Borde de campo activo: se tiene que ver que se puede tocar. */
  amountField: {
    borderColor: SURFACE.inputBorder,
    paddingVertical: SPACING.md,
  },
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  context: {
    borderRadius: RADIUS.lg,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  contextLabel: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  contextValue: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  /** Lo que cambia al confirmar, en hueso: es el dato que se viene a verificar. */
  contextValueStrong: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  footer: {
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: SURFACE.sheet,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  footNote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
  error: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.danger },
});
