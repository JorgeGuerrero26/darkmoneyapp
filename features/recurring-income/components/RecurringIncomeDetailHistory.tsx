import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { useRecurringIncomeOccurrencesQuery } from "../../../services/queries/subscriptions-recurring-income";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { buildArrivalRows } from "../lib/arrivalHistory";

const COLLAPSED_LIMIT = 12;

type Props = {
  workspaceId: number | null;
  recurringIncomeId: number;
  fallbackCurrencyCode: string;
  /** Lo que debería llegar cada vez: mide la diferencia de cada llegada anotada. */
  expectedAmount: number;
  /** Las que vencieron sin confirmar, calculadas en `recurringIncomeStanding`. */
  pendingDates: string[];
  remindDaysBefore: number;
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

/**
 * Las llegadas: las que faltan y las que llegaron, en una sola lista.
 *
 * Se llamaba "HISTORIAL DE LLEGADAS · 3" y el conteo era el problema: contaba lo anotado, no lo
 * que debió llegar, así que los dos sueldos que nadie confirmó no salían ni en la lista ni en el
 * número. El conteo se va —el que importa está arriba, en la cápsula— y las que faltan entran en
 * la lista, en su fecha, con "Anotar" al lado.
 *
 * El aviso sube al encabezado de la sección: es lo que hace que estas fechas te lleguen al
 * teléfono, y estaba suelto al final de una cuadrícula de datos.
 */
export function RecurringIncomeDetailHistory({
  workspaceId,
  recurringIncomeId,
  fallbackCurrencyCode,
  expectedAmount,
  pendingDates,
  remindDaysBefore,
  onAnnotate,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const { data: occurrences = [], isLoading } = useRecurringIncomeOccurrencesQuery(
    workspaceId,
    recurringIncomeId,
  );

  const rows = buildArrivalRows({
    pendingDates,
    occurrences,
    expectedAmount,
    fallbackCurrencyCode,
    formatAmount: (amount) => formatCurrency(amount, fallbackCurrencyCode),
  });
  const visible = expanded ? rows : rows.slice(0, COLLAPSED_LIMIT);
  const remaining = rows.length - visible.length;

  const remindLabel =
    remindDaysBefore > 0
      ? `Aviso ${remindDaysBefore} ${remindDaysBefore === 1 ? "día" : "días"} antes`
      : "Sin aviso";

  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text style={styles.title}>Llegadas</Text>
        <Text style={styles.remind}>{remindLabel}</Text>
      </View>

      {isLoading && rows.length === 0 ? (
        <Text style={styles.empty}>Cargando…</Text>
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
                <Text style={styles.pending}>Sin confirmar</Text>
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
              <Text style={styles.amount}>{formatCurrency(row.amount, row.currencyCode)}</Text>
            </Pressable>
          ),
        )
      )}

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
  group: { gap: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  remind: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
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
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  toggle: { alignItems: "center", paddingVertical: SPACING.md },
  toggleText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.fog },
});
