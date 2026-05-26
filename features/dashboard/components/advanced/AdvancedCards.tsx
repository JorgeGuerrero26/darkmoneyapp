import { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";
import { differenceInDays, format, getDay, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { AlertCircle, ArrowRight, Banknote, Clock, Tag, type LucideIcon } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import type { DashboardMovementRow } from "../../../../services/queries/workspace-data";
import type { FinancialGraphRankNode } from "../../../../services/analytics/financial-graph";
import {
  expenseAmt,
  inRange,
  isCategorizedCashflow,
  isExpense,
  sortMovementsRecentFirst,
  transferAmt,
} from "../../lib/aggregations";
import { buildAnomalyFindings } from "../../lib/advanced-builders";
import type { ConversionCtx } from "../../lib/types";
import { SectionTitle } from "../simple/SectionTitle";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

export function AdvancedGiftCard() {
  return (
    <View style={subStyles.advancedGiftCard}>
      <View style={subStyles.advancedGiftHeartsRow}>
        <Text style={subStyles.advancedGiftHeart}>♥</Text>
        <Text style={subStyles.advancedGiftHeartSmall}>♥</Text>
        <Text style={subStyles.advancedGiftHeart}>♥</Text>
      </View>
      <Text style={subStyles.advancedGiftKicker}>Un regalo especial</Text>
      <Text style={subStyles.advancedGiftTitle}>Esto te lo muestro aunque seas free porque te quiero.</Text>
      <Text style={subStyles.advancedGiftBody}>
        Este dashboard avanzado queda abierto para ti: para que veas tus patrones, tu flujo y tu salud financiera con más cariño, más claridad y sin perderte entre números.
      </Text>
      <View style={subStyles.advancedGiftPill}>
        <Text style={subStyles.advancedGiftPillText}>Acceso avanzado activado solo para ti</Text>
      </View>
    </View>
  );
}

export function FinancialGraphCard({
  nodes,
  currency,
  onOpenNode,
}: {
  nodes: FinancialGraphRankNode[];
  currency: string;
  onOpenNode: (node: FinancialGraphRankNode) => void;
}) {
  if (nodes.length === 0) return null;

  function kindLabel(node: FinancialGraphRankNode) {
    if (node.kind === "account") return "Cuenta";
    if (node.kind === "category") return "Categoría";
    if (node.kind === "counterparty") return "Contacto";
    return "Flujo";
  }

  return (
    <Card>
      <SectionTitle>Nodos que más mueven tu sistema</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Une cuenta, categoría, contacto y tipo de movimiento. Si algo aparece arriba, está muy conectado con tu dinero reciente.
      </Text>
      <Text style={subStyles.scopeHint}>
        Alcance: movimientos confirmados de los últimos 90 días cargados por el dashboard.
      </Text>
      <View style={subStyles.commandActions}>
        {nodes.map((node) => (
          <TouchableOpacity key={node.id} style={subStyles.commandActionRow} onPress={() => onOpenNode(node)} activeOpacity={0.82}>
            <View style={subStyles.commandActionCopy}>
              <View style={subStyles.suggestionRowTop}>
                <Text style={subStyles.commandActionTitle} numberOfLines={1}>{node.label}</Text>
                <View style={subStyles.miniChip}>
                  <Text style={subStyles.miniChipText}>{node.score}/100</Text>
                </View>
              </View>
              <Text style={subStyles.commandActionBody}>
                {kindLabel(node)} · {node.movementCount} movimiento{node.movementCount === 1 ? "" : "s"} · {formatCurrency(node.amount, currency)}
              </Text>
              <Text style={subStyles.commandActionBody}>{node.reason}</Text>
            </View>
            <ArrowRight size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ))}
      </View>
    </Card>
  );
}

export function AlgorithmReadinessCard({
  title,
  body,
  checks,
}: {
  title: string;
  body: string;
  checks: Array<{ label: string; current: number; required: number; detail: string }>;
}) {
  return (
    <Card>
      <SectionTitle>{title}</SectionTitle>
      <Text style={subStyles.executiveIntro}>{body}</Text>
      <View style={subStyles.readinessList}>
        {checks.map((check) => {
          const ready = check.current >= check.required;
          const pct = Math.max(0, Math.min(100, Math.round((check.current / Math.max(check.required, 1)) * 100)));
          return (
            <View key={check.label} style={subStyles.readinessRow}>
              <View style={subStyles.readinessTop}>
                <Text style={subStyles.readinessLabel}>{check.label}</Text>
                <Text style={[subStyles.readinessStatus, { color: ready ? COLORS.income : COLORS.gold }]}>
                  {ready ? "Listo" : `${check.current}/${check.required}`}
                </Text>
              </View>
              <View style={subStyles.readinessTrack}>
                <View style={[subStyles.readinessFill, { width: `${pct}%` as any, backgroundColor: ready ? COLORS.income : COLORS.gold }]} />
              </View>
              <Text style={subStyles.readinessDetail}>{check.detail}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

export function WeeklyPattern({
  movements,
  ctx,
  onOpenDay,
}: {
  movements: DashboardMovementRow[];
  ctx: ConversionCtx;
  onOpenDay?: (day: {
    shortLabel: string;
    fullLabel: string;
    total: number;
    average: number;
    count: number;
    weekCount: number;
    movements: DashboardMovementRow[];
  }) => void;
}) {
  const DAY_LABELS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];
  const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

  const byDay = Array.from({ length: 7 }, () => ({ total: 0, count: 0, movements: [] as DashboardMovementRow[] }));
  const weekSet = new Set<string>();

  for (const m of movements.filter(isExpense)) {
    const d = new Date(m.occurredAt);
    const jsDay = getDay(d);
    const idx = jsDay === 0 ? 6 : jsDay - 1;
    byDay[idx].total += expenseAmt(m, ctx);
    byDay[idx].count += 1;
    byDay[idx].movements.push(m);
    const weekKey = `${d.getFullYear()}-${format(startOfWeek(d, { weekStartsOn: 1 }), "MM-dd")}`;
    weekSet.add(weekKey);
  }

  const weekCount = Math.max(weekSet.size, 1);
  const averages = byDay.map((d) => d.total / weekCount);
  const maxAvg = Math.max(...averages, 1);
  const totalExpense = byDay.reduce((sum, day) => sum + day.total, 0);
  const totalCount = byDay.reduce((sum, day) => sum + day.count, 0);
  const topIndex = byDay.reduce((best, day, index) => (day.total > byDay[best].total ? index : best), 0);
  const BAR_HEIGHT = 56;

  if (averages.every((a) => a === 0)) return null;

  return (
    <Card>
      <SectionTitle>Patrón semanal de gastos</SectionTitle>
      <Text style={subStyles.executiveIntro}>
        Agrupa tus gastos por día de la semana para ver cuándo suele salir más dinero.
      </Text>
      <View style={subStyles.weeklyPatternSummary}>
        <View style={subStyles.weeklyPatternPill}>
          <Text style={subStyles.weeklyPatternPillLabel}>Día más pesado</Text>
          <Text style={subStyles.weeklyPatternPillValue}>{DAY_NAMES[topIndex]}</Text>
        </View>
        <View style={subStyles.weeklyPatternPill}>
          <Text style={subStyles.weeklyPatternPillLabel}>Gastos vistos</Text>
          <Text style={subStyles.weeklyPatternPillValue}>{totalCount} mov.</Text>
        </View>
        <View style={subStyles.weeklyPatternPill}>
          <Text style={subStyles.weeklyPatternPillLabel}>Total</Text>
          <Text style={subStyles.weeklyPatternPillValue}>{formatCurrency(totalExpense, ctx.displayCurrency)}</Text>
        </View>
      </View>
      <View style={subStyles.chartRow}>
        {averages.map((avg, i) => {
          const day = byDay[i];
          const disabled = day.count === 0;
          return (
            <TouchableOpacity
              key={DAY_LABELS[i]}
              style={[subStyles.chartCol, subStyles.weeklyDayButton, disabled && subStyles.weeklyDayButtonDisabled]}
              disabled={disabled}
              onPress={() =>
                onOpenDay?.({
                  shortLabel: DAY_LABELS[i],
                  fullLabel: DAY_NAMES[i],
                  total: day.total,
                  average: avg,
                  count: day.count,
                  weekCount,
                  movements: sortMovementsRecentFirst(day.movements),
                })
              }
              activeOpacity={0.84}
            >
              <Text style={subStyles.weeklyDayAmount} numberOfLines={1}>{formatCurrency(avg, ctx.displayCurrency)}</Text>
              <View style={[subStyles.chartBars, { height: BAR_HEIGHT, justifyContent: "flex-end" }]}>
                <View style={[subStyles.weeklyBar, { height: Math.max((avg / maxAvg) * BAR_HEIGHT, avg > 0 ? 3 : 0) }]} />
              </View>
              <Text style={subStyles.chartLabel}>{DAY_LABELS[i]}</Text>
              <Text style={subStyles.weeklyDayCount}>{day.count} mov.</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

export function TransferSnapshot({
  movements,
  accounts,
  ctx,
  onOpenRoute,
}: {
  movements: DashboardMovementRow[];
  accounts: { id: number; name: string }[];
  ctx: ConversionCtx;
  onOpenRoute?: (route: { srcName: string; dstName: string; total: number; count: number; movementIds: number[] }) => void;
}) {
  const accMap = new Map(accounts.map((a) => [a.id, a.name]));
  const routeMap = new Map<string, { srcId: number; dstId: number; total: number; count: number; movementIds: number[] }>();
  for (const m of movements.filter((m) => m.movementType === "transfer" && m.status === "posted")) {
    if (!m.sourceAccountId || !m.destinationAccountId) continue;
    const key = `${m.sourceAccountId}-${m.destinationAccountId}`;
    const existing = routeMap.get(key);
    if (existing) {
      existing.total += transferAmt(m, ctx);
      existing.count++;
      existing.movementIds.push(m.id);
    } else {
      routeMap.set(key, {
        srcId: m.sourceAccountId,
        dstId: m.destinationAccountId,
        total: transferAmt(m, ctx),
        count: 1,
        movementIds: [m.id],
      });
    }
  }

  const routes = Array.from(routeMap.values()).sort((a, b) => b.total - a.total).slice(0, 3);
  if (routes.length === 0) return null;

  return (
    <Card>
      <SectionTitle>Rutas de transferencia</SectionTitle>
      <Text style={subStyles.executiveIntro}>Toca una ruta para ver las transferencias exactas entre esas cuentas.</Text>
      {routes.map((r, i) => {
        const srcName = accMap.get(r.srcId) ?? `Cuenta ${r.srcId}`;
        const dstName = accMap.get(r.dstId) ?? `Cuenta ${r.dstId}`;
        return (
          <TouchableOpacity
            key={i}
            style={[subStyles.transferRow, i < routes.length - 1 && subStyles.leadersSep]}
            onPress={() => onOpenRoute?.({ ...r, srcName, dstName })}
            activeOpacity={0.82}
          >
            <View style={subStyles.transferRoute}>
              <Text style={subStyles.transferAcct} numberOfLines={1}>{srcName}</Text>
              <ArrowRight size={12} color={COLORS.storm} />
              <Text style={subStyles.transferAcct} numberOfLines={1}>{dstName}</Text>
            </View>
            <View style={subStyles.transferRight}>
              <Text style={subStyles.transferAmt}>{formatCurrency(r.total, ctx.displayCurrency)}</Text>
              <Text style={subStyles.transferCount}>{r.count} mov.</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </Card>
  );
}

export function DataQuality({
  movements,
  onOpenNoCategory,
  onOpenNoCounterparty,
}: {
  movements: DashboardMovementRow[];
  onOpenNoCategory?: () => void;
  onOpenNoCounterparty?: () => void;
}) {
  const relevant = movements.filter((m) => isCategorizedCashflow(m));
  const noCat = relevant.filter((m) => m.categoryId == null).length;
  const noCounterparty = relevant.filter((m) => m.counterpartyId == null).length;

  if (noCat === 0 && noCounterparty === 0) return null;

  return (
    <Card>
      <SectionTitle>Calidad de datos</SectionTitle>
      {noCat > 0 && (
        <TouchableOpacity style={subStyles.dqRow} onPress={onOpenNoCategory} activeOpacity={0.82}>
          <Tag size={13} color={COLORS.gold} />
          <Text style={subStyles.dqText}>{noCat} movimiento{noCat !== 1 ? "s" : ""} sin categoría</Text>
          <ArrowRight size={14} color={COLORS.storm} />
        </TouchableOpacity>
      )}
      {noCounterparty > 0 && (
        <TouchableOpacity style={subStyles.dqRow} onPress={onOpenNoCounterparty} activeOpacity={0.82}>
          <AlertCircle size={13} color={COLORS.storm} />
          <Text style={subStyles.dqText}>{noCounterparty} movimiento{noCounterparty !== 1 ? "s" : ""} sin contraparte</Text>
          <ArrowRight size={14} color={COLORS.storm} />
        </TouchableOpacity>
      )}
    </Card>
  );
}

export function CurrencyExposure({
  accounts,
}: {
  accounts: { id: number; name: string; currencyCode: string; currentBalance: number; isArchived: boolean }[];
}) {
  const active = accounts.filter((a) => !a.isArchived && a.currentBalance > 0);
  if (active.length === 0) return null;

  const byCode = new Map<string, number>();
  for (const a of active) {
    byCode.set(a.currencyCode, (byCode.get(a.currencyCode) ?? 0) + a.currentBalance);
  }

  const total = Array.from(byCode.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return null;

  const TINTS = [COLORS.pine, COLORS.ember, COLORS.gold, COLORS.rosewood, COLORS.storm];
  const entries = Array.from(byCode.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <Card>
      <SectionTitle>Exposición por moneda</SectionTitle>
      {entries.map(([code, amount], i) => {
        const pct = (amount / total) * 100;
        const color = TINTS[i % TINTS.length];
        return (
          <View key={code} style={subStyles.currencyRow}>
            <View style={subStyles.currencyLabel}>
              <View style={[subStyles.currencyDot, { backgroundColor: color }]} />
              <Text style={subStyles.currencyCode}>{code}</Text>
              <Text style={subStyles.currencyPct}>{pct.toFixed(1)}%</Text>
            </View>
            <View style={subStyles.currencyTrack}>
              <View style={[subStyles.currencyFill, { width: `${pct}%`, backgroundColor: color + "99" }]} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

export function PeriodRadar({
  income,
  expense,
  catTotals,
  categories,
  curStart,
  curEnd,
  movements,
}: {
  income: number;
  expense: number;
  catTotals: Map<number | null, number>;
  categories: { id: number; name: string }[];
  curStart: Date;
  curEnd: Date;
  movements: DashboardMovementRow[];
}) {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;

  let topCatName = "-";
  let topCatAmt = 0;
  for (const [id, total] of catTotals.entries()) {
    if (total > topCatAmt) {
      topCatAmt = total;
      topCatName = catMap.get(id ?? -1) ?? "Sin categoría";
    }
  }

  const daysInPeriod = Math.max(differenceInDays(curEnd, curStart), 1);

  const expenseDays = new Set<string>();
  for (const m of movements.filter(isExpense)) {
    if (inRange(m, curStart, curEnd)) {
      expenseDays.add(format(new Date(m.occurredAt), "yyyy-MM-dd"));
    }
  }
  const daysWithoutExpense = daysInPeriod - expenseDays.size;
  const avgDaily = expense / daysInPeriod;

  const noCatCount = movements.filter((m) => inRange(m, curStart, curEnd) && m.categoryId === null && isExpense(m)).length;

  const items = [
    { label: "Tasa de ahorro", value: `${savingsRate.toFixed(1)}%` },
    { label: "Mayor gasto", value: topCatAmt > 0 ? `${topCatName}` : "-" },
    { label: "Días sin gastar", value: `${Math.max(daysWithoutExpense, 0)}` },
    { label: "Promedio diario", value: formatCurrency(avgDaily, "") },
    { label: "Mov. sin categoría", value: `${noCatCount}` },
  ];

  return (
    <Card>
      <SectionTitle>Resumen del período</SectionTitle>
      <View style={subStyles.radarGrid}>
        {items.map((item, i) => (
          <View key={i} style={subStyles.radarItem}>
            <Text style={subStyles.radarLabel}>{item.label}</Text>
            <Text style={subStyles.radarValue}>{item.value}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function ActivityTimeline({ snapshot }: { snapshot: any }) {
  const log: any[] = snapshot?.activityLog ?? [];
  if (log.length === 0) return null;

  const items = log.slice(0, 12);

  function iconFor(entityType: string): LucideIcon {
    if (entityType === "movement") return Banknote;
    if (entityType === "obligation") return AlertCircle;
    if (entityType === "subscription") return Clock;
    return Tag;
  }

  return (
    <Card>
      <SectionTitle>Actividad reciente</SectionTitle>
      {items.map((entry: any, i: number) => {
        const Icon = iconFor(entry.entity_type ?? "");
        const d = entry.created_at ? new Date(entry.created_at) : null;
        return (
          <View key={i} style={[subStyles.timelineRow, i < items.length - 1 && subStyles.leadersSep]}>
            <Icon size={14} color={COLORS.storm} />
            <View style={subStyles.timelineContent}>
              <Text style={subStyles.timelineDesc} numberOfLines={2}>
                {entry.description ?? `${entry.action ?? ""} ${entry.entity_type ?? ""}`}
              </Text>
              {d && <Text style={subStyles.timelineDate}>{format(d, "d MMM HH:mm", { locale: es })}</Text>}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

export function AnomalyWatch({
  movements,
  ctx,
  categoryMap,
  accountMap,
  onExplainPress,
  onOpenMovement,
  onOpenAll,
  router,
}: {
  movements: DashboardMovementRow[];
  ctx: ConversionCtx;
  categoryMap: Map<number, string>;
  accountMap: Map<number, string>;
  onExplainPress?: () => void;
  onOpenMovement?: (movementId: number) => void;
  onOpenAll?: (movementIds: number[]) => void;
  router: ReturnType<typeof useRouter>;
}) {
  const anomalies = useMemo(
    () => buildAnomalyFindings(movements, ctx, categoryMap, accountMap),
    [accountMap, categoryMap, ctx, movements],
  );

  if (anomalies.length === 0) return null;

  return (
    <Card>
      <View style={subStyles.cardHeaderWithAction}>
        <SectionTitle>Movimientos para revisar</SectionTitle>
        {onExplainPress ? (
          <TouchableOpacity style={subStyles.inlineExplainBtn} onPress={onExplainPress} activeOpacity={0.82}>
            <Text style={subStyles.inlineExplainBtnText}>Entender</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={subStyles.anomalyList}>
        {anomalies.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[subStyles.anomalyCard, item.level === "strong" ? subStyles.anomalyCardStrong : subStyles.anomalyCardReview]}
            onPress={() => {
              if (onOpenMovement) {
                onOpenMovement(item.movementId);
                return;
              }
              router.push(`/movement/${item.movementId}?from=dashboard`);
            }}
            activeOpacity={0.84}
          >
            <View style={subStyles.anomalyTop}>
              <Text style={subStyles.anomalyTitle}>{item.title}</Text>
              <View style={[subStyles.anomalyBadge, item.level === "strong" ? subStyles.anomalyBadgeStrong : subStyles.anomalyBadgeReview]}>
                <Text style={[subStyles.anomalyBadgeText, item.level === "strong" ? subStyles.anomalyBadgeTextStrong : subStyles.anomalyBadgeTextReview]}>
                  {item.level === "strong" ? "Fuerte" : "Revisar"}
                </Text>
              </View>
            </View>
            <Text style={subStyles.anomalyBody}>{item.body}</Text>
            <View style={subStyles.anomalyBottom}>
              <Text style={subStyles.anomalyMeta}>{item.meta}</Text>
              <ArrowRight size={15} color={COLORS.storm} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity
        style={subStyles.secondaryOutlineBtn}
        onPress={() => {
          if (onOpenAll) {
            onOpenAll(anomalies.map((item) => item.movementId));
            return;
          }
          router.push("/movements" as never);
        }}
        activeOpacity={0.82}
      >
        <Text style={subStyles.secondaryOutlineBtnText}>Abrir movimientos para revisar</Text>
      </TouchableOpacity>
    </Card>
  );
}

export function DashboardLayerHeader({ kicker, title, bullets }: { kicker: string; title: string; bullets: string[] }) {
  return (
    <View style={subStyles.layerSection}>
      <Text style={subStyles.layerSectionKicker}>{kicker}</Text>
      <Text style={subStyles.layerSectionTitle}>{title}</Text>
      <View style={subStyles.layerBulletList}>
        {bullets.map((b) => (
          <View key={b} style={subStyles.layerBulletRow}>
            <Text style={subStyles.layerBulletDot}>·</Text>
            <Text style={subStyles.layerSectionBody}>{b}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
