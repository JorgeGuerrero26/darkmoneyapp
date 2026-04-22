import { AlertCircle } from "lucide-react-native";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useHolidayNotice } from "../../hooks/useHolidayNotice";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  dateValue: string;
  countryCode?: string;
  onApplySuggestedDate?: (value: string) => void;
};

export function BusinessDateNotice({ dateValue, countryCode = "PE", onApplySuggestedDate }: Props) {
  const { notice } = useHolidayNotice(dateValue, countryCode);
  if (!notice) return null;

  return (
    <View style={styles.notice}>
      <AlertCircle size={15} color={COLORS.gold} strokeWidth={2} />
      <View style={styles.copy}>
        <Text style={styles.title}>{notice.title}</Text>
        <Text style={styles.detail}>{notice.detail}</Text>
        {onApplySuggestedDate ? (
          <TouchableOpacity
            style={styles.action}
            onPress={() => onApplySuggestedDate(notice.suggestedDate)}
            activeOpacity={0.75}
          >
            <Text style={styles.actionText}>Usar fecha sugerida</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.gold + "14",
    borderWidth: 1,
    borderColor: COLORS.gold + "3D",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
  detail: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
  action: {
    alignSelf: "flex-start",
    marginTop: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.gold + "20",
    borderWidth: 1,
    borderColor: COLORS.gold + "55",
  },
  actionText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.gold,
  },
});
