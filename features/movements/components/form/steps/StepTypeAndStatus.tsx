import { memo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ArrowDownCircle, ArrowLeftRight, ArrowUpCircle } from "lucide-react-native";

import { Button } from "../../../../../components/ui/Button";
import {
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  RADIUS,
  SPACING,
  SURFACE,
} from "../../../../../constants/theme";
import { MOVEMENT_LABELS } from "../../../lib/labels";
import type { MovementStatus, MovementType } from "../../../../../types/domain";

const TYPE_OPTIONS: { type: MovementType; label: string; Icon: typeof ArrowDownCircle; color: string }[] = [
  { type: "expense", label: MOVEMENT_LABELS.type.expense, Icon: ArrowDownCircle, color: COLORS.expense },
  { type: "income", label: MOVEMENT_LABELS.type.income, Icon: ArrowUpCircle, color: COLORS.income },
  { type: "transfer", label: MOVEMENT_LABELS.type.transfer, Icon: ArrowLeftRight, color: COLORS.transfer },
];

const STATUS_OPTIONS: { status: MovementStatus; label: string }[] = [
  { status: "posted", label: MOVEMENT_LABELS.status.posted },
  { status: "pending", label: MOVEMENT_LABELS.status.pending },
  { status: "planned", label: MOVEMENT_LABELS.status.planned },
];

type Props = {
  movementType: MovementType;
  status: MovementStatus;
  onChangeType: (type: MovementType) => void;
  onChangeStatus: (status: MovementStatus) => void;
  onNext: () => void;
};

export const StepTypeAndStatus = memo(function StepTypeAndStatus({
  movementType,
  status,
  onChangeType,
  onChangeStatus,
  onNext,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>Tipo</Text>
      <View style={styles.typeGrid}>
        {TYPE_OPTIONS.map((opt) => {
          const isActive = movementType === opt.type;
          return (
            <View
              key={opt.type}
              style={[
                styles.typeButtonWrap,
                isActive && {
                  borderColor: opt.color + "AA",
                  borderTopColor: opt.color + "CC",
                },
              ]}
            >
              <TouchableOpacity
                style={styles.typeButtonInner}
                onPress={() => onChangeType(opt.type)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Tipo de movimiento: ${opt.label}`}
                accessibilityState={{ selected: isActive }}
              >
                <opt.Icon size={26} color={isActive ? opt.color : COLORS.storm} />
                <Text style={[styles.typeLabel, isActive && { color: opt.color }]}>
                  {opt.label}
                </Text>
                {isActive ? (
                  <View style={[styles.typeActiveDot, { backgroundColor: opt.color }]} />
                ) : null}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {movementType !== "transfer" ? (
        <>
          <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>Estado</Text>
          <View style={styles.statusRow}>
            {STATUS_OPTIONS.map((opt) => {
              const isActive = status === opt.status;
              return (
                <TouchableOpacity
                  key={opt.status}
                  style={[styles.statusPill, isActive && styles.statusPillActive]}
                  onPress={() => onChangeStatus(opt.status)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Estado: ${opt.label}`}
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={[styles.statusText, isActive && styles.statusTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      <Button label="Siguiente →" onPress={onNext} style={styles.btn} />
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: SPACING.md },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  typeGrid: { flexDirection: "row", gap: SPACING.sm },
  typeButtonWrap: {
    flex: 1,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
    backgroundColor: SURFACE.card,
  },
  typeButtonInner: {
    flex: 1,
    alignItems: "center",
    paddingVertical: SPACING.xl,
    gap: SPACING.sm,
    backgroundColor: "transparent",
  },
  typeActiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 2,
  },
  typeLabel: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    letterSpacing: 0.2,
  },
  statusRow: { flexDirection: "row", gap: SPACING.sm },
  statusPill: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.softBorder,
    backgroundColor: SURFACE.card,
  },
  statusPillActive: {
    backgroundColor: COLORS.pine + "28",
    borderColor: COLORS.pine + "99",
    shadowColor: COLORS.pine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  statusText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  statusTextActive: { color: COLORS.pine, fontFamily: FONT_FAMILY.bodySemibold },
  btn: { marginTop: SPACING.sm },
});
