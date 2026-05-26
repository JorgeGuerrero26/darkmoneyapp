import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { addDays, differenceInDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, AlertTriangle, ArrowRight, Clock, Tag, type LucideIcon } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, SPACING } from "../../../../constants/theme";
import type { DashboardMovementRow } from "../../../../services/queries/workspace-data";
import type { PaymentOptimizationRecommendation } from "../../../../services/analytics/payment-optimization";
import { isCategorizedCashflow } from "../../lib/aggregations";
import { SectionTitle } from "../simple/SectionTitle";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

export function HealthScore({
  netWorth,
  income,
  expense,
  obligations,
  netWorthThreeMonthExpense,
}: {
  netWorth: number;
  income: number;
  expense: number;
  obligations: { direction: string; pendingAmount: number; dueDate: string | null; status: string }[];
  netWorthThreeMonthExpense: number;
}) {
  void netWorthThreeMonthExpense;
  const now = new Date();
  const totalPayable = obligations.filter((o) => o.direction === "payable" && o.status === "active").reduce((s, o) => s + o.pendingAmount, 0);
  const overdueCount = obligations.filter(
    (o) => o.direction === "payable" && o.status === "active" && o.dueDate && new Date(o.dueDate) < now,
  ).length;

  const savingsRate = income > 0 ? (income - expense) / income : 0;
  const coverageMonths = expense > 0 ? netWorth / expense : 12;
  const debtToIncome = income > 0 ? totalPayable / income : 0;

  function scoreFor(value: number, thresholds: [number, number, number]): number {
    if (value >= thresholds[0]) return 100;
    if (value >= thresholds[1]) return 75;
    if (value >= thresholds[2]) return 50;
    return 25;
  }

  const s1 = scoreFor(savingsRate, [0.2, 0.1, 0]);
  const s2 = scoreFor(coverageMonths, [6, 3, 1]);
  const s3 = scoreFor(1 - Math.min(debtToIncome, 1.5) / 1.5, [0.8, 0.5, 0.2]);
  const s4 = overdueCount === 0 ? 100 : overdueCount === 1 ? 75 : overdueCount === 2 ? 50 : 25;
  const score = Math.round((s1 + s2 + s3 + s4) / 4);

  const scoreColor = score >= 80 ? COLORS.income : score >= 60 ? COLORS.warning : COLORS.expense;

  const indicators = [
    {
      label: "Tasa de ahorro",
      value: s1,
      desc: `${(savingsRate * 100).toFixed(1)}% del ingreso`,
      interpret:
        s1 >= 75
          ? "Buen margen — ahorras más del 20% del ingreso."
          : s1 >= 50
            ? "Ahorro por debajo del 10% — margen ajustado."
            : savingsRate < 0
              ? "Gastos superan los ingresos este mes."
              : "Ahorrando poco — sin margen para imprevistos.",
    },
    {
      label: "Meses de cobertura",
      value: s2,
      desc: `${coverageMonths.toFixed(1)} meses`,
      interpret:
        s2 >= 75
          ? "Cobertura sólida — más de 6 meses de reserva."
          : s2 >= 50
            ? "Cobertura suficiente, pero ajustada (3–6 meses)."
            : "Menos de 3 meses de reserva — zona de precaución.",
    },
    {
      label: "Relación deuda/ingreso",
      value: s3,
      desc: `${(debtToIncome * 100).toFixed(1)}%`,
      interpret:
        s3 >= 75
          ? "Deuda manejable respecto al ingreso mensual."
          : s3 >= 50
            ? "Obligaciones moderadas — monitorear de cerca."
            : "Obligaciones elevadas vs ingresos — prioriza resolver.",
    },
    {
      label: "Obligaciones al día",
      value: s4,
      desc: overdueCount === 0 ? "Sin vencidas" : `${overdueCount} vencidas`,
      interpret:
        overdueCount === 0
          ? "Todo al día — sin compromisos vencidos."
          : overdueCount === 1
            ? "Hay 1 obligación vencida — actúa pronto."
            : `${overdueCount} obligaciones vencidas — requieren atención urgente.`,
    },
  ];

  return (
    <Card>
      <View style={subStyles.healthHeader}>
        <View style={{ gap: 2 }}>
          <SectionTitle>Salud financiera</SectionTitle>
          <Text style={subStyles.healthScoreInterpret}>
            {score >= 80
              ? "Finanzas en buen estado — sin señales de alerta."
              : score >= 60
                ? "Estado aceptable — hay áreas que mejorar."
                : "Varias señales de alerta — revisa los indicadores en rojo."}
          </Text>
        </View>
        <View style={[subStyles.healthScore, { borderColor: scoreColor + "55" }]}>
          <Text style={[subStyles.healthScoreNum, { color: scoreColor }]}>{score}</Text>
          <Text style={subStyles.healthScoreOf}>/100</Text>
        </View>
      </View>
      {indicators.map((ind) => (
        <View key={ind.label} style={subStyles.healthRow}>
          <View style={subStyles.healthLabelRow}>
            <Text style={subStyles.healthLabel}>{ind.label}</Text>
            <Text style={subStyles.healthDesc}>{ind.desc}</Text>
          </View>
          <View style={subStyles.healthTrack}>
            <View style={[subStyles.healthFill, { width: `${ind.value}%`, backgroundColor: ind.value >= 75 ? COLORS.income : ind.value >= 50 ? COLORS.warning : COLORS.expense }]} />
          </View>
          <Text style={[subStyles.healthInterpret, { color: ind.value >= 75 ? COLORS.income : ind.value >= 50 ? COLORS.gold : COLORS.expense }]}>
            {ind.interpret}
          </Text>
        </View>
      ))}
    </Card>
  );
}

type AlertItem = {
  key: string;
  icon: LucideIcon;
  color: string;
  message: string;
};

export function AlertCenter({
  budgets,
  obligations,
  subscriptions,
  movements,
}: {
  budgets: { id: number; name: string; isOverLimit: boolean }[];
  obligations: { id: number; title: string; dueDate: string | null; status: string }[];
  subscriptions: { id: number; name: string; nextDueDate: string }[];
  movements: DashboardMovementRow[];
}) {
  const now = new Date();
  const in3Days = addDays(now, 3);

  const alerts: AlertItem[] = [];

  for (const b of budgets.filter((b) => b.isOverLimit)) {
    alerts.push({
      key: `budget-${b.id}`,
      icon: AlertCircle,
      color: COLORS.rosewood,
      message: `Presupuesto "${b.name}" excedido`,
    });
  }

  for (const o of obligations) {
    if (o.status === "active" && o.dueDate && new Date(o.dueDate) < now) {
      alerts.push({
        key: `ob-overdue-${o.id}`,
        icon: AlertTriangle,
        color: COLORS.rosewood,
        message: `Obligación vencida: "${o.title}"`,
      });
    }
  }

  for (const s of subscriptions) {
    const d = new Date(s.nextDueDate);
    if (d >= now && d <= in3Days) {
      alerts.push({
        key: `sub-due-${s.id}`,
        icon: Clock,
        color: COLORS.gold,
        message: `Suscripción próxima: "${s.name}" el ${format(d, "d MMM", { locale: es })}`,
      });
    }
  }

  const noCatCount = movements.filter((m) => m.categoryId === null && isCategorizedCashflow(m)).length;
  if (noCatCount > 0) {
    alerts.push({
      key: "no-cat",
      icon: Tag,
      color: COLORS.gold,
      message: `${noCatCount} movimiento${noCatCount !== 1 ? "s" : ""} sin categoría`,
    });
  }

  return (
    <Card>
      <SectionTitle>Centro de alertas</SectionTitle>
      {alerts.length === 0 ? (
        <Text style={subStyles.alertEmpty}>Sin alertas activas</Text>
      ) : (
        alerts.map((a) => {
          const Icon = a.icon;
          return (
            <View key={a.key} style={subStyles.alertRow}>
              <Icon size={14} color={a.color} />
              <Text style={[subStyles.alertText, { color: a.color }]}>{a.message}</Text>
            </View>
          );
        })
      )}
    </Card>
  );
}

export function ObligationWatch({
  obligations,
  router,
}: {
  obligations: {
    id: number;
    title: string;
    direction: string;
    status: string;
    counterparty: string;
    pendingAmount: number;
    currencyCode: string;
    dueDate: string | null;
  }[];
  router: ReturnType<typeof useRouter>;
}) {
  const now = new Date();
  const active = obligations.filter((o) => o.status === "active");
  if (active.length === 0) return null;

  const receivable = active.filter((o) => o.direction === "receivable");
  const payable = active.filter((o) => o.direction === "payable");

  function agingText(dueDate: string | null): { text: string; color: string } {
    if (!dueDate) return { text: "Sin fecha", color: COLORS.storm };
    const d = new Date(dueDate);
    const days = differenceInDays(d, now);
    if (days < 0) return { text: `${Math.abs(days)}d vencida`, color: COLORS.rosewood };
    if (days === 0) return { text: "Hoy", color: COLORS.gold };
    return { text: `en ${days}d`, color: COLORS.storm };
  }

  function renderGroup(title: string, items: typeof active, color: string) {
    if (items.length === 0) return null;
    return (
      <View style={{ marginBottom: SPACING.sm }}>
        <Text style={[subStyles.obGroupTitle, { color }]}>{title}</Text>
        {items.map((o) => {
          const aging = agingText(o.dueDate);
          return (
            <TouchableOpacity key={o.id} style={subStyles.obRow} onPress={() => router.push(`/obligation/${o.id}`)} activeOpacity={0.75}>
              <View style={subStyles.obLeft}>
                <Text style={subStyles.obTitle} numberOfLines={1}>{o.title}</Text>
                <Text style={subStyles.obCounterparty} numberOfLines={1}>{o.counterparty}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                <Text style={[subStyles.obAmount, { color }]}>{formatCurrency(o.pendingAmount, o.currencyCode)}</Text>
                <Text style={[subStyles.obCounterparty, { color: aging.color }]}>{aging.text}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  return (
    <Card>
      <SectionTitle>Seguimiento de obligaciones</SectionTitle>
      {renderGroup("Por cobrar", receivable, COLORS.pine)}
      {renderGroup("Por pagar", payable, COLORS.rosewood)}
    </Card>
  );
}

export function PaymentOptimizationCard({
  recommendations,
  currency,
  router,
}: {
  recommendations: PaymentOptimizationRecommendation[];
  currency: string;
  router: ReturnType<typeof useRouter>;
}) {
  if (recommendations.length === 0) return null;

  function dueLabel(daysUntilDue: number | null) {
    if (daysUntilDue == null) return "sin fecha";
    if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}d vencido`;
    if (daysUntilDue === 0) return "vence hoy";
    return `en ${daysUntilDue}d`;
  }

  return (
    <Card>
      <SectionTitle>Optimización de pagos</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Ordena cobros y pagos por lo que más puede bajar presión de caja. No mueve dinero solo; te dice qué revisar primero.
      </Text>
      <View style={subStyles.commandActions}>
        {recommendations.map((item) => (
          <TouchableOpacity key={`${item.direction}-${item.id}`} style={subStyles.commandActionRow} onPress={() => router.push(`/obligation/${item.id}`)} activeOpacity={0.82}>
            <View style={subStyles.commandActionCopy}>
              <View style={subStyles.suggestionRowTop}>
                <Text style={subStyles.commandActionTitle} numberOfLines={1}>
                  {item.actionLabel}: {item.title}
                </Text>
                <View style={subStyles.miniChip}>
                  <Text style={subStyles.miniChipText}>{item.score}/100</Text>
                </View>
              </View>
              <Text style={subStyles.commandActionBody}>
                {formatCurrency(item.amount, currency)} · {dueLabel(item.daysUntilDue)} · {item.subtitle}
              </Text>
              <Text style={subStyles.commandActionBody}>{item.reason}</Text>
            </View>
            <ArrowRight size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}
