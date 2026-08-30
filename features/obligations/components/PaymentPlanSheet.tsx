import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "../../../components/ui/Button";
import { InlineFormSheet } from "../../../components/ui/InlineFormSheet";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { TextField } from "../../../components/ui/TextField";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import {
  expandPaymentPlan,
  isPlanComplete,
  planDifference,
  planTotal,
  type PaymentPlan,
} from "../lib/payment-plan";

type Props = {
  visible: boolean;
  /** El plan que hay ahora mismo. `null` = ninguno. */
  plan: PaymentPlan | null;
  principal: number;
  currencyCode: string;
  startDate: string;
  onClose: () => void;
  onSave: (plan: PaymentPlan | null) => void;
};

const EQUAL_DEFAULT_COUNT = 6;

function monthLabel(dueDate: string) {
  const date = parseISO(dueDate);
  if (Number.isNaN(date.getTime())) return dueDate;
  return format(date, "LLLL", { locale: es });
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lo que se escribe en una fila de pago acordado, antes de ser un número. */
type AgreedDraft = { key: string; amount: string };

let draftSeq = 0;
const newDraft = (amount = ""): AgreedDraft => ({ key: `agreed-${(draftSeq += 1)}`, amount });

/**
 * El plan de pagos de una obligación.
 *
 * **Lo acordado se escribe; el resto se calcula.** Un acuerdo real casi nunca lista todos los
 * pagos: se pactan los primeros —los que son distintos por algún motivo— y después "lo de
 * siempre". Arriba van los pagos que el usuario acordó uno por uno; abajo, un solo monto que se
 * repite hasta terminar el saldo. Cuántos pagos son en total no se declara: se deduce.
 *
 * Las calculadas se ven pero **no se editan aquí**: van en gris, sobre el fondo un paso más
 * claro, y dicen que son calculadas. Así el usuario ve el plan completo sin que la app finja que
 * él escribió los últimos pagos.
 */
export function PaymentPlanSheet({
  visible,
  plan,
  principal,
  currencyCode,
  startDate,
  onClose,
  onSave,
}: Props) {
  const [mode, setMode] = useState<"equal" | "custom">(plan?.mode ?? "equal");
  const [count, setCount] = useState(String(plan?.mode === "equal" ? plan.count : EQUAL_DEFAULT_COUNT));
  const [agreed, setAgreed] = useState<AgreedDraft[]>(
    plan?.mode === "custom" ? plan.agreed.map((amount) => newDraft(String(amount))) : [],
  );
  const [tail, setTail] = useState(plan?.mode === "custom" && plan.tail != null ? String(plan.tail) : "");

  // Al abrir se parte de lo que ya hay guardado: la hoja edita el plan vigente, no uno en blanco.
  useEffect(() => {
    if (!visible) return;
    setMode(plan?.mode ?? "equal");
    setCount(String(plan?.mode === "equal" ? plan.count : EQUAL_DEFAULT_COUNT));
    setAgreed(plan?.mode === "custom" ? plan.agreed.map((amount) => newDraft(String(amount))) : []);
    setTail(plan?.mode === "custom" && plan.tail != null ? String(plan.tail) : "");
  }, [plan, visible]);

  const draftPlan = useMemo<PaymentPlan | null>(() => {
    if (mode === "equal") {
      const parsed = Number(count);
      return Number.isFinite(parsed) && parsed > 0 ? { mode: "equal", count: Math.floor(parsed) } : null;
    }
    const amounts = agreed
      .map((draft) => Number(draft.amount))
      .filter((amount) => Number.isFinite(amount) && amount > 0);
    const tailAmount = Number(tail);
    return {
      mode: "custom",
      agreed: amounts,
      tail: Number.isFinite(tailAmount) && tailAmount > 0 ? tailAmount : null,
    };
  }, [agreed, count, mode, tail]);

  const payments = useMemo(
    () => (draftPlan ? expandPaymentPlan({ plan: draftPlan, principal, startDate }) : []),
    [draftPlan, principal, startDate],
  );
  const calculated = payments.filter((payment) => payment.source === "calculated");
  const complete = isPlanComplete(principal, payments);
  const difference = planDifference(principal, payments);
  const money = (amount: number) => formatCurrency(amount, currencyCode);
  const lastPayment = payments[payments.length - 1];

  return (
    <InlineFormSheet visible={visible} title="Plan de pagos" onBack={onClose}>
      <SegmentedControl
        options={[
          { value: "equal", label: "Cuotas iguales" },
          { value: "custom", label: "A medida" },
        ]}
        value={mode}
        onChange={(next) => setMode(next)}
      />

      {mode === "equal" ? (
        <View style={styles.group}>
          <View style={styles.equalRow}>
            <Text style={styles.equalLabel}>Número de cuotas</Text>
            <TextField
              value={count}
              onChangeText={setCount}
              keyboardType="number-pad"
              style={styles.countInput}
              accessibilityLabel="Número de cuotas"
              maxLength={3}
            />
          </View>
          {/* La cuota se calcula, no se escribe: la fila muestra la operación. */}
          <Text style={styles.equalHint}>
            {payments.length > 0
              ? `${money(principal)} ÷ ${payments.length} = ${money(payments[0].amount)} por cuota. Se recalcula si cambias el monto.`
              : "Pon un número de cuotas para ver la cuota."}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.group}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>Lo que acordaron</Text>
              <Text style={styles.groupHint}>Tocar para editar</Text>
            </View>
            {agreed.map((draft, index) => (
              <View key={draft.key} style={styles.agreedRow}>
                <Text style={styles.seq}>{index + 1}</Text>
                <Text style={styles.month}>
                  {capitalize(monthLabel(payments[index]?.dueDate ?? startDate))}
                </Text>
                <TextField
                  value={draft.amount}
                  onChangeText={(value) => setAgreed((current) => current.map(
                    (item) => (item.key === draft.key ? { ...item, amount: value } : item),
                  ))}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={COLORS.storm}
                  style={styles.agreedInput}
                  accessibilityLabel={`Monto del pago ${index + 1}`}
                />
                <TouchableOpacity
                  onPress={() => setAgreed((current) => current.filter((item) => item.key !== draft.key))}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar el pago ${index + 1}`}
                >
                  <Trash2 size={15} color={COLORS.storm} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity
              style={styles.addRow}
              onPress={() => setAgreed((current) => [...current, newDraft()])}
              activeOpacity={0.72}
              accessibilityRole="button"
            >
              <Plus size={15} color={COLORS.storm} />
              <Text style={styles.addRowText}>Agregar un pago distinto</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.group}>
            <View style={styles.tailRow}>
              <View style={styles.tailCopy}>
                <Text style={styles.tailTitle}>De ahí en adelante</Text>
                <Text style={styles.tailSubtitle}>Hasta terminar el saldo</Text>
              </View>
              <TextField
                value={tail}
                onChangeText={setTail}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={COLORS.storm}
                style={styles.tailInput}
                accessibilityLabel="Monto que se repite hasta terminar el saldo"
              />
            </View>
            {calculated.length > 0 ? (
              <View style={styles.calculated}>
                {calculated.map((payment) => (
                  <View key={payment.seq} style={styles.calculatedRow}>
                    <Text style={styles.calculatedSeq}>{payment.seq}</Text>
                    <Text style={styles.calculatedMonth}>{capitalize(monthLabel(payment.dueDate))}</Text>
                    <Text style={styles.calculatedAmount}>{money(payment.amount)}</Text>
                  </View>
                ))}
                {/* La última no es el monto de la cola: es el saldo que queda. Es el número que
                    un plan a medida suele calcular mal, así que va a la vista con su etiqueta. */}
                <Text style={styles.calculatedNote}>Calculadas. La última se ajusta al saldo que queda.</Text>
              </View>
            ) : null}
          </View>
        </>
      )}

      {/* El pie cuadra la suma con el monto: es la única validación que importa aquí, y va al
          lado del botón porque es donde el usuario mira antes de guardar. */}
      <View style={styles.footer}>
        <View style={styles.footerRecap}>
          <Text style={styles.footerCount}>
            {payments.length > 0
              ? `${payments.length} ${payments.length === 1 ? "pago" : "pagos"}${lastPayment ? ` · hasta ${format(parseISO(lastPayment.dueDate), "LLL yyyy", { locale: es })}` : ""}`
              : "Sin pagos programados"}
          </Text>
          <Text style={[styles.footerTotal, !complete && styles.footerTotalOff]}>
            {money(planTotal(payments))} <Text style={styles.footerOf}>de {money(principal)}</Text>
          </Text>
        </View>
        {!complete ? (
          <Text style={styles.footerMissing}>
            {difference > 0
              ? `Faltan ${money(difference)} por programar`
              : `Sobran ${money(Math.abs(difference))}`}
          </Text>
        ) : null}
        <Button
          label="Guardar plan"
          size="lg"
          disabled={!complete}
          onPress={() => { onSave(draftPlan); onClose(); }}
        />
      </View>
    </InlineFormSheet>
  );
}

const styles = StyleSheet.create({
  group: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  groupTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  groupHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  agreedRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  seq: {
    width: 14,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  month: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  agreedInput: {
    minWidth: 96,
    textAlign: "right",
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    paddingVertical: SPACING.sm,
  },
  addRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  addRowText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  tailRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  tailCopy: { flex: 1, gap: 2 },
  tailTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  tailSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  tailInput: {
    minWidth: 96,
    textAlign: "right",
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    paddingVertical: SPACING.sm,
  },
  // Un paso más claro que la tarjeta, el mismo fondo de las sugerencias: es lo que la app
  // dedujo, no lo que el usuario escribió.
  calculated: {
    backgroundColor: SURFACE.input,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
    paddingVertical: SPACING.sm,
  },
  calculatedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
  },
  calculatedSeq: { width: 14, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  calculatedMonth: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  calculatedAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  calculatedNote: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xs,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  equalRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  equalLabel: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  countInput: {
    minWidth: 64,
    textAlign: "right",
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    paddingVertical: SPACING.sm,
  },
  equalHint: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  footer: { gap: SPACING.sm, paddingTop: SPACING.xs },
  footerRecap: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  footerCount: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  footerTotal: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  footerTotalOff: { color: COLORS.storm },
  footerOf: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  footerMissing: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
  },
});
