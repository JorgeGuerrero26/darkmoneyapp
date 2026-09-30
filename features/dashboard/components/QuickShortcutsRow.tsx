import { memo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronRight, Plus } from "lucide-react-native";

import { DashboardBottomSheet } from "./shared/DashboardBottomSheet";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { buildQuickRow, type QuickEntry } from "../../movements/lib/quickEntries";

type QuickRegistrationBase = {
  key: string;
  label: string;
  amount: number;
};
export type QuickRegistrationStatus = QuickRegistrationBase & (
  | { phase: "saving" | "error" | "uncertain" }
  | { phase: "saved"; movementId: number }
);

type Props = {
  /** Los que encajan con este momento. */
  entries: QuickEntry[];
  /** Todos los que existen, para la puerta "Ver todos". */
  pool: QuickEntry[];
  currencyCode: string;
  registrationStatus: QuickRegistrationStatus | null;
  onRegister: (entry: QuickEntry) => void;
  onViewSaved: (movementId: number) => void;
};

/** Atajos de movimientos frecuentes, presentados como filas del resumen. */
function QuickShortcutsRowBase({
  entries,
  pool,
  currencyCode,
  registrationStatus,
  onRegister,
  onViewSaved,
}: Props) {
  const [allOpen, setAllOpen] = useState(false);
  const { tiles, showAll } = buildQuickRow(entries, pool);

  if (tiles.length === 0 && !registrationStatus) return null;

  const saving = registrationStatus?.phase === "saving";
  const savedMovementId = registrationStatus?.phase === "saved" ? registrationStatus.movementId : null;
  const feedback = registrationStatus ? (
    <View style={styles.feedback} accessibilityLiveRegion="polite">
      <Text style={[styles.feedbackText, (registrationStatus.phase === "error" || registrationStatus.phase === "uncertain") && styles.feedbackError]}>
        {registrationStatus.phase === "saving"
          ? `Guardando «${registrationStatus.label}»…`
          : registrationStatus.phase === "saved"
            ? `Se anotó «${registrationStatus.label}» · ${formatCurrency(registrationStatus.amount, currencyCode)}`
            : registrationStatus.phase === "uncertain"
              ? `No se confirmó «${registrationStatus.label}». Toca para reintentar.`
              : `No se pudo anotar «${registrationStatus.label}»`}
      </Text>
      {savedMovementId !== null ? (
        <Pressable
          onPress={() => { setAllOpen(false); onViewSaved(savedMovementId); }}
          accessibilityRole="button"
          accessibilityLabel={`Ver movimiento ${registrationStatus.label}`}
        >
          <Text style={styles.feedbackAction}>Ver</Text>
        </Pressable>
      ) : null}
    </View>
  ) : null;

  return (
    <>
      <Text style={styles.heading}>Anotar de nuevo</Text>
      {feedback}
      {tiles.length > 0 ? (
        <View style={styles.row}>
          {tiles.map((entry) => (
            <Tile
              key={entry.key}
              entry={entry}
              currencyCode={currencyCode}
              saving={saving && registrationStatus?.key === entry.key}
              saved={registrationStatus?.phase === "saved" && registrationStatus.key === entry.key}
              disabled={saving || (registrationStatus?.phase === "saved" && registrationStatus.key === entry.key)}
              onPress={() => onRegister(entry)}
            />
          ))}
          {showAll ? (
            <Pressable
              style={({ pressed }) => [styles.tile, styles.moreTile, pressed && styles.tilePressed]}
              onPress={() => setAllOpen(true)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Ver los ${pool.length} atajos`}
            >
              <Text style={styles.moreLabel} numberOfLines={1}>Ver todos</Text>
              <ChevronRight size={14} color={COLORS.storm} strokeWidth={2} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <DashboardBottomSheet visible={allOpen} onClose={() => setAllOpen(false)} title="Tus atajos" snapHeight={0.7}>
        {feedback}
        <View style={styles.sheetList}>
          {pool.map((entry, index) => (
            <Pressable
              key={entry.key}
              style={({ pressed }) => [
                styles.sheetRow,
                index < pool.length - 1 && styles.sheetRowDivided,
                pressed && styles.tilePressed,
              ]}
              onPress={() => onRegister(entry)}
              disabled={saving || (registrationStatus?.phase === "saved" && registrationStatus.key === entry.key)}
              accessibilityRole="button"
              accessibilityLabel={`Anotar ${entry.label} de ${formatCurrency(entry.amount, currencyCode)}`}
            >
              {saving && registrationStatus?.key === entry.key ? (
                <ActivityIndicator size="small" color={COLORS.storm} />
              ) : registrationStatus?.phase === "saved" && registrationStatus.key === entry.key ? (
                <Check size={15} color={COLORS.income} strokeWidth={2.5} />
              ) : (
                <Plus size={15} color={COLORS.fog} strokeWidth={2.5} />
              )}
              <Text style={styles.sheetLabel} numberOfLines={1}>{entry.label}</Text>
              <Text style={styles.sheetAmount}>{formatCurrency(entry.amount, currencyCode)}</Text>
            </Pressable>
          ))}
        </View>
      </DashboardBottomSheet>
    </>
  );
}

function Tile({
  entry,
  currencyCode,
  saving,
  saved,
  disabled,
  onPress,
}: {
  entry: QuickEntry;
  currencyCode: string;
  saving: boolean;
  saved: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, saving && styles.tileSaving]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`Anotar ${entry.label} de ${formatCurrency(entry.amount, currencyCode)}`}
    >
      <View style={styles.tileHead}>
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.storm} />
        ) : saved ? (
          /* La marca dura unos segundos y vuelve sola: confirma sin convertirse en un estado. */
          <Check size={14} color={COLORS.income} strokeWidth={3} />
        ) : (
          <Plus size={14} color={COLORS.fog} strokeWidth={2.5} />
        )}
        <Text style={styles.tileLabel} numberOfLines={1}>{entry.label}</Text>
      </View>
      <Text style={styles.tileAmount} numberOfLines={1}>
        {formatCurrency(entry.amount, currencyCode)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  feedback: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  feedbackText: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
  },
  feedbackError: { color: COLORS.rosewood },
  feedbackAction: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SURFACE.separator },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    gap: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  tilePressed: { opacity: 0.7 },
  tileSaving: { opacity: 0.6 },
  tileHead: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  tileLabel: {
    flexShrink: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  tileAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  moreTile: { justifyContent: "space-between" },
  moreLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  sheetList: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
  },
  sheetRowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  sheetLabel: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  sheetAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
});

export const QuickShortcutsRow = memo(QuickShortcutsRowBase);
