import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { SystemState } from "../../lib/system-state";
import { SummaryDetailSheet } from "./SummaryDetailSheet";

type Props = {
  state: SystemState;
  onClose: () => void;
  onCategorize: () => void;
  onOpenHealth: () => void;
};

export function SystemStateSheet({ state, onClose, onCategorize, onOpenHealth }: Props) {
  const hasIssues = state.totalIssues > 0;
  const primaryAction = state.uncategorizedCount > 0 ? onCategorize : onOpenHealth;

  return (
    <SummaryDetailSheet
      onClose={onClose}
      title="Estado del sistema"
      calculation="La puntuación combina la cantidad de movimientos útiles (40 puntos), los días de historial (25) y la proporción de ingresos y gastos con categoría (35). Los puntos por revisar se muestran aparte: salvo las categorías faltantes, no cambian el porcentaje ni indican si vas bien o mal con tu dinero."
      actionLabel={state.uncategorizedCount > 0 ? `Categorizar ${state.uncategorizedCount} movimiento${state.uncategorizedCount === 1 ? "" : "s"}` : "Ver detalle en Salud"}
      onAction={primaryAction}
    >
      <View style={styles.scoreBlock}>
        <View style={styles.scoreRow}>
          <Text style={styles.score}>{state.score}%</Text>
          <View style={styles.statusPill}><Text style={styles.statusText}>{state.status}</Text></View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${state.score}%` }]} />
          <View style={[styles.thresholdMark, { left: `${state.threshold}%` }]} />
        </View>
        <Text style={styles.thresholdCopy}>A partir del {state.threshold}%, la lectura se considera confiable.</Text>
      </View>

      {hasIssues ? (
        <View style={styles.issues}>
          <Text style={styles.kicker}>QUÉ REVISAR</Text>
          {state.uncategorizedCount > 0 ? (
            <TouchableOpacity style={styles.row} onPress={onCategorize} activeOpacity={0.82} accessibilityRole="button">
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Movimientos sin categoría</Text>
                <Text style={styles.rowSubtitle}>Categorízalos en grupo</Text>
              </View>
              <Text style={styles.rowCount}>{state.uncategorizedCount}</Text>
              <ChevronRight size={16} color={COLORS.textDisabled} />
            </TouchableOpacity>
          ) : null}
          {state.otherIssuesCount > 0 ? (
            <TouchableOpacity style={styles.row} onPress={onOpenHealth} activeOpacity={0.82} accessibilityRole="button">
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>Otros puntos por revisar</Text>
                <Text style={styles.rowSubtitle}>Detalle en Salud</Text>
              </View>
              <Text style={styles.rowCount}>{state.otherIssuesCount}</Text>
              <ChevronRight size={16} color={COLORS.textDisabled} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

    </SummaryDetailSheet>
  );
}

const styles = StyleSheet.create({
  scoreBlock: { gap: SPACING.sm },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  score: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, letterSpacing: -1 },
  statusPill: { backgroundColor: SURFACE.input, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  statusText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.fog },
  track: { height: 6, borderRadius: RADIUS.full, backgroundColor: SURFACE.input, marginTop: SPACING.xs },
  fill: { height: 6, borderRadius: RADIUS.full, backgroundColor: COLORS.ink },
  thresholdMark: { position: "absolute", top: -4, height: 14, width: 2, backgroundColor: COLORS.textDisabled },
  thresholdCopy: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 18 },
  issues: { marginTop: SPACING.xxxl },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.storm, letterSpacing: 1.1, marginBottom: SPACING.xs },
  row: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  rowCopy: { flex: 1, gap: SPACING.xs },
  rowTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  rowCount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
});
