import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronRight } from "lucide-react-native";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { useRecurringIncomeOccurrencesQuery } from "../../../services/queries/subscriptions-recurring-income";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { buildArrivalRows } from "../lib/arrivalHistory";

const COLLAPSED_LIMIT = 5;

type Props = {
  workspaceId: number | null;
  recurringIncomeId: number;
  fallbackCurrencyCode: string;
  /** Lo que debería llegar cada vez: mide la diferencia de cada llegada anotada. */
  expectedAmount: number;
  /** Las que vencieron sin confirmar, calculadas en `recurringIncomeStanding`. */
  pendingDates: string[];
  /** Anotar una llegada concreta: abre la hoja con esa fecha ya puesta. */
  onAnnotate: (date: string) => void;
};

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function shortDate(ymd: string): string {
  const parsed = parseYmd(ymd);
  return Number.isNaN(parsed.getTime()) ? ymd : format(parsed, "d MMM", { locale: es });
}

/** Llegadas pendientes en orden y llegadas anotadas debajo, en filas del detalle. */
export function RecurringIncomeDetailHistory({
  workspaceId,
  recurringIncomeId,
  fallbackCurrencyCode,
  expectedAmount,
  pendingDates,
  onAnnotate,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { data: occurrences = [], isLoading, isError, refetch } = useRecurringIncomeOccurrencesQuery(
    workspaceId,
    recurringIncomeId,
  );

  const rows = buildArrivalRows({
    pendingDates,
    occurrences,
    expectedAmount,
    fallbackCurrencyCode,
    formatAmount: (amount) => formatCurrency(amount, fallbackCurrencyCode),
    formatDate: shortDate,
  });
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_LIMIT);
  const remaining = rows.length - visible.length;

  return (
    <View style={styles.group}>
      <Text style={styles.title}>Llegadas</Text>

      {isLoading && rows.length === 0 ? (
        <Text style={styles.empty}>Cargando…</Text>
      ) : isError && rows.length === 0 ? (
        <Pressable onPress={() => { void refetch(); }} style={styles.retry} accessibilityRole="button">
          <Text style={styles.toggleText}>No se pudieron cargar las llegadas · Reintentar</Text>
        </Pressable>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>
          Todavía no hay llegadas anotadas. La primera aparecerá aquí.
        </Text>
      ) : (
        visible.map((row) =>
          row.kind === "pending" ? (
            <Pressable
              key={row.key}
              disabled={!row.actionable}
              style={({ pressed }) => [styles.row, pressed && row.actionable && styles.rowPressed]}
              onPress={() => onAnnotate(row.date)}
              accessibilityRole={row.actionable ? "button" : undefined}
              accessibilityLabel={
                row.actionable
                  ? `Anotar la llegada del ${shortDate(row.date)}`
                  : `Llegada del ${shortDate(row.date)}, sin confirmar. Se anota después de la anterior`
              }
            >
              <View style={styles.left}>
                <Text style={styles.date}>{shortDate(row.date)}</Text>
                {/* La que espera nombra la que va delante: una fila sin acción y sin
                    explicación se lee como una fila rota. */}
                <Text style={styles.pending}>{row.support}</Text>
              </View>
              {/* Solo la más vieja lleva acción: anotar la de agosto antes que la de julio
                  movería el calendario y julio se perdería. Se vacía en orden. */}
              {row.actionable ? <Text style={styles.action}>Anotar</Text> : null}
            </Pressable>
          ) : (
            <Pressable
              key={row.key}
              disabled={row.movementId == null}
              style={({ pressed }) => [styles.row, pressed && row.movementId != null && styles.rowPressed]}
              onPress={() => {
                if (row.movementId != null) {
                  router.push(`/movement/${row.movementId}?from=recurring-income`);
                }
              }}
            >
              <View style={styles.left}>
                <Text style={styles.date}>{shortDate(row.date)}</Text>
                {row.support ? <Text style={styles.support}>{row.support}</Text> : null}
              </View>
              <Text style={styles.amount}>+{formatCurrency(row.amount, row.currencyCode)}</Text>
              {row.movementId != null ? <ChevronRight size={16} color={COLORS.storm} /> : null}
            </Pressable>
          ),
        )
      )}

      {isError && rows.length > 0 ? (
        <Pressable onPress={() => { void refetch(); }} style={styles.retry} accessibilityRole="button">
          <Text style={styles.toggleText}>No se pudieron cargar las llegadas anotadas · Reintentar</Text>
        </Pressable>
      ) : null}

      {remaining > 0 ? (
        <Pressable onPress={() => setExpanded(true)} style={styles.toggle}>
          <Text style={styles.toggleText}>Ver las {remaining} restantes</Text>
        </Pressable>
      ) : expanded && rows.length > COLLAPSED_LIMIT ? (
        <Pressable onPress={() => setExpanded(false)} style={styles.toggle}>
          <Text style={styles.toggleText}>Mostrar menos</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    marginBottom: SPACING.sm,
  },
  empty: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    paddingVertical: SPACING.md,
  },
  row: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  rowPressed: { opacity: 0.6 },
  left: { flex: 1, gap: 2 },
  date: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  pending: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.expense },
  support: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  action: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.ink },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.income },
  retry: { minHeight: 48, justifyContent: "center" },
  toggle: { alignItems: "center", paddingVertical: SPACING.md },
  toggleText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});
