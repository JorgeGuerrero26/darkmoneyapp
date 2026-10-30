import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import { CloudOff } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { offlineRuntime } from "../../lib/offline/instance";
import type { InboxEntry } from "../../lib/offline/outbox";
import type { PendingChange } from "../../lib/offline/pending";
import { isPendingSheetOpen, setPendingSheetOpen, subscribePendingSheet } from "../../lib/offline/pending-sheet";
import { useOfflineStatus } from "../../lib/offline/react";
import { describeInboxEntry, describePendingChange } from "../../lib/offline/status-copy";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";

/** A qué pantalla lleva tocar un cambio. El formulario de cada uno se abre desde su módulo. */
function routeFor(change: PendingChange): string {
  switch (change.table) {
    case "movements":
      return change.kind === "delete" ? "/(app)/movements" : `/movement/${change.rowId}?from=movements`;
    case "accounts":
      return "/(app)/accounts";
    case "categories":
      return "/(app)/categories";
    case "counterparties":
      return "/(app)/contacts";
    case "spend_types":
      return "/spend-types?from=more";
    case "budgets":
      return "/(app)/budgets";
    case "subscriptions":
      return "/(app)/subscriptions";
    case "recurring_income":
      return "/(app)/recurring-income";
    case "obligations":
      return "/(app)/obligations";
    default:
      return "/(app)/movements";
  }
}

const formatTime = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : format(date, "H:mm");
};

/**
 * Hoja con todo lo que está guardado en el teléfono y todavía no llegó al servidor, de todos los módulos
 * (Revisión 54c). Se abre al tocar la línea de estado del encabezado; la monta una sola vez la raíz.
 */
export function PendingChangesSheet() {
  const router = useRouter();
  const open = useSyncExternalStore(subscribePendingSheet, isPendingSheetOpen, isPendingSheetOpen);
  const status = useOfflineStatus();
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [inbox, setInbox] = useState<InboxEntry[]>([]);

  const reload = useCallback(async () => {
    const [nextChanges, nextInbox] = await Promise.all([offlineRuntime.listPendingChanges(), offlineRuntime.inbox()]);
    setChanges(nextChanges);
    setInbox(nextInbox);
  }, []);

  // Se rehace al abrir y cada vez que cambia lo pendiente o lo que hay para revisar.
  useEffect(() => {
    if (open) void reload();
  }, [open, reload, status.pending, status.rejected, status.review]);

  // Si ya no queda nada que mostrar, la hoja se cierra sola.
  useEffect(() => {
    if (open && status.online && changes.length === 0 && inbox.length === 0 && status.pending === 0 && status.rejected + status.review === 0) {
      setPendingSheetOpen(false);
    }
  }, [open, changes.length, inbox.length, status.online, status.pending, status.rejected, status.review]);

  const close = () => setPendingSheetOpen(false);

  return (
    <BottomSheet visible={open} onClose={close} title="Pendientes de enviar" snapHeight={0.7}>
      <View style={styles.body}>
        {inbox.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>Necesitan tu revisión</Text>
            {inbox.map((entry) => {
              const copy = describeInboxEntry(entry);
              return (
                <View key={entry.id} style={[styles.row, styles.rowAttention]}>
                  <Text style={styles.rowTitle} maxFontSizeMultiplier={1.3}>{copy.title}</Text>
                  <Text style={styles.rowDetail} maxFontSizeMultiplier={1.3}>{copy.body}</Text>
                  <Button
                    label={entry.status === "review" ? "Entendido" : "Descartar"}
                    variant="ghost"
                    size="sm"
                    onPress={() => void offlineRuntime.resolveInboxEntry(entry.id).then(reload)}
                  />
                </View>
              );
            })}
          </View>
        ) : null}

        {changes.length > 0 ? (
          <View style={styles.group}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.3}>
              {changes.length === 1 ? "1 cambio por enviar" : `${changes.length} cambios por enviar`}
            </Text>
            {changes.map((change) => {
              const copy = describePendingChange(change);
              return (
                <TouchableOpacity
                  key={change.opId}
                  activeOpacity={0.7}
                  style={styles.row}
                  onPress={() => {
                    close();
                    router.push(routeFor(change) as never);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${copy.title}, ${formatTime(change.createdAt)}`}
                >
                  <View style={styles.rowHead}>
                    <CloudOff size={14} color={COLORS.gold} />
                    <Text style={styles.rowTitle} numberOfLines={2} maxFontSizeMultiplier={1.3}>{copy.title}</Text>
                    <Text style={styles.rowTime} maxFontSizeMultiplier={1.3}>{formatTime(change.createdAt)}</Text>
                  </View>
                  {copy.detail ? <Text style={styles.rowDetail} maxFontSizeMultiplier={1.3}>{copy.detail}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <Text style={styles.note} maxFontSizeMultiplier={1.3}>
          {changes.length || inbox.length
            ? "Mientras tanto, los saldos ya incluyen estos cambios. No cierres sesión ni borres la app hasta que se envíen."
            : status.pending + status.rejected + status.review > 0 ? "Cargando cambios pendientes…" : "No hay cambios pendientes de enviar."}
        </Text>
        <Button
          label="Intentar enviar ahora"
          variant="secondary"
          loading={status.syncing}
          loadingLabel="Enviando…"
          onPress={() => void offlineRuntime.requestSync("manual")}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACING.md, paddingBottom: SPACING.lg },
  group: { gap: SPACING.sm },
  sectionTitle: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  row: {
    gap: 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  rowAttention: { borderColor: COLORS.danger + "55" },
  rowHead: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  rowTitle: { flex: 1, color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  rowTime: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  rowDetail: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, lineHeight: 16 },
  note: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, lineHeight: 16 },
});
