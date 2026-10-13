import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { Button } from "../../components/ui/Button";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { COLORS, EXTENDED_PALETTE, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { offlineRuntime } from "../../lib/offline/instance";
import type { InboxEntry } from "../../lib/offline/outbox";
import { useOfflineFlag, useOfflineStatus } from "../../lib/offline/react";
import { describeInboxEntry, describeOfflineSummary } from "../../lib/offline/status-copy";

function formatTime(timestamp: number | null): string {
  if (!timestamp) return "Todavía no";
  const date = new Date(timestamp);
  return date.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Modo sin conexión (beta): interruptor, estado de la sincronización, botón para sincronizar a
 * mano y la bandeja de cambios que el servidor no aceptó o que conviene revisar.
 */
function OfflineScreen() {
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({
    originRoutes: { settings: "/(app)/settings", movements: "/(app)/movements" },
    defaultRoute: "/(app)/settings",
  });
  const status = useOfflineStatus();
  const { enabled, setEnabled } = useOfflineFlag();
  const [inbox, setInbox] = useState<InboxEntry[]>([]);

  const reloadInbox = useCallback(async () => {
    setInbox(await offlineRuntime.inbox());
  }, []);

  // La bandeja se vuelve a leer cuando cambian los contadores (un ciclo terminó, se descartó una).
  useEffect(() => {
    void reloadInbox();
  }, [reloadInbox, status.rejected, status.review, status.availability]);

  const unavailable = status.availability === "unavailable";
  const ready = status.availability === "ready";

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Modo sin conexión" subtitle="Beta" onBack={handleBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xxxl }]}>
        <View style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.switchCopy}>
              <Text style={styles.label} maxFontSizeMultiplier={1.3}>Usar el modo sin conexión</Text>
              <Text style={styles.support} maxFontSizeMultiplier={1.3}>
                Guarda tus movimientos en el teléfono al instante y los envía solos cuando hay internet.
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={(next) => void setEnabled(next)}
              trackColor={{ false: COLORS.border, true: COLORS.primary }}
              thumbColor={EXTENDED_PALETTE.white}
            />
          </View>
          {unavailable ? (
            <Text style={styles.warning} maxFontSizeMultiplier={1.3}>
              Esta versión de la app todavía no lo incluye. Instala la versión más reciente para usarlo.
            </Text>
          ) : null}
          {status.availability === "error" && status.lastError ? (
            <Text style={styles.warning} maxFontSizeMultiplier={1.3}>No se pudo iniciar: {status.lastError}</Text>
          ) : null}
        </View>

        {enabled && !unavailable ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>Estado</Text>
            <Line label="Ahora" value={describeOfflineSummary(status, enabled)} />
            <Line label="Internet" value={status.online ? "Conectado" : "Sin conexión"} />
            <Line label="Por enviar" value={String(status.pending)} />
            <Line label="Última vez que se sincronizó" value={formatTime(status.lastSyncAt)} />
            {status.lastError ? <Text style={styles.warning} maxFontSizeMultiplier={1.3}>Último aviso: {status.lastError}</Text> : null}
            <Button
              label="Sincronizar ahora"
              variant="secondary"
              loading={status.syncing}
              loadingLabel="Sincronizando…"
              disabled={!ready}
              onPress={() => void offlineRuntime.requestSync("manual")}
            />
            {!status.hydrated && ready ? (
              <Text style={styles.support} maxFontSizeMultiplier={1.3}>
                Preparando tus datos en el teléfono. Hasta que termine, la app sigue usando internet como siempre.
              </Text>
            ) : null}
          </View>
        ) : null}

        {enabled && inbox.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>Para revisar</Text>
            {inbox.map((entry) => {
              const copy = describeInboxEntry(entry);
              return (
                <View key={entry.id} style={styles.inboxRow}>
                  <Text style={styles.label} maxFontSizeMultiplier={1.3}>{copy.title}</Text>
                  <Text style={styles.support} maxFontSizeMultiplier={1.3}>{copy.body}</Text>
                  <Button
                    label={entry.status === "review" ? "Entendido" : "Descartar aviso"}
                    variant="ghost"
                    size="sm"
                    onPress={() => void offlineRuntime.resolveInboxEntry(entry.id).then(reloadInbox)}
                  />
                </View>
              );
            })}
          </View>
        ) : null}

        {enabled && ready ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>Diagnóstico</Text>
            <Line label="Base local" value={status.hydrated ? "Lista" : "Descargando"} />
            <Line label="Espacio" value={status.workspaceId != null ? String(status.workspaceId) : "—"} />
            <Line label="Por revisar" value={String(status.review)} />
            <Line label="No guardados" value={String(status.rejected)} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel} maxFontSizeMultiplier={1.3}>{label}</Text>
      <Text style={styles.lineValue} maxFontSizeMultiplier={1.3}>{value}</Text>
    </View>
  );
}

export default function OfflineScreenRoot() {
  return (
    <ErrorBoundary>
      <OfflineScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACING.lg, gap: SPACING.md },
  card: {
    gap: SPACING.sm,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    padding: SPACING.lg,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  switchCopy: { flex: 1, gap: SPACING.xs },
  sectionTitle: { color: COLORS.fog, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.8 },
  label: { color: COLORS.text, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md },
  support: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 18 },
  warning: { color: COLORS.gold, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 18 },
  line: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.md },
  lineLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, flexShrink: 1 },
  lineValue: { color: COLORS.text, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, textAlign: "right", flexShrink: 1 },
  inboxRow: { gap: SPACING.xs, paddingTop: SPACING.sm, borderTopWidth: 1, borderTopColor: SURFACE.separator },
});
