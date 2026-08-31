import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import { Card } from "../../../../components/ui/Card";
import { ProgressBar } from "../../../../components/ui/ProgressBar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDisplayDate } from "../../../../lib/date";
import { expandPaymentPlan, parsePaymentPlan } from "../../lib/payment-plan";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import {
  obligationPendingDirectionBadge,
  obligationProgressPaidAdjective,
} from "../../../../lib/obligation-viewer-labels";
import type {
  ObligationSummary,
  SharedObligationSummary,
} from "../../../../types/domain";

export type ObligationOverviewCardsStyles = {
  heroCard: StyleProp<ViewStyle>;
  pendingAmount: StyleProp<TextStyle>;
  pendingLabel: StyleProp<TextStyle>;
  progress: StyleProp<ViewStyle>;
  progressLabel: StyleProp<TextStyle>;
  capitalSummaryCard: StyleProp<ViewStyle>;
  heroTerms: StyleProp<TextStyle>;
  capitalMathRow: StyleProp<ViewStyle>;
  capitalMathLabel: StyleProp<TextStyle>;
  capitalMathValue: StyleProp<TextStyle>;
  capitalMathTotalRow: StyleProp<ViewStyle>;
  capitalMathTotalLabel: StyleProp<TextStyle>;
  capitalMathTotalValue: StyleProp<TextStyle>;
  sectionTitle: StyleProp<TextStyle>;
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

type CapitalOverview = {
  openingAmount: number;
  increaseTotal: number;
  increaseCount: number;
  decreaseTotal: number;
  decreaseCount: number;
  currentPrincipal: number;
  progressPercent: number;
};

type Props = {
  styles: ObligationOverviewCardsStyles;
  obligation: ObligationSummary | SharedObligationSummary;
  isSharedViewer: boolean;
  capitalOverview: CapitalOverview;
  onPressCapitalIncreaseDetail: () => void;
  onPressCapitalDecreaseDetail: () => void;
};

export function ObligationOverviewCards({
  styles,
  obligation,
  isSharedViewer,
  capitalOverview,
  onPressCapitalIncreaseDetail,
  onPressCapitalDecreaseDetail,
}: Props) {
  /**
   * "Capital" es la palabra del contador, no la del que vende: en una cuenta corriente con un
   * cliente cada aumento es una venta más. Las palabras salen del origen de la obligación.
   */
  const sellsOnCredit = obligation.originType === "sale_financed";
  const increaseWord = sellsOnCredit
    ? (capitalOverview.increaseCount === 1 ? "venta más" : "ventas más")
    : (capitalOverview.increaseCount === 1 ? "aumento" : "aumentos");
  const decreaseWord = sellsOnCredit
    ? (capitalOverview.decreaseCount === 1 ? "descuento" : "descuentos")
    : (capitalOverview.decreaseCount === 1 ? "reducción" : "reducciones");
  const openingLabel = `${sellsOnCredit ? "Primera venta" : "Apertura"}, ${format(parseDisplayDate(obligation.startDate), "d MMM", { locale: es })}`;

  const termsLine = [
    `Activa desde el ${format(parseDisplayDate(obligation.startDate), "d 'de' MMMM", { locale: es })}`,
    obligation.installmentAmount
      ? `cuota pactada ${formatCurrency(obligation.installmentAmount, obligation.currencyCode)}`
      : null,
    obligation.dueDate
      ? `vence ${format(parseDisplayDate(obligation.dueDate), "d MMM yyyy", { locale: es })}`
      : null,
  ].filter(Boolean).join(" · ");

  /** "3 de 6 pagos", cuando la obligación tiene plan. */
  const planProgressLabel = (() => {
    const plan = parsePaymentPlan(obligation.paymentPlan);
    if (!plan) return null;
    const scheduled = expandPaymentPlan({
      plan,
      principal: obligation.principalAmount,
      startDate: obligation.startDate,
    });
    if (scheduled.length === 0) return null;
    const paid = obligation.events.filter((event) => event.eventType === "payment").length;
    return `${Math.min(paid, scheduled.length)} de ${scheduled.length} pagos`;
  })();

  return (
    <>
      {/* La tarjeta apilaba cuatro líneas centradas para decir un número: la dirección en menta,
          el nombre del contacto, el rótulo y la cifra. El nombre y la dirección pertenecen al
          encabezado, junto al título. Aquí quedan el rótulo y el número, alineados a la
          izquierda como el resto de las cifras de la app. */}
      <Card style={styles.heroCard}>
        {/* La cifra grande es lo que FALTA, que es la pregunta con la que uno abre esta
            pantalla — no lo prestado. Y va en hueso: la barra de abajo es el único sitio donde
            la menta significa lo que debe significar, plata que entró. */}
        <Text style={styles.pendingLabel}>
          {obligationPendingDirectionBadge(obligation.direction, isSharedViewer)}
        </Text>
        <Text style={styles.pendingAmount}>
          {formatCurrency(obligation.pendingAmount, obligation.currencyCode)}
        </Text>
        <ProgressBar percent={capitalOverview.progressPercent} alertPercent={100} style={styles.progress} />
        <Text style={styles.progressLabel}>
          {capitalize(obligationProgressPaidAdjective(obligation.direction, isSharedViewer))}{" "}
          {formatCurrency(
            Math.max(0, capitalOverview.currentPrincipal - obligation.pendingAmount),
            obligation.currencyCode,
          )} de {formatCurrency(capitalOverview.currentPrincipal, obligation.currencyCode)}
          {planProgressLabel ? ` · ${planProgressLabel}` : ""}
        </Text>
        {/* La cuota y el vencimiento eran datos firmes en su propia sección, y se contradicen:
            a la cuota pactada, el saldo actual toma cinco años. Bajan a una línea de contexto,
            con "pactada" diciendo que es lo acordado, no lo que está pasando. */}
        {termsLine ? <Text style={styles.heroTerms}>{termsLine}</Text> : null}
      </Card>

      {/* Cuatro cifras de una sola resta iban en cuatro cajas con borde y dos colores, como si
          fueran cuatro indicadores independientes. Es una operación: se lee de arriba abajo y
          termina en el total, y el título dice qué pregunta responde. Sin verde y sin rojo —
          nadie perdió nada cuando le vendiste más. */}
      <Card style={styles.capitalSummaryCard}>
        <Text style={styles.sectionTitle}>
          Cómo llegó a {formatCurrency(capitalOverview.currentPrincipal, obligation.currencyCode)}
        </Text>
        <View style={styles.capitalMathRow}>
          <Text style={styles.capitalMathLabel} numberOfLines={1}>{openingLabel}</Text>
          <Text style={styles.capitalMathValue}>
            {formatCurrency(capitalOverview.openingAmount, obligation.currencyCode)}
          </Text>
        </View>
        {capitalOverview.increaseCount > 0 ? (
          <TouchableOpacity
            style={styles.capitalMathRow}
            activeOpacity={0.86}
            onPress={onPressCapitalIncreaseDetail}
            accessibilityRole="button"
          >
            <Text style={styles.capitalMathLabel} numberOfLines={1}>
              {capitalOverview.increaseCount} {increaseWord}
            </Text>
            <Text style={styles.capitalMathValue}>
              + {formatCurrency(capitalOverview.increaseTotal, obligation.currencyCode)}
            </Text>
          </TouchableOpacity>
        ) : null}
        {capitalOverview.decreaseCount > 0 ? (
          <TouchableOpacity
            style={styles.capitalMathRow}
            activeOpacity={0.86}
            onPress={onPressCapitalDecreaseDetail}
            accessibilityRole="button"
          >
            <Text style={styles.capitalMathLabel} numberOfLines={1}>
              {capitalOverview.decreaseCount} {decreaseWord}
            </Text>
            <Text style={styles.capitalMathValue}>
              − {formatCurrency(capitalOverview.decreaseTotal, obligation.currencyCode)}
            </Text>
          </TouchableOpacity>
        ) : null}
        <View style={[styles.capitalMathRow, styles.capitalMathTotalRow]}>
          <Text style={styles.capitalMathTotalLabel}>Suma a hoy</Text>
          <Text style={styles.capitalMathTotalValue}>
            {formatCurrency(capitalOverview.currentPrincipal, obligation.currencyCode)}
          </Text>
        </View>
      </Card>

    </>
  );
}
