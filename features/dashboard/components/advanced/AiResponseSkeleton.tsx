import { View, StyleSheet } from "react-native";

import { Skeleton } from "../../../../components/ui/Skeleton";
import { RADIUS, SPACING, SURFACE } from "../../../../constants/theme";

/**
 * Placeholder mostrado mientras una mutation IA del dashboard está en `isPending`
 * y aún no llegó la respuesta. Imita la altura/forma del bloque real (~5 líneas
 * de texto + bullets) para evitar que el layout salte cuando la respuesta llega.
 */
export function AiResponseSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Skeleton width={14} height={14} borderRadius={999} />
        <Skeleton width={140} height={12} borderRadius={4} />
      </View>
      <View style={styles.body}>
        <Skeleton width="100%" height={11} borderRadius={4} />
        <Skeleton width="96%" height={11} borderRadius={4} />
        <Skeleton width="88%" height={11} borderRadius={4} />
        <Skeleton width="72%" height={11} borderRadius={4} />
      </View>
      <View style={styles.footer}>
        <Skeleton width="60%" height={11} borderRadius={4} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    gap: SPACING.sm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  body: {
    gap: 8,
    marginTop: SPACING.xs,
  },
  footer: {
    marginTop: SPACING.sm,
  },
});
