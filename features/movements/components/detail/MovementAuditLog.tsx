import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../../components/ui/Card";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../../../constants/theme";

type Props = {
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  status?: string | null;
};

function formatTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "d MMM yyyy · HH:mm", { locale: es });
}

function shortUserId(userId?: string | null): string {
  if (!userId) return "Sistema";
  // UUIDs son largos. Mostrar solo los primeros 8 chars + sufijo "..."
  return `${userId.slice(0, 8)}…`;
}

/**
 * Bloque de audit log para el detalle del movimiento.
 * Muestra creación, última actualización y (si aplica) anulación.
 *
 * Renderiza solo si hay al menos un timestamp disponible — silencioso para
 * movimientos antiguos sin tracking de fechas.
 */
export const MovementAuditLog = memo(function MovementAuditLog({
  createdAt,
  updatedAt,
  createdByUserId,
  updatedByUserId,
  status,
}: Props) {
  const created = formatTimestamp(createdAt);
  const updated = formatTimestamp(updatedAt);
  const wasModified = Boolean(created && updated && createdAt !== updatedAt);
  const isVoided = status === "voided";

  if (!created && !updated && !isVoided) return null;

  return (
    <Card>
      <Text style={styles.title}>Historial</Text>
      <View style={styles.list}>
        {created ? (
          <View style={styles.row}>
            <Text style={styles.label}>Creado</Text>
            <View style={styles.values}>
              <Text style={styles.value}>{created}</Text>
              <Text style={styles.user}>por {shortUserId(createdByUserId)}</Text>
            </View>
          </View>
        ) : null}
        {wasModified && updated ? (
          <View style={styles.row}>
            <Text style={styles.label}>Actualizado</Text>
            <View style={styles.values}>
              <Text style={styles.value}>{updated}</Text>
              <Text style={styles.user}>por {shortUserId(updatedByUserId)}</Text>
            </View>
          </View>
        ) : null}
        {isVoided && updated ? (
          <View style={styles.row}>
            <Text style={[styles.label, styles.labelDanger]}>Anulado</Text>
            <View style={styles.values}>
              <Text style={[styles.value, styles.valueDanger]}>{updated}</Text>
              <Text style={styles.user}>por {shortUserId(updatedByUserId)}</Text>
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
  },
  list: {
    gap: SPACING.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: SPACING.md,
  },
  label: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    minWidth: 90,
  },
  labelDanger: {
    color: COLORS.dangerSoft,
  },
  values: {
    flex: 1,
    alignItems: "flex-end",
  },
  value: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  valueDanger: {
    color: COLORS.dangerSoft,
  },
  user: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    marginTop: 2,
  },
});
