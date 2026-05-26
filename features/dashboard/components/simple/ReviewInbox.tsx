import { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { AlertCircle, AlertTriangle, ArrowRight, Banknote, Bell, Clock, Sparkles, Tag } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { COLORS } from "../../../../constants/theme";
import type { DashboardMovementRow } from "../../../../services/queries/workspace-data";
import { buildReviewInboxSnapshot } from "../../lib/dashboard-builders";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type ReviewInboxProps = {
  movements: DashboardMovementRow[];
  subscriptions: Array<{ id: number; name: string; accountId?: number | null; nextDueDate: string; status: string }>;
  obligations: Array<{
    id: number;
    title: string;
    pendingAmount: number;
    dueDate: string | null;
    installmentCount?: number | null;
    installmentAmount?: number | null;
    lastPaymentDate?: string | null;
    startDate?: string;
    status: string;
  }>;
  router: ReturnType<typeof useRouter>;
  onOpenMovementIssue?: (key: "uncategorized" | "pending" | "duplicates") => void;
};

export function ReviewInbox({ movements, subscriptions, obligations, router, onOpenMovementIssue }: ReviewInboxProps) {
  const review = useMemo(
    () => buildReviewInboxSnapshot(movements, subscriptions, obligations),
    [movements, obligations, subscriptions],
  );

  const items = [
    { key: "uncategorized", count: review.uncategorizedCount, title: "Sin categoria", detail: "Movimientos aplicados que aun no clasificas.", route: "/movements", icon: Tag, tone: COLORS.warning },
    { key: "pending", count: review.pendingMovementsCount, title: "Pendientes de aplicar", detail: "Todavia no impactan el saldo real.", route: "/movements", icon: Clock, tone: COLORS.warning },
    { key: "duplicates", count: review.duplicateExpenseGroups, title: "Posibles duplicados", detail: "Fecha cercana, monto parecido y texto similar.", route: "/movements", icon: AlertTriangle, tone: COLORS.warning },
    { key: "subscriptions", count: review.subscriptionsAttentionCount, title: "Suscripciones por revisar", detail: "Sin cuenta ligada o con vencimiento pasado.", route: "/subscriptions", icon: Bell, tone: COLORS.secondary },
    { key: "without-plan", count: review.obligationsWithoutPlanCount, title: "Cartera sin plan claro", detail: "Saldo vivo sin cuota ni fecha concreta.", route: "/obligations", icon: Banknote, tone: COLORS.warning },
    { key: "stale", count: review.staleObligationsCount, title: "Cartera sin actividad reciente", detail: "Mas de 50 dias sin eventos nuevos.", route: "/obligations", icon: AlertCircle, tone: COLORS.storm },
    { key: "overdue", count: review.overdueObligationsCount, title: "Cobros o pagos vencidos", detail: "Compromisos con fecha pasada y saldo pendiente.", route: "/obligations", icon: AlertTriangle, tone: COLORS.expense },
  ].filter((item) => item.count > 0);

  return (
    <Card>
      <SectionTitle>Por revisar</SectionTitle>
      {items.length === 0 ? (
        <View style={subStyles.richEmptyState}>
          <Sparkles size={18} color={COLORS.income} />
          <Text style={subStyles.richEmptyTitle}>Bandeja al dia</Text>
          <Text style={subStyles.richEmptyBody}>
            No vemos pendientes fuertes en categorias, duplicados, suscripciones ni cartera.
          </Text>
        </View>
      ) : (
        <View style={subStyles.reviewList}>
          {items.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={subStyles.reviewItem}
              onPress={() => {
                if (
                  (item.key === "uncategorized" || item.key === "pending" || item.key === "duplicates") &&
                  onOpenMovementIssue
                ) {
                  onOpenMovementIssue(item.key);
                  return;
                }
                router.push(item.route as never);
              }}
              activeOpacity={0.82}
            >
              <View style={[subStyles.reviewItemIconWrap, { backgroundColor: item.tone + "16" }]}>
                <item.icon size={15} color={item.tone} />
              </View>
              <View style={subStyles.reviewItemCopy}>
                <Text style={subStyles.reviewItemTitle}>{item.title}</Text>
                <Text style={subStyles.reviewItemBody}>{item.detail}</Text>
              </View>
              <View style={subStyles.reviewItemRight}>
                <Text style={subStyles.reviewItemCount}>{item.count}</Text>
                <ArrowRight size={14} color={COLORS.storm} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </Card>
  );
}
