import { FormFeedbackProvider, FormSubmitBar } from "../../../components/ui/FormFeedback";
import { integerField, positiveAmountField, optionalNumberField, parseFormAmountInput } from "../../../lib/form-field-rules";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";


import { InlineFormSheet } from "../../../components/ui/InlineFormSheet";
import { PaymentMonthSheet, shortMonthLabel } from "./PaymentMonthSheet";
import { SegmentedControl } from "../../../components/ui/SegmentedControl";
import { TextField } from "../../../components/ui/TextField";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { addMonthsIso, defaultFirstDueDate, effectivePlanSchedule, expandPaymentPlan, isPlanComplete, monthKey, planDifference, planTotal, type PayDay, type PaymentPlan, type PlanDebtContext } from "../lib/payment-plan";
import { SearchableSelectSheet } from "../../../components/ui/SearchableSelectSheet";

type Props = {
  visible: boolean;
  /** El plan que hay ahora mismo. `null` = ninguno. */
  plan: PaymentPlan | null;
  principal: number;
  /** Deuda real (solo al editar una obligación existente): el calendario se muestra sobre lo que se debe hoy. */
  debtContext?: PlanDebtContext;
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
 * La regla que pidió el usuario —"no se puede poner un marzo antes de enero"— no se comprueba
 * después de escribir: los meses que romperían el orden **no se pueden tocar**. Un límite que no
 * se puede cruzar no necesita mensaje de error. Quien los apaga es `PaymentMonthSheet`, con estos
 * dos topes.
 */

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
  principal: openingInput,
  debtContext,
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
  /** El día del mes en que cae cada cuota. Vacío = el día de la fecha de inicio de la deuda. */
  const [payDay, setPayDay] = useState<PayDay | null>(plan?.payDay ?? null);
  const [payDayOpen, setPayDayOpen] = useState(false);

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
    setPayDay(plan?.payDay ?? null);
    setPayDayOpen(false);
    setMonthPickerFor(null);
  }, [plan, startDate, visible]);

  const draftPlan = useMemo<PaymentPlan | null>(() => {
    if (mode === "equal") {
      const parsed = Number(count);
      return Number.isFinite(parsed) && parsed > 0
        ? { mode: "equal", count: Math.floor(parsed), firstDueDate, ...(payDay != null ? { payDay } : {}) }
        : null;
    }
    const payments = agreed
      .map((draft) => ({ amount: parseFormAmountInput(draft.amount) ?? Number.NaN, dueDate: draft.dueDate }))
      .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0);
    const tailAmount = parseFormAmountInput(tail) ?? Number.NaN;
    return {
      mode: "custom",
      agreed: payments,
      tail: Number.isFinite(tailAmount) && tailAmount > 0 ? tailAmount : null,
      firstDueDate,
      ...(payDay != null ? { payDay } : {}),
    };
  }, [agreed, count, firstDueDate, mode, payDay, tail]);

  // Con la deuda real conocida, el calendario es el que rige hoy (el mismo del detalle de la deuda y de la proyección).
  const effective = useMemo(
    () => (draftPlan && debtContext ? effectivePlanSchedule({ plan: draftPlan, context: debtContext, startDate }) : null),
    [debtContext, draftPlan, startDate],
  );
  const principal = effective ? effective.basis : openingInput;
  const payments = useMemo(
    () => (effective ? effective.payments : draftPlan ? expandPaymentPlan({ plan: draftPlan, principal: openingInput, startDate }) : []),
    [draftPlan, effective, openingInput, startDate],
  );
  const calculated = payments.filter((payment) => payment.source === "calculated");
  const complete = isPlanComplete(principal, payments);
  const difference = planDifference(principal, payments);
  const money = (amount: number) => formatCurrency(amount, currencyCode);
  const lastPayment = payments[payments.length - 1];
  const startDay = (() => {
    const parsedStart = parseISO(startDate);
    return Number.isNaN(parsedStart.getTime()) ? 1 : parsedStart.getDate();
  })();
  const payDayLabel = payDay === "last" ? "Fin de mes" : payDay != null ? `Día ${payDay}` : `Día ${startDay} · como la fecha de inicio`;
  const payDayOptions = [
    { value: "start", label: `Día ${startDay} · el de la fecha de inicio` },
    { value: "last", label: "Fin de mes" },
    ...Array.from({ length: 31 }, (_, index) => ({ value: String(index + 1), label: `Día ${index + 1}` })),
  ];

  /** El mes que le toca a una fila hoy: el suyo si lo eligió, o el que le da la posición. */
  const monthOf = (index: number) => agreed[index]?.dueDate ?? addMonthsIso(firstDueDate, index);

  const setMonthAt = (key: string, dueDate: string) => {
    setAgreed((current) => current.map((item) => (item.key === key ? { ...item, dueDate } : item)));
    setMonthPickerFor(null);
  };

  /**
   * Los meses que ya tiene otro pago, para que la hoja los apague con su etiqueta. Se excluye la
   * fila que se está editando: su propio mes no es un conflicto consigo misma.
   */
  const takenMonths = (exceptKey: string | null) => {
    const map: Record<string, string> = {};
    agreed.forEach((draft, index) => {
      if (draft.key === exceptKey) return;
      map[monthKey(monthOf(index))] = `pago ${index + 1}`;
    });
    return map;
  };

  /** La fila abierta ahora mismo, con todo lo que la hoja necesita saber de ella. */
  const openRow = (() => {
    if (monthPickerFor == null) return null;
    if (monthPickerFor === "first") {
      return {
        title: "Mes del primer pago",
        contextLabel: "Primer pago · hoy en",
        contextValue: shortMonthLabel(firstDueDate),
        value: firstDueDate,
        min: defaultFirstDueDate(startDate, new Date(0)),
        maxExclusive: null,
        taken: {},
        apply: (month: string) => {
          setFirstDueDate(month);
          setMonthPickerFor(null);
        },
      };
    }
    const index = agreed.findIndex((item) => item.key === monthPickerFor);
    if (index < 0) return null;
    const amount = parseFormAmountInput(agreed[index].amount) ?? Number.NaN;
    const month = monthOf(index);
    return {
      title: `Mes del pago ${index + 1}`,
      contextLabel: `Pago ${index + 1} · hoy en`,
      contextValue: Number.isFinite(amount) && amount > 0
        ? `${shortMonthLabel(month)} · ${money(amount)}`
        : shortMonthLabel(month),
      value: month,
      // Nunca antes del pago anterior; el primero, nunca antes del primer pago.
      min: index === 0 ? firstDueDate : addMonthsIso(monthOf(index - 1), 1),
      maxExclusive: index + 1 < agreed.length ? monthOf(index + 1) : null,
      taken: takenMonths(monthPickerFor),
      apply: (month: string) => setMonthAt(monthPickerFor, month),
    };
  })();

  const validationFields = mode === "equal" ? { count: integerField(count, 1, 999) } : Object.fromEntries([
    ...agreed.map((draft) => [`amount-${draft.key}`, positiveAmountField(draft.amount)] as const),
    ["tail", { ...optionalNumberField(tail, { positive: true }), missing: !complete && !tail.trim() ? "Ingresa la cuota que se repite" : null, invalid: optionalNumberField(tail, { positive: true }).invalid ?? (!complete && tail.trim() ? "Ajusta las cuotas para cubrir el saldo" : null) }],
  ]);
  const savePlan = () => { onSave(draftPlan); onClose(); };
  return (
    <FormFeedbackProvider visible={visible} fields={validationFields} onSubmit={savePlan}>
    <>
    <InlineFormSheet
      visible={visible}
      title="Plan de pagos"
      onBack={onClose}
      footer={<FormSubmitBar label="Guardar plan" onSubmit={savePlan} />}
      overlay={payDayOpen ? (
        <SearchableSelectSheet<string>
          inline
          visible
          title="Día de cobro"
          options={payDayOptions}
          value={payDay == null ? "start" : String(payDay)}
          onChange={(value) => {
            setPayDay(value === "start" ? null : value === "last" ? "last" : Number(value));
            setPayDayOpen(false);
          }}
          onClose={() => setPayDayOpen(false)}
        />
      ) : null}
    >
      <SegmentedControl
        options={[
          { value: "equal", label: "Cuotas iguales" },
          { value: "custom", label: "A medida" },
        ]}
        value={mode}
        onChange={(next) => setMode(next)}
      />

      {/* El día en que cae cada cuota. Sin elegir, es el día de la fecha de inicio de la deuda. */}
      <View style={styles.group}>
        <TouchableOpacity
          style={styles.equalRow}
          onPress={() => setPayDayOpen(true)}
          activeOpacity={0.72}
          accessibilityRole="button"
          accessibilityLabel={`Día de cobro: ${payDayLabel}`}
        >
          <Text style={styles.equalLabel}>Día de cobro</Text>
          <Text style={styles.monthValue}>{payDayLabel}</Text>
        </TouchableOpacity>
      </View>

      {mode === "equal" ? (
        <View style={styles.group}>
          <View style={styles.equalRow}>
            <Text style={styles.equalLabel}>Número de cuotas</Text>
            <TextField
              fieldId="count"
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
            onPress={() => setMonthPickerFor("first")}
            activeOpacity={0.72}
            accessibilityRole="button"
          >
            <Text style={styles.equalLabel}>Primer pago</Text>
            <Text style={styles.monthValue}>{capitalize(monthLabel(firstDueDate))}</Text>
          </TouchableOpacity>
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
                  onPress={() => setMonthPickerFor(draft.key)}
                  activeOpacity={0.72}
                  accessibilityRole="button"
                  accessibilityLabel={`Mes del pago ${index + 1}`}
                >
                  <Text style={styles.monthValue}>
                    {capitalize(monthLabel(monthOf(index)))}
                  </Text>
                </TouchableOpacity>
                <TextField
                  fieldId={`amount-${draft.key}`} value={draft.amount}
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
                fieldId="tail" value={tail}
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

      </View>
    </InlineFormSheet>

    {/* Hermana, no hija: se pinta encima del plan y lo deja intacto detrás. */}
    {openRow ? (
      <PaymentMonthSheet
        visible
        title={openRow.title}
        contextLabel={openRow.contextLabel}
        contextValue={openRow.contextValue}
        value={openRow.value}
        min={openRow.min}
        maxExclusive={openRow.maxExclusive}
        taken={openRow.taken}
        onPick={openRow.apply}
        onBack={() => setMonthPickerFor(null)}
      />
    ) : null}
    </>
    </FormFeedbackProvider>
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
  // Elegido se ve igual en toda la app: hueso, sin color.
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
