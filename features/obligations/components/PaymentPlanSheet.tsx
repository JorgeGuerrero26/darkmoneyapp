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
  addMonthsIso,
  defaultFirstDueDate,
  expandPaymentPlan,
  isPlanComplete,
  monthKey,
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

/**
 * "Setiembre 2026", no "Setiembre".
 *
 * El mes solo decía el nombre, así que un plan de catorce pagos enseñaba dos veces "marzo" sin
 * que se supiera cuál era cuál, ni si el primero era de este año o del pasado.
 */
function monthLabel(dueDate: string) {
  const date = parseISO(dueDate);
  if (Number.isNaN(date.getTime())) return dueDate;
  return format(date, "LLL yyyy", { locale: es });
}

/** Cuántos meses se ofrecen hacia adelante al elegir el mes de un pago. */
const MONTH_CHOICES = 24;

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lo que se escribe en una fila de pago acordado, antes de ser un número. */
type AgreedDraft = { key: string; amount: string; dueDate?: string };

let draftSeq = 0;
const newDraft = (amount = "", dueDate?: string): AgreedDraft => ({
  key: `agreed-${(draftSeq += 1)}`,
  amount,
  dueDate,
});

/**
 * Los meses que se pueden elegir para un pago, entre el anterior y el siguiente.
 *
 * La regla que pidió el usuario —"no se puede poner un marzo antes de enero"— no se comprueba
 * después de escribir: **los meses que romperían el orden no se ofrecen**. Un límite que no se
 * puede cruzar no necesita mensaje de error.
 */
function monthChoices(from: string, until: string | null, value: string) {
  // La ventana se corre para que el mes elegido siempre se vea, con algo de contexto detrás.
  const start = monthKey(value) > monthKey(addMonthsIso(from, 6)) ? addMonthsIso(value, -6) : from;
  const options: string[] = [];
  for (let i = 0; i < MONTH_CHOICES; i += 1) {
    const candidate = addMonthsIso(start, i);
    if (until && monthKey(candidate) >= monthKey(until)) break;
    options.push(candidate);
  }
  return options;
}

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
  /**
   * El mes del primer pago. En un plan nuevo es **el mes actual**: antes salía de la fecha de
   * inicio de la obligación, así que una deuda de marzo proponía su primer pago en abril aunque
   * el plan se estuviera pactando en agosto.
   */
  const [firstDueDate, setFirstDueDate] = useState(
    plan?.firstDueDate ?? defaultFirstDueDate(startDate),
  );
  /** Qué selector de mes está abierto: "first" o la clave de una fila. */
  const [monthPickerFor, setMonthPickerFor] = useState<string | null>(null);

  // Al abrir se parte de lo que ya hay guardado: la hoja edita el plan vigente, no uno en blanco.
  useEffect(() => {
    if (!visible) return;
    setMode(plan?.mode ?? "equal");
    setCount(String(plan?.mode === "equal" ? plan.count : EQUAL_DEFAULT_COUNT));
    setAgreed(
      plan?.mode === "custom"
        ? plan.agreed.map((payment) => newDraft(String(payment.amount), payment.dueDate))
        : [],
    );
    setTail(plan?.mode === "custom" && plan.tail != null ? String(plan.tail) : "");
    setFirstDueDate(plan?.firstDueDate ?? defaultFirstDueDate(startDate));
    setMonthPickerFor(null);
  }, [plan, startDate, visible]);

  const draftPlan = useMemo<PaymentPlan | null>(() => {
    if (mode === "equal") {
      const parsed = Number(count);
      return Number.isFinite(parsed) && parsed > 0
        ? { mode: "equal", count: Math.floor(parsed), firstDueDate }
        : null;
    }
    const payments = agreed
      .map((draft) => ({ amount: Number(draft.amount), dueDate: draft.dueDate }))
      .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0);
    const tailAmount = Number(tail);
    return {
      mode: "custom",
      agreed: payments,
      tail: Number.isFinite(tailAmount) && tailAmount > 0 ? tailAmount : null,
      firstDueDate,
    };
  }, [agreed, count, firstDueDate, mode, tail]);

  const payments = useMemo(
    () => (draftPlan ? expandPaymentPlan({ plan: draftPlan, principal, startDate }) : []),
    [draftPlan, principal, startDate],
  );
  const calculated = payments.filter((payment) => payment.source === "calculated");
  const complete = isPlanComplete(principal, payments);
  const difference = planDifference(principal, payments);
  const money = (amount: number) => formatCurrency(amount, currencyCode);
  const lastPayment = payments[payments.length - 1];

  /** El mes que le toca a una fila hoy: el suyo si lo eligió, o el que le da la posición. */
  const monthOf = (index: number) => agreed[index]?.dueDate ?? addMonthsIso(firstDueDate, index);

  const setMonthAt = (key: string, dueDate: string) => {
    setAgreed((current) => current.map((item) => (item.key === key ? { ...item, dueDate } : item)));
    setMonthPickerFor(null);
  };

  const renderMonthPicker = (value: string, from: string, until: string | null, onPick: (month: string) => void) => (
    <View style={styles.monthPicker}>
      {monthChoices(from, until, value).map((month) => {
        const selected = monthKey(month) === monthKey(value);
        return (
          <TouchableOpacity
            key={month}
            style={[styles.monthChip, selected && styles.monthChipSelected]}
            onPress={() => onPick(month)}
            activeOpacity={0.72}
            accessibilityRole="button"
          >
            <Text style={[styles.monthChipText, selected && styles.monthChipTextSelected]}>
              {capitalize(monthLabel(month))}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

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
          <TouchableOpacity
            style={styles.equalRow}
            onPress={() => setMonthPickerFor((open) => (open === "first" ? null : "first"))}
            activeOpacity={0.72}
            accessibilityRole="button"
          >
            <Text style={styles.equalLabel}>Primer pago</Text>
            <Text style={styles.monthValue}>{capitalize(monthLabel(firstDueDate))}</Text>
          </TouchableOpacity>
          {monthPickerFor === "first"
            ? renderMonthPicker(firstDueDate, defaultFirstDueDate(startDate, new Date(0)), null, (month) => {
                setFirstDueDate(month);
                setMonthPickerFor(null);
              })
            : null}
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
              <View key={draft.key}>
              <View style={styles.agreedRow}>
                <Text style={styles.seq}>{index + 1}</Text>
                <TouchableOpacity
                  style={styles.month}
                  onPress={() => setMonthPickerFor((open) => (open === draft.key ? null : draft.key))}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel={`Mes del pago ${index + 1}`}
                >
                  <Text style={styles.monthValue}>
                    {capitalize(monthLabel(monthOf(index)))}
                  </Text>
                </TouchableOpacity>
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
              {monthPickerFor === draft.key
                ? renderMonthPicker(
                    monthOf(index),
                    // Nunca antes del pago anterior; el primero, nunca antes del primer pago.
                    index === 0 ? firstDueDate : addMonthsIso(monthOf(index - 1), 1),
                    index + 1 < agreed.length ? monthOf(index + 1) : null,
                    (month) => setMonthAt(draft.key, month),
                  )
                : null}
              </View>
            ))}
            <TouchableOpacity
              style={styles.addRow}
              onPress={() => setAgreed((current) => {
                const last = current[current.length - 1];
                const lastMonth = last ? monthOf(current.length - 1) : null;
                return [...current, newDraft("", lastMonth ? addMonthsIso(lastMonth, 1) : firstDueDate)];
              })}
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
              ? `${payments.length} ${payments.length === 1 ? "pago" : "pagos"}${lastPayment ? ` · ${capitalize(monthLabel(payments[0].dueDate))} a ${monthLabel(lastPayment.dueDate)}` : ""}`
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
  month: { flex: 1 },
  monthValue: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  // Los meses se eligen dentro de la misma hoja: una capa más de modal encima de un sheet que ya
  // vive dentro de otro no se presenta en iOS.
  monthPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: SURFACE.input,
    paddingTop: SPACING.sm,
  },
  monthChip: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  // Elegido se ve igual en toda la app: hueso, sin color.
  monthChipSelected: { borderColor: COLORS.ink, backgroundColor: SURFACE.cardActive },
  monthChipText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.fog },
  monthChipTextSelected: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodyMedium },
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
