import { useState, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { ChevronDown } from "lucide-react-native";

import { BottomSheet } from "../../../../components/ui/BottomSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";

type Props = {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  calculation: string;
  actionLabel: string;
  onAction: () => void;
};

/** Shared header, explanation and fixed action for executive summary detail sheets. */
export function SummaryDetailSheet({ title, subtitle, onClose, children, calculation, actionLabel, onAction }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { height } = useWindowDimensions();
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={title}
      snapHeight={0.92}
      blurBackdrop={false}
      headerStyle={styles.header}
      contentStyle={[styles.content, { minHeight: height * (expanded ? 0.68 : 0.53) }]}
      footer={<View style={styles.footer}>
        <TouchableOpacity style={styles.primaryButton} onPress={onAction} activeOpacity={0.84} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>{actionLabel}</Text>
        </TouchableOpacity>
      </View>}
    >
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children}
      <TouchableOpacity style={styles.calculationRow} onPress={() => setExpanded((current) => !current)} activeOpacity={0.82} accessibilityRole="button" accessibilityState={{ expanded }}>
        <Text style={styles.calculationTitle}>Cómo se calcula</Text>
        <ChevronDown size={16} color={COLORS.textDisabled} style={expanded && styles.chevronOpen} />
      </TouchableOpacity>
      {expanded ? <Text style={styles.calculationCopy}>{calculation}</Text> : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: SPACING.xl, borderBottomWidth: 0 },
  content: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, gap: 0 },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginBottom: SPACING.xl },
  calculationRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  calculationTitle: { flex: 1, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  chevronOpen: { transform: [{ rotate: "180deg" }] },
  calculationCopy: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 21, color: COLORS.storm, paddingTop: SPACING.md },
  footer: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md },
  primaryButton: { minHeight: 50, borderRadius: RADIUS.xl, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.action },
  primaryButtonText: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.actionText },
});
