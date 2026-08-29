import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { differenceInDays } from "date-fns";

import { Card } from "../../../../components/ui/Card";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { DashboardMovementRow } from "../../../../services/queries/workspace-data";
import { isCategorizedCashflow } from "../../lib/aggregations";

type Props = {
  movements: DashboardMovementRow[];
  acceptedFeedbackCount: number;
};

/**
 * El relato de cómo la app aprende, fuera de la pestaña de finanzas.
 *
 * "Madurez del análisis" (Fase 1 Base, Fase 2 Patrones, Fase 3 Proyecciones, Fase 4 Alertas
 * finas) y "Aprendiendo de ti" sumaban ~1.400 px dentro de Salud y **medían el producto, no tus
 * finanzas**: la Fase 4 no sube porque el usuario haga algo. Transmiten que la app mejora con el
 * uso, y eso genera confianza, pero su lugar no es una pestaña de dinero.
 *
 * Decisión del 28 ago: la única línea accionable —la precisión sube al resolver los pendientes—
 * se queda en Salud; esto se muda aquí, donde la curiosidad se busca a propósito.
 *
 * No trae las "señales" (patrón semanal, categoría dominante): eso son patrones y su pestaña es
 * Patrones, donde ya están.
 */
export function LearningMaturity({ movements, acceptedFeedbackCount }: Props) {
  const learning = useMemo(() => {
    const posted = movements.filter((movement) => movement.status === "posted");
    const useful = posted.filter((movement) => movement.movementType !== "obligation_opening");
    const categorizedBase = useful.filter(isCategorizedCashflow);
    const categorizedCount = categorizedBase.filter((movement) => movement.categoryId != null).length;
    const categorizedRate = categorizedBase.length > 0 ? categorizedCount / categorizedBase.length : 0;
    const oldest = useful[useful.length - 1];
    const historyDays = oldest
      ? Math.max(1, differenceInDays(new Date(), new Date(oldest.occurredAt)))
      : 0;

    const phases = [
      { step: 1, title: "Base", description: "Ya puede leer totales y ritmos simples.", progress: Math.min(1, useful.length / 40) },
      { step: 2, title: "Patrones", description: "Distingue hábitos y semanas raras.", progress: Math.min(1, useful.length / 90) },
      { step: 3, title: "Proyecciones", description: "Estima presión futura con más confianza.", progress: Math.min(1, historyDays / 90) },
      { step: 4, title: "Alertas finas", description: "Lista para señales más finas y anomalías.", progress: Math.min(1, categorizedRate + historyDays / 240) },
    ];

    return { categorizedRate, historyDays, phases, usefulCount: useful.length };
  }, [movements]);

  // "300 correcciónes tuya ya alimentan" llevaba tilde de más —el plural la pierde— y no
  // concordaba en número.
  const corrections =
    acceptedFeedbackCount === 1
      ? "1 corrección tuya ya alimenta lo que la app te sugiere."
      : `${acceptedFeedbackCount} correcciones tuyas ya alimentan lo que la app te sugiere.`;

  return (
    <Card>
      <Text style={styles.title}>Cómo aprende DarkMoney</Text>
      <Text style={styles.body}>
        La app mejora con lo que registras. Esto no es algo que tengas que atender: es solo el
        estado de lo que ya sabe.
      </Text>

      <View style={styles.statRow}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{learning.usefulCount}</Text>
          <Text style={styles.statLabel}>movimientos útiles</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{learning.historyDays}</Text>
          <Text style={styles.statLabel}>días de historia</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{Math.round(learning.categorizedRate * 100)}%</Text>
          <Text style={styles.statLabel}>ya clasificado</Text>
        </View>
      </View>

      {acceptedFeedbackCount > 0 ? <Text style={styles.body}>{corrections}</Text> : null}

      <Text style={styles.groupTitle}>Madurez del análisis</Text>
      {learning.phases.map((phase) => (
        <View key={phase.step} style={styles.phase}>
          <View style={styles.phaseHeader}>
            <Text style={styles.phaseTitle}>
              Fase {phase.step} · {phase.title}
            </Text>
            <Text style={styles.phasePct}>{Math.round(phase.progress * 100)}%</Text>
          </View>
          <Text style={styles.phaseBody}>{phase.description}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(6, phase.progress * 100)}%` }]} />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  body: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
    marginTop: SPACING.xs,
  },
  statRow: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  stat: {
    flex: 1,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    gap: 2,
  },
  statValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  statLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  groupTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
  },
  phase: { gap: SPACING.xs, marginBottom: SPACING.md },
  phaseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  phaseTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  phasePct: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  phaseBody: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  track: { height: 4, borderRadius: 2, backgroundColor: SURFACE.cardBorder, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: COLORS.pro },
});
