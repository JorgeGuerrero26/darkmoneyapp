import { memo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronRight, Plus } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { buildQuickRow, type QuickEntry } from "../../movements/lib/quickEntries";

type Props = {
  /** Los que encajan con este momento. */
  entries: QuickEntry[];
  /** Todos los que existen, para la puerta "Ver todos". */
  pool: QuickEntry[];
  currencyCode: string;
  /** El que se está guardando ahora mismo, para no dejar el toque sin respuesta. */
  savingKey: string | null;
  /** El último guardado: el mosaico enseña la marca unos segundos y vuelve. */
  savedKey: string | null;
  onRegister: (entry: QuickEntry) => void;
};

/** Atajos de movimientos frecuentes, presentados como filas del resumen. */
function QuickShortcutsRowBase({
  entries,
  pool,
  currencyCode,
  savingKey,
  savedKey,
  onRegister,
}: Props) {
  const [allOpen, setAllOpen] = useState(false);
  const { tiles, showAll } = buildQuickRow(entries, pool);

  if (tiles.length === 0) return null;

  return (
    <>
      <Text style={styles.heading}>Anotar de nuevo</Text>
      <View style={styles.row}>
        {tiles.map((entry) => (
          <Tile
            key={entry.key}
            entry={entry}
            currencyCode={currencyCode}
            saving={savingKey === entry.key}
            saved={savedKey === entry.key}
            onPress={() => onRegister(entry)}
          />
        ))}
        {showAll ? (
          <Pressable
            style={({ pressed }) => [styles.tile, styles.moreTile, pressed && styles.tilePressed]}
            onPress={() => setAllOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Ver los ${pool.length} atajos`}
          >
            <Text style={styles.moreLabel} numberOfLines={1}>Ver todos</Text>
            <ChevronRight size={14} color={COLORS.storm} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <BottomSheet visible={allOpen} onClose={() => setAllOpen(false)} title="Tus atajos" snapHeight={0.7}>
        <View style={styles.sheetList}>
          {pool.map((entry, index) => (
            <Pressable
              key={entry.key}
              style={({ pressed }) => [
                styles.sheetRow,
                index < pool.length - 1 && styles.sheetRowDivided,
                pressed && styles.tilePressed,
              ]}
              onPress={() => { setAllOpen(false); onRegister(entry); }}
              accessibilityRole="button"
              accessibilityLabel={`Anotar ${entry.label} de ${formatCurrency(entry.amount, currencyCode)}`}
            >
              <Plus size={15} color={COLORS.fog} strokeWidth={2.5} />
              <Text style={styles.sheetLabel} numberOfLines={1}>{entry.label}</Text>
              <Text style={styles.sheetAmount}>{formatCurrency(entry.amount, currencyCode)}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function Tile({
  entry,
  currencyCode,
  saving,
  saved,
  onPress,
}: {
  entry: QuickEntry;
  currencyCode: string;
  saving: boolean;
  saved: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, saving && styles.tileSaving]}
      onPress={onPress}
      disabled={saving}
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
