import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useRouter } from "expo-router";

import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { relativeDateLabel } from "../../../lib/calendar";
import { isoToDateStr, todayPeru } from "../../../lib/date";
import type { BudgetContribution } from "../../../lib/budget-metrics";

/**
 * Cuántos se ven sin pedirlo.
 *
 * Eran diez, y con veintiocho movimientos la pantalla se volvía una lista de gastos que hay que
 * leer entera para llegar a lo de abajo — que es donde está el historial, o sea lo que juzga el
 * presupuesto. Tres bastan para reconocer qué se está contando; el resto se pide.
 */
const COLLAPSED_LIMIT = 3;

type Props = {
  contributions: BudgetContribution[];
  currencyCode: string;
  /** "Septiembre": el encabezado nombra el mes en vez de decir "del período". */
  periodLabel: string;
  /** Abre la lista completa filtrada, en lugar de crecer dentro del detalle. */
  onSeeAll: () => void;
};

/**
 * Los movimientos que van contra el presupuesto.
 *
 * **Filas sobre lienzo, no una tarjeta.** Metidos en una caja con borde, veintiocho movimientos
 * formaban un bloque que hay que atravesar para llegar al historial. Las filas con separador
 * sangrado son como se leen las listas en el resto de la app desde el rediseño.
 *
 * Y cada fila decía tres cosas de más: el porcentaje del límite —que para un chicle de S/ 1.50
 * es "0.4%", un dato que no cambia ninguna decisión—, la categoría, que es la misma en las
 * veintiocho porque es la del presupuesto, y el monto en clay, cuando gastar dentro de tu
 * presupuesto no es un error. Queda qué fue, cuándo y de qué cuenta salió.
 */
export function BudgetDetailContributions({ contributions, currencyCode, periodLabel, onSeeAll }: Props) {
  const router = useRouter();
  const today = todayPeru();

  if (contributions.length === 0) {
    return (
      <View style={styles.group}>
        <Text style={styles.title}>Movimientos de {periodLabel.toLowerCase()}</Text>
        {/* "Imputados" es vocabulario de contabilidad, y el vacío no decía qué hacer. */}
        <Text style={styles.empty}>
          Todavía no has anotado ningún gasto de esta categoría en este período. Los que registres
          irán descontando del límite.
        </Text>
      </View>
    );
  }

  const visible = contributions.slice(0, COLLAPSED_LIMIT);

  return (
    <View style={styles.group}>
      <View style={styles.header}>
        <Text style={styles.title}>Movimientos de {periodLabel.toLowerCase()}</Text>
        <Text style={styles.count}>{contributions.length}</Text>
      </View>

      {visible.map((contribution) => (
        <Pressable
          key={contribution.movementId}
          onPress={() => router.push(`/movement/${contribution.movementId}?from=budget`)}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        >
          <View style={styles.left}>
            <Text style={styles.description} numberOfLines={1}>
              {contribution.description || "Sin descripción"}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {relativeDateLabel(isoToDateStr(contribution.occurredAt), today)}
              {contribution.accountName ? ` · ${contribution.accountName}` : ""}
            </Text>
          </View>
          <Text style={styles.amount}>
            {formatCurrency(contribution.amountInBudgetCurrency, currencyCode)}
          </Text>
        </Pressable>
      ))}

      {contributions.length > COLLAPSED_LIMIT ? (
        /* Ver todos abre la lista de movimientos ya filtrada, en vez de estirar el detalle: ahí
           están la búsqueda y los filtros, y esta pantalla no es una lista de gastos. */
        <Pressable
          onPress={onSeeAll}
          style={({ pressed }) => [styles.row, styles.seeAll, pressed && styles.rowPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.seeAllLabel}>Ver los {contributions.length}</Text>
          <ChevronRight size={18} color={COLORS.storm} />
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
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  count: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  empty: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    lineHeight: 21,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    minHeight: 56,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  rowPressed: { opacity: 0.6 },
  left: { flex: 1, gap: 2 },
  description: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  amount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  seeAll: { justifyContent: "space-between" },
  /* En gris y con chevrón: es una puerta a otra pantalla, no un dato de la lista. En hueso
     competía con las descripciones de los movimientos, que sí son datos. */
  seeAllLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
});
