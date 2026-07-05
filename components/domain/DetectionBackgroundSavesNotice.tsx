import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { useRouter } from "expo-router";

import type { DetectionBackgroundSave } from "../../hooks/useDetectionBackgroundSaves";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  pendingSaves: DetectionBackgroundSave[];
  lastErrorMessage?: string | null;
  onRetryNow?: () => void;
  isRetrying?: boolean;
  onDiscard?: (suggestionId: string) => void;
};

/**
 * Banner de procesos en segundo plano del módulo de movimientos: muestra los
 * registros detectados que aún se están enviando al servidor (reintentos con
 * backoff tras fallo de red) y los que agotaron reintentos y requieren al usuario.
 * Sin esto el usuario no veía nada en la lista, asumía que el registro se perdió
 * y lo volvía a crear a mano → riesgo de duplicado cuando el reintento entraba.
 */
export function DetectionBackgroundSavesNotice({ pendingSaves, lastErrorMessage, onRetryNow, isRetrying, onDiscard }: Props) {
  const router = useRouter();
  if (pendingSaves.length === 0) return null;

  const sending = pendingSaves.filter((item) => !item.exhausted);
  const exhausted = pendingSaves.filter((item) => item.exhausted);

  return (
    <View style={styles.container}>
      {sending.length > 0 ? (
        <View style={styles.row}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <View style={styles.textWrap}>
            <Text style={styles.title}>
              {sending.length === 1
                ? "Registrando 1 movimiento detectado…"
                : `Registrando ${sending.length} movimientos detectados…`}
            </Text>
            <Text style={styles.body}>
              {describeEntries(sending)}
              {"El envío falló por conexión y se reintenta automáticamente. No lo registres de nuevo a mano."}
            </Text>
            {onRetryNow ? (
              <TouchableOpacity
                style={styles.retryButton}
                onPress={onRetryNow}
                disabled={Boolean(isRetrying)}
                accessibilityLabel="Reintentar el envío ahora"
              >
                <Text style={styles.retryButtonText}>
                  {isRetrying ? "Reintentando…" : "Reintentar ahora"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      {exhausted.map((entry) => (
        <View key={entry.suggestionId} style={styles.row}>
          <AlertTriangle size={16} color={COLORS.warning} />
          <View style={styles.textWrap}>
            <Text style={styles.title}>Un movimiento detectado no se pudo registrar</Text>
            <Text style={styles.body}>
              {lastErrorMessage ? `${lastErrorMessage}. ` : ""}
              Se agotaron los reintentos automáticos. Complétalo o descártalo.
            </Text>
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.retryButton}
                // La pantalla puente resuelve la sugerencia y abre su formulario directo,
                // aunque la notificación de la campana ya haya sido eliminada.
                onPress={() => router.push(`/detected-suggestion/${encodeURIComponent(entry.suggestionId)}` as never)}
                accessibilityLabel="Completar el registro del movimiento detectado"
              >
                <Text style={styles.retryButtonText}>Completar registro</Text>
              </TouchableOpacity>
              {onDiscard ? (
                <TouchableOpacity
                  style={styles.discardButton}
                  onPress={() => onDiscard(entry.suggestionId)}
                  accessibilityLabel="Descartar el movimiento detectado pendiente"
                >
                  <Text style={styles.discardButtonText}>Descartar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

function describeEntries(entries: DetectionBackgroundSave[]): string {
  const labels = entries
    .map((entry) => {
      const parts = [entry.description, entry.amountLabel].filter(Boolean);
      return parts.join(" · ");
    })
    .filter(Boolean)
    .slice(0, 2);
  return labels.length > 0 ? `${labels.join(" — ")}. ` : "";
}

const styles = StyleSheet.create({
  container: {
    gap: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  textWrap: { flex: 1, gap: 2 },
  title: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
  },
  body: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  discardButton: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  discardButtonText: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
  retryButton: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  retryButtonText: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
  },
});
