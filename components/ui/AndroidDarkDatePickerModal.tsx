import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

const WEEK_LABELS = ["L", "M", "X", "J", "V", "S", "D"];

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isDayDisabled(day: Date, minimumDate?: Date, maximumDate?: Date): boolean {
  const t = startOfLocalDay(day).getTime();
  if (minimumDate) {
    const min = startOfLocalDay(minimumDate).getTime();
    if (t < min) return true;
  }
  if (maximumDate) {
    const max = startOfLocalDay(maximumDate).getTime();
    if (t > max) return true;
  }
  return false;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  label: string;
  initialDate: Date;
  minimumDate?: Date;
  maximumDate?: Date;
  optional?: boolean;
  onConfirm: (yyyyMmDd: string) => void;
  onClear: () => void;
};

/**
 * Calendario mensual tema oscuro (Android). Sustituye el DatePicker Material blanco del sistema.
 */
export function AndroidDarkDatePickerModal({
  visible,
  onClose,
  label,
  initialDate,
  minimumDate,
  maximumDate,
  optional,
  onConfirm,
  onClear,
}: Props) {
  const insets = useSafeAreaInsets();
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(initialDate));
  const [selected, setSelected] = useState(() => startOfLocalDay(initialDate));

  const seedKey = format(startOfLocalDay(initialDate), "yyyy-MM-dd");
  useEffect(() => {
    if (!visible) return;
    const seed = startOfLocalDay(initialDate);
    setSelected(seed);
    setViewMonth(startOfMonth(seed));
  }, [visible, seedKey, initialDate]);

  const gridDays = useMemo(() => {
    const m0 = startOfMonth(viewMonth);
    const m1 = endOfMonth(viewMonth);
    const from = startOfWeek(m0, { weekStartsOn: 1 });
    const to = endOfWeek(m1, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: from, end: to });
  }, [viewMonth]);

  const rows = useMemo(() => {
    const out: Date[][] = [];
    for (let i = 0; i < gridDays.length; i += 7) {
      out.push(gridDays.slice(i, i + 7));
    }
    return out;
  }, [gridDays]);

  function handleConfirm() {
    if (isDayDisabled(selected, minimumDate, maximumDate)) return;
    onConfirm(format(selected, "yyyy-MM-dd"));
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            { marginBottom: Math.max(insets.bottom, SPACING.lg) },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <Text style={styles.cardLabel}>{label}</Text>
          <Text style={styles.selectedPreview}>
            {format(selected, "EEEE, d 'de' MMMM yyyy", { locale: es })}
          </Text>

          <View style={styles.monthRow}>
            <TouchableOpacity
              onPress={() => setViewMonth((m) => addMonths(m, -1))}
              style={styles.monthNav}
              hitSlop={12}
            >
              <ChevronLeft size={22} color={COLORS.ink} strokeWidth={2} />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {format(viewMonth, "MMMM yyyy", { locale: es })}
            </Text>
            <TouchableOpacity
              onPress={() => setViewMonth((m) => addMonths(m, 1))}
              style={styles.monthNav}
              hitSlop={12}
            >
              <ChevronRight size={22} color={COLORS.ink} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEK_LABELS.map((w) => (
              <Text key={w} style={styles.weekCell}>
                {w}
              </Text>
            ))}
          </View>

          {rows.map((week, wi) => (
            <View key={wi} style={styles.dayRow}>
              {week.map((day) => {
                const outside = !isSameMonth(day, viewMonth);
                const disabled = isDayDisabled(day, minimumDate, maximumDate);
                const sel = isSameDay(day, selected);
                return (
                  <TouchableOpacity
                    key={format(day, "yyyy-MM-dd")}
                    style={[
                      styles.dayCell,
                      sel && styles.dayCellSelected,
                      disabled && styles.dayCellDisabled,
                    ]}
                    disabled={disabled}
                    onPress={() => setSelected(startOfLocalDay(day))}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.dayText,
                        outside && styles.dayTextOutside,
                        sel && styles.dayTextSelected,
                        disabled && styles.dayTextDisabled,
                      ]}
                    >
                      {format(day, "d")}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={onClose}>
              <Text style={styles.btnGhostText}>Cancelar</Text>
            </TouchableOpacity>
            {optional ? (
              <TouchableOpacity style={styles.btnGhost} onPress={onClear}>
                <Text style={styles.btnDangerText}>Quitar</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.btnPrimary} onPress={handleConfirm}>
              <Text style={styles.btnPrimaryText}>Aceptar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(10,14,20,0.98)",
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderTopColor: "rgba(107,228,197,0.28)",
    borderLeftColor: "rgba(255,255,255,0.10)",
    borderRightColor: "rgba(255,255,255,0.08)",
    borderBottomColor: "rgba(255,255,255,0.05)",
    padding: SPACING.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.55,
    shadowRadius: 28,
    elevation: 24,
  },
  cardLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  selectedPreview: {
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
    textAlign: "center",
    textTransform: "capitalize",
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: SPACING.md,
  },
  monthNav: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.card,
  },
  monthTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    textTransform: "capitalize",
  },
  weekRow: {
    flexDirection: "row",
    marginBottom: SPACING.xs,
  },
  weekCell: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
  },
  dayRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  dayCell: {
    flex: 1,
    maxWidth: 48,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  dayCellSelected: {
    backgroundColor: COLORS.primary,
  },
  dayCellDisabled: {
    opacity: 0.28,
  },
  dayText: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.ink,
  },
  dayTextOutside: {
    color: COLORS.textDisabled,
  },
  dayTextSelected: {
    color: COLORS.textInverse,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  dayTextDisabled: {
    color: COLORS.storm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: GLASS.separator,
  },
  btnGhost: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  btnGhostText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  btnDangerText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
  },
  btnPrimary: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  btnPrimaryText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.textInverse,
  },
});
