import { useMemo } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronRight, X } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "expo-router";

import { formatCurrency } from "../ui/AmountDisplay";
import { parseDisplayDate } from "../../lib/date";
import { ACCOUNT_ANALYTICS_LIMIT, useAccountAnalyticsQuery } from "../../services/queries/workspace-data";
import { useWorkspace } from "../../lib/workspace-context";
import { currencyPluralName } from "../../constants/currencies";
import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import type { AccountSummary } from "../../types/domain";
import { SafeBlurView } from "../ui/SafeBlurView";
import { useDismissibleSheet } from "../ui/useDismissibleSheet";

type Props = {
  visible: boolean;
  account: AccountSummary | null;
  onClose: () => void;
};

/** Cuántas categorías se listan antes de agrupar el resto. */
const VISIBLE_CATEGORIES = 4;

const SPELLED_MONTHS = [
  "cero", "un", "dos", "tres", "cuatro", "cinco", "seis",
  "siete", "ocho", "nueve", "diez", "once", "doce",
];

function spellMonths(count: number) {
  return count <= 12 ? SPELLED_MONTHS[count] : String(count);
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function AccountAnalyticsModal({ visible, account, onClose }: Props) {
  const router = useRouter();
  const { activeWorkspaceId } = useWorkspace();
  const { backdropStyle, panHandlers, sheetStyle } = useDismissibleSheet({ visible, onClose });
  const { data: movements = [], isLoading } = useAccountAnalyticsQuery(
    activeWorkspaceId,
    visible ? (account?.id ?? null) : null,
  );

  const currency = account?.currencyCode ?? "PEN";

  /**
   * Todo el análisis sale de una sola pasada.
   *
   * Dos reglas que rigen la pantalla entera:
   *
   * 1. **El período lo dicta lo que se sumó, no al revés.** El rótulo de arriba se calcula del
   *    primer y último movimiento de ESTOS datos, así que no puede prometer un rango que los
   *    totales no cubran. Si la consulta topó (`ACCOUNT_ANALYTICS_LIMIT`), se dice; callarlo es
   *    el defecto que se arregló en Movimientos y en Notificaciones.
   *
   * 2. **Traspaso no es gasto.** Lo que sale hacia otra cuenta tuya sigue siendo tuyo. Se separa
   *    de entrada, porque en una cuenta de uso diario es casi todo lo que sale y mezclarlo
   *    convierte la cifra grande en la menos informativa de la pantalla.
   */
  const analysis = useMemo(() => {
    if (!account || movements.length === 0) return null;
    const accountId = account.id;

    let totalIn = 0;
    let totalOut = 0;
    let transferOut = 0;
    let transferCount = 0;
    let uncategorized = 0;
    const byCategory = new Map<string, number>();
    const byMonth = new Map<string, { income: number; expense: number }>();
    let oldest = movements[0].occurredAt;
    let newest = movements[0].occurredAt;

    for (const m of movements) {
      if (m.occurredAt < oldest) oldest = m.occurredAt;
      if (m.occurredAt > newest) newest = m.occurredAt;
      if (m.movementType === "transfer") transferCount += 1;

      // El mes sale de la fecha LOCAL, no del string UTC: `occurredAt.slice(0, 7)` metia en el
      // mes siguiente todo lo registrado despues de las 19:00 del ultimo dia (Lima es UTC-5).
      const monthKey = format(parseDisplayDate(m.occurredAt), "yyyy-MM");
      const month = byMonth.get(monthKey) ?? { income: 0, expense: 0 };

      if (m.destinationAccountId === accountId && m.destinationAmount != null) {
        totalIn += m.destinationAmount;
        month.income += m.destinationAmount;
      }
      if (m.sourceAccountId === accountId && m.sourceAmount != null) {
        totalOut += m.sourceAmount;
        month.expense += m.sourceAmount;
        if (m.movementType === "transfer") {
          transferOut += m.sourceAmount;
        } else if (m.categoryName) {
          byCategory.set(m.categoryName, (byCategory.get(m.categoryName) ?? 0) + m.sourceAmount);
        } else {
          uncategorized += m.sourceAmount;
        }
      }
      byMonth.set(monthKey, month);
    }

    const spent = totalOut - transferOut;
    const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const visible = ranked.slice(0, VISIBLE_CATEGORIES);
    const rest = ranked.slice(VISIBLE_CATEGORIES);
    const restTotal = rest.reduce((sum, [, amount]) => sum + amount, 0);
    /* La barra se mide contra la fila más alta que SE VE. Anclarla a "Sin categoría" -que sale
       del ranking y no lleva barra- dejaba la primera barra al 76% de su carril con un cuarto
       vacío que nada explicaba: una escala cuyo máximo no está en pantalla. */
    const maxVisible = visible[0]?.[1] ?? 1;

    const months = [...byMonth.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
      .map(([key, value]) => {
        const [year, month] = key.split("-").map(Number);
        const date = new Date(year, month - 1, 1);
        return {
          key,
          // Abreviado bajo la barra, entero en la frase: "Jul" no se lee como se habla.
          label: format(date, "MMM", { locale: es }),
          longLabel: format(date, "MMMM", { locale: es }),
          ...value,
          net: value.income - value.expense,
        };
      });
    const maxMonthly = Math.max(...months.flatMap((m) => [m.income, m.expense]), 1);
    const negativeMonths = months.filter((m) => m.net < 0);
    const worstMonth = negativeMonths.length > 0
      ? negativeMonths.reduce((worst, m) => (m.net < worst.net ? m : worst))
      : null;
    const alsoNegative = worstMonth
      ? negativeMonths.filter((m) => m.key !== worstMonth.key).map((m) => capitalize(m.longLabel))
      : [];

    const from = parseDisplayDate(oldest);
    const to = parseDisplayDate(newest);
    const monthSpan = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;

    return {
      totalIn,
      totalOut,
      spent,
      transferOut,
      transferCount,
      netFlow: totalIn - totalOut,
      count: movements.length,
      uncategorized,
      visible,
      restTotal,
      restCount: rest.length,
      maxVisible,
      months,
      maxMonthly,
      worstMonth,
      alsoNegative,
      from,
      to,
      monthSpan,
      // La consulta topa en ACCOUNT_ANALYTICS_LIMIT: si vinieron justo esas, puede faltar historia.
      truncated: movements.length >= ACCOUNT_ANALYTICS_LIMIT,
    };
  }, [movements, account]);

  if (!account) return null;

  const periodLabel = analysis
    ? analysis.from.getFullYear() === analysis.to.getFullYear()
      ? `${capitalize(format(analysis.from, "MMM", { locale: es }))} – ${format(analysis.to, "MMM yyyy", { locale: es })}`
      : `${capitalize(format(analysis.from, "MMM yyyy", { locale: es }))} – ${format(analysis.to, "MMM yyyy", { locale: es })}`
    : null;

  function openUncategorized() {
    if (!account) return;
    onClose();
    router.push(
      `/(app)/movements?quickScope=account&quickAccountId=${account.id}&quickFilter=uncategorized&quickToken=${Date.now()}`,
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <SafeBlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        </Pressable>
      </Animated.View>

      <View style={styles.sheet} pointerEvents="box-none">
        <Animated.View style={[styles.card, sheetStyle]}>
          <View {...panHandlers}>
            <View style={styles.handle} />

            {/* La moneda se dice UNA vez y en palabras. Antes aparecía once veces —subtítulo,
                una tarjeta dedicada a explicarla, entre paréntesis en cada cifra y de sufijo en
                los seis rótulos de sección— para una cuenta que solo tiene una. */}
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title} numberOfLines={1}>Análisis · {account.name}</Text>
                {periodLabel ? (
                  <Text style={styles.subtitle}>
                    {periodLabel} · en {currencyPluralName(currency)}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Cerrar">
                <X size={18} color={COLORS.storm} />
              </TouchableOpacity>
            </View>
          </View>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={COLORS.primary} size="large" />
              <Text style={styles.loadingText}>Calculando…</Text>
            </View>
          ) : !analysis ? (
            <Text style={styles.emptyText}>Sin movimientos registrados.</Text>
          ) : (
            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              {/* La frase que antes había que deducir de cuatro recuadros. */}
              <Text style={styles.lead}>
                En {spellMonths(analysis.monthSpan)} {analysis.monthSpan === 1 ? "mes" : "meses"} pasaron{" "}
                {analysis.count} movimientos por esta cuenta y terminó con{" "}
                {formatCurrency(Math.abs(analysis.netFlow), currency)}{" "}
                {analysis.netFlow < 0 ? "menos" : "más"} que al empezar.
                {analysis.transferOut > analysis.totalOut / 2
                  ? ` Es una cuenta de paso: ${analysis.transferCount} de esos movimientos son traspasos entre tus cuentas.`
                  : ""}
              </Text>

              <View style={styles.flowCard}>
                <View style={styles.flowSplit}>
                  <View style={styles.flowHalf}>
                    <Text style={styles.flowLabel}>Entró</Text>
                    <Text style={[styles.flowValue, { color: COLORS.income }]}>
                      {formatCurrency(analysis.totalIn, currency)}
                    </Text>
                  </View>
                  <View style={[styles.flowHalf, styles.flowHalfRight]}>
                    <Text style={styles.flowLabel}>Salió</Text>
                    <Text style={[styles.flowValue, { color: COLORS.expense }]}>
                      {formatCurrency(analysis.totalOut, currency)}
                    </Text>
                  </View>
                </View>

                {analysis.transferOut > 0 ? (
                  <View style={styles.flowFooter}>
                    <View style={styles.flowFooterRow}>
                      <Text style={styles.flowFooterLabel}>De lo que salió, gasto real</Text>
                      <Text style={styles.flowFooterValue}>{formatCurrency(analysis.spent, currency)}</Text>
                    </View>
                    <Text style={styles.flowFooterHint}>
                      Los otros {formatCurrency(analysis.transferOut, currency)} se movieron a cuentas
                      tuyas: no son gasto.
                    </Text>
                  </View>
                ) : null}
              </View>

              {analysis.spent > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text style={styles.sectionTitle}>En qué se gastó</Text>
                    <Text style={styles.sectionAside}>
                      {formatCurrency(analysis.spent, currency)} en total
                    </Text>
                  </View>

                  {analysis.visible.map(([name, amount]) => (
                    <View key={name} style={styles.catRow}>
                      <View style={styles.catHead}>
                        <Text style={styles.catName} numberOfLines={1}>{name}</Text>
                        <Text style={styles.catAmount}>{formatCurrency(amount, currency)}</Text>
                      </View>
                      <View style={styles.catTrack}>
                        <View style={[styles.catFill, { width: `${(amount / analysis.maxVisible) * 100}%` }]} />
                      </View>
                    </View>
                  ))}

                  {/* Sin esta fila, lo listado no suma el total de arriba y la pantalla se
                      contradice sola por unos pocos soles. */}
                  {analysis.restCount > 0 ? (
                    <View style={styles.catRow}>
                      <View style={styles.catHead}>
                        <Text style={styles.catRestName} numberOfLines={1}>
                          Resto de categorías ({analysis.restCount})
                        </Text>
                        <Text style={styles.catRestAmount}>
                          {formatCurrency(analysis.restTotal, currency)}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* "Sin categoría" no es una categoría: es el dato que falta. Sale del ranking
                      -donde suele encabezarlo- y se convierte en lo único accionable. "Otros" NO
                      viene aquí: es una categoría que el usuario eligió, y mandarla al mismo botón
                      haría recategorizar movimientos que ya lo están. */}
                  {analysis.uncategorized > 0 ? (
                    <TouchableOpacity
                      style={styles.resolveRow}
                      onPress={openUncategorized}
                      accessibilityRole="button"
                      accessibilityLabel="Ver movimientos sin categoría de esta cuenta"
                    >
                      <View style={styles.resolveText}>
                        <Text style={styles.resolveTitle}>Sin categoría</Text>
                        <Text style={styles.resolveHint}>
                          {formatCurrency(analysis.uncategorized, currency)} —{" "}
                          {Math.round((analysis.uncategorized / analysis.spent) * 100)}% de tu gasto
                          {analysis.uncategorized >= analysis.maxVisible ? ", y es el mayor" : ""}
                        </Text>
                      </View>
                      <Text style={styles.resolveAction}>Resolver</Text>
                      <ChevronRight size={16} color={COLORS.storm} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Mes a mes</Text>
                  <Text style={styles.sectionAside}>entró / salió</Text>
                </View>
                <View style={styles.chart}>
                  {analysis.months.map((m) => (
                    <View key={m.key} style={styles.chartGroup}>
                      <View style={styles.barTracks}>
                        <View style={[styles.bar, { height: `${(m.income / analysis.maxMonthly) * 100}%`, backgroundColor: COLORS.income }]} />
                        <View style={[styles.bar, { height: `${(m.expense / analysis.maxMonthly) * 100}%`, backgroundColor: COLORS.expense }]} />
                      </View>
                      <Text style={styles.barLabel}>{m.label}</Text>
                    </View>
                  ))}
                </View>
                {/* La lectura escrita: la barra sola no dice cuál importa ni por qué. */}
                {analysis.worstMonth ? (
                  <Text style={styles.chartNote}>
                    {capitalize(analysis.worstMonth.longLabel)} es el mes que cerró más abajo: salieron{" "}
                    {formatCurrency(analysis.worstMonth.expense, currency)} contra{" "}
                    {formatCurrency(analysis.worstMonth.income, currency)} que entraron.
                    {analysis.alsoNegative.length > 0
                      ? ` ${analysis.alsoNegative.join(" y ")} también ${analysis.alsoNegative.length === 1 ? "cerró" : "cerraron"} negativo.`
                      : ""}
                  </Text>
                ) : (
                  <Text style={styles.chartNote}>Ningún mes del período cerró en negativo.</Text>
                )}
              </View>

              {analysis.truncated ? (
                <Text style={styles.truncationNote}>
                  La cuenta tiene más movimientos de los que caben en un análisis: estas cifras
                  cubren los {analysis.count} más recientes, desde {format(analysis.from, "d MMM yyyy", { locale: es })}.
                </Text>
              ) : null}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  card: {
    maxHeight: "92%",
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: SURFACE.separator,
    borderLeftColor: SURFACE.separator,
    borderRightColor: SURFACE.separator,
    ...ELEVATION[4],
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(244,241,236,0.22)",
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  headerText: { flex: 1 },
  title: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },
  closeBtn: {
    padding: SPACING.xs,
    backgroundColor: "rgba(244,241,236,0.07)",
    borderRadius: RADIUS.full,
  },
  loadingWrap: { padding: SPACING.xxxl, alignItems: "center", gap: SPACING.md },
  loadingText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xxxl,
    gap: SPACING.lg,
  },

  lead: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    lineHeight: 24,
    color: COLORS.ink,
  },

  // Entró / salió / gasto real
  flowCard: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    overflow: "hidden",
  },
  flowSplit: { flexDirection: "row" },
  flowHalf: { flex: 1, padding: SPACING.md, gap: 2 },
  flowHalfRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: SURFACE.separator,
  },
  flowLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  flowValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg },
  flowFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: 4,
  },
  flowFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  flowFooterLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  flowFooterValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  flowFooterHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 18 },

  section: { gap: SPACING.sm },
  sectionHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: SPACING.sm },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionAside: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },

  // Ranking de gasto
  catRow: { gap: 6 },
  catHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: SPACING.sm },
  catName: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.ink },
  catAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  catTrack: {
    height: 4,
    backgroundColor: "rgba(244,241,236,0.07)",
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },
  catFill: { height: "100%", backgroundColor: COLORS.ink, borderRadius: RADIUS.full },
  catRestName: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  catRestAmount: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },

  resolveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    padding: SPACING.md,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
  },
  resolveText: { flex: 1, gap: 2 },
  resolveTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  resolveHint: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm, lineHeight: 18 },
  resolveAction: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.primary },

  // Mes a mes
  chart: { flexDirection: "row", alignItems: "flex-end", gap: SPACING.sm, height: 88 },
  chartGroup: { flex: 1, alignItems: "center", gap: 6, height: "100%" },
  barTracks: { flex: 1, flexDirection: "row", alignItems: "flex-end", justifyContent: "center", gap: 3 },
  bar: { width: 9, borderRadius: 3, minHeight: 3 },
  barLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "capitalize",
  },
  chartNote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 20,
    color: COLORS.storm,
    marginTop: SPACING.xs,
  },

  truncationNote: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    color: COLORS.textDisabled,
  },
  emptyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
    paddingVertical: SPACING.xxxl,
  },
});
