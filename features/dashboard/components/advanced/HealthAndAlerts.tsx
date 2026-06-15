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
import { buildHealthScore } from "../../lib/health";
import { SectionTitle } from "../simple/SectionTitle";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

export function HealthScore({
  liquidMoney,
  averageMonthlyExpense,
  periodIncome,
  periodNet,
  totalPayable,
  overdueCount,
}: {
  liquidMoney: number;
  averageMonthlyExpense: number;
  periodIncome: number;
  periodNet: number;
  totalPayable: number;
  overdueCount: number;
}) {
  // Score unificado web/móvil (features/dashboard/lib/health.ts, espejo del paquete).
  const health = buildHealthScore({
    liquidMoney,
    averageMonthlyExpense,
    periodIncome,
    periodNet,
    totalPayable,
    overdueCount,
  });
  const score = health.score;
  const scoreColor = score >= 80 ? COLORS.income : score >= 60 ? COLORS.warning : COLORS.expense;

  return (
    <Card>
      <View style={subStyles.healthHeader}>
        <View style={{ gap: 2 }}>
          <SectionTitle>Salud financiera</SectionTitle>
          <Text style={subStyles.healthScoreInterpret}>{health.headline}</Text>
        </View>
        <View style={[subStyles.healthScore, { borderColor: scoreColor + "55" }]}>
          <Text style={[subStyles.healthScoreNum, { color: scoreColor }]}>{score}</Text>
          <Text style={subStyles.healthScoreOf}>/100</Text>
        </View>
      </View>
      {health.indicators.map((ind) => (
        <View key={ind.key} style={subStyles.healthRow}>
          <View style={subStyles.healthLabelRow}>
            <Text style={subStyles.healthLabel}>{ind.label}</Text>
            <Text style={subStyles.healthDesc}>{ind.valueLabel}</Text>
          </View>
          <View style={subStyles.healthTrack}>
            <View style={[subStyles.healthFill, { width: `${ind.score}%`, backgroundColor: ind.score >= 75 ? COLORS.income : ind.score >= 50 ? COLORS.warning : COLORS.expense }]} />
          </View>
          <Text style={[subStyles.healthInterpret, { color: ind.score >= 75 ? COLORS.income : ind.score >= 50 ? COLORS.gold : COLORS.expense }]}>
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
