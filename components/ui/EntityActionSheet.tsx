import { StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Card } from "./Card";

export type EntityActionSheetTone = "neutral" | "info" | "success" | "warning" | "danger";

export type EntityActionSheetAction = {
  key: string;
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  loading?: boolean;
};

export type EntityActionSheetQuickAction = {
  key: string;
  label: string;
  onPress: () => void;
  variant?: "secondary" | "ghost" | "primary";
};

export type EntityActionSheetStatusBadge = {
  label: string;
  tone: EntityActionSheetTone;
};

export type EntityActionSheetNotice = {
  key: string;
  text: string;
  tone?: EntityActionSheetTone;
};

type EntityActionSheetCopyBlock = {
  key: string;
  label: string;
  value?: string | null;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  sheetTitle: string;
  summaryLabel?: string;
  summaryTitle: string;
  meta?: Array<string | null | undefined>;
  statusBadge?: EntityActionSheetStatusBadge | null;
  copyBlocks?: EntityActionSheetCopyBlock[];
  notices?: EntityActionSheetNotice[];
  quickActions?: EntityActionSheetQuickAction[];
  actions?: EntityActionSheetAction[];
  quickActionsLabel?: string;
  actionsLabel?: string;
  snapHeight?: number;
};

export function EntityActionSheet({
  visible,
  onClose,
  sheetTitle,
  summaryLabel = "Resumen",
  summaryTitle,
  meta = [],
  statusBadge,
  copyBlocks = [],
  notices = [],
  quickActions = [],
  actions = [],
  quickActionsLabel = "Accesos rápidos",
  actionsLabel = "Acciones",
  snapHeight = 0.62,
}: Props) {
  const cleanMeta = meta.map((item) => item?.trim()).filter(Boolean);
  const visibleCopyBlocks = copyBlocks.filter((block) => block.value?.trim());
  const visibleNotices = notices.filter((notice) => notice.text.trim().length > 0);
  const visibleQuickActions = quickActions.filter((action) => action.label.trim().length > 0);
  const visibleActions = actions.filter((action) => action.label.trim().length > 0);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={sheetTitle} snapHeight={snapHeight}>
      <View style={styles.root}>
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{summaryLabel}</Text>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <View style={styles.summaryTextWrap}>
                <Text style={styles.summaryTitle} numberOfLines={2}>
                  {summaryTitle.trim() || sheetTitle}
                </Text>
                {cleanMeta.length > 0 ? (
                  <Text style={styles.summaryMeta}>{cleanMeta.join(" · ")}</Text>
                ) : null}
              </View>
              {statusBadge ? (
                <View style={[styles.statusBadge, getBadgeStyle(statusBadge.tone)]}>
                  <Text style={[styles.statusBadgeText, getBadgeTextStyle(statusBadge.tone)]}>
                    {statusBadge.label}
                  </Text>
                </View>
              ) : null}
            </View>

            {visibleCopyBlocks.map((block) => (
              <View key={block.key} style={styles.copyBlock}>
                <Text style={styles.copyLabel}>{block.label}</Text>
                <Text style={styles.copyText}>{block.value?.trim()}</Text>
              </View>
            ))}
          </Card>
        </View>

        {visibleNotices.map((notice) => (
          <View
            key={notice.key}
            style={[styles.noticeCard, getNoticeStyle(notice.tone ?? "info")]}
          >
            <Text style={[styles.noticeText, getNoticeTextStyle(notice.tone ?? "info")]}>
              {notice.text}
            </Text>
          </View>
        ))}

        {visibleQuickActions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{quickActionsLabel}</Text>
            <View style={styles.quickActionRow}>
              {visibleQuickActions.map((action) => (
                <Button
                  key={action.key}
                  label={action.label}
                  variant={action.variant ?? "secondary"}
                  size="sm"
                  onPress={action.onPress}
                  style={styles.quickActionBtn}
                />
              ))}
            </View>
          </View>
        ) : null}

        {visibleActions.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{actionsLabel}</Text>
            <View style={styles.actionStack}>
              {visibleActions.map((action) => (
                <Button
                  key={action.key}
                  label={action.label}
                  onPress={action.onPress}
                  variant={action.variant ?? "primary"}
                  disabled={action.disabled}
                  loading={action.loading}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function getBadgeStyle(tone: EntityActionSheetTone) {
  switch (tone) {
    case "success":
      return {
        backgroundColor: COLORS.primary + "18",
        borderColor: COLORS.primary + "44",
      };
    case "warning":
      return {
        backgroundColor: COLORS.warning + "18",
        borderColor: COLORS.warning + "44",
      };
    case "danger":
      return {
        backgroundColor: COLORS.danger + "18",
        borderColor: COLORS.danger + "44",
      };
    case "info":
      return {
        backgroundColor: COLORS.secondary + "18",
        borderColor: COLORS.secondary + "44",
      };
    default:
      return {
        backgroundColor: "rgba(255,255,255,0.06)",
        borderColor: "rgba(255,255,255,0.12)",
      };
  }
}

function getBadgeTextStyle(tone: EntityActionSheetTone) {
  switch (tone) {
    case "success":
      return { color: COLORS.primary };
    case "warning":
      return { color: COLORS.warning };
    case "danger":
      return { color: COLORS.danger };
    case "info":
      return { color: COLORS.secondary };
    default:
      return { color: COLORS.storm };
  }
}

function getNoticeStyle(tone: EntityActionSheetTone) {
  switch (tone) {
    case "success":
      return {
        backgroundColor: COLORS.primary + "14",
        borderColor: COLORS.primary + "36",
      };
    case "warning":
      return {
        backgroundColor: COLORS.warning + "14",
        borderColor: COLORS.warning + "36",
      };
    case "danger":
      return {
        backgroundColor: COLORS.danger + "14",
        borderColor: COLORS.danger + "36",
      };
    case "info":
      return {
        backgroundColor: COLORS.secondary + "14",
        borderColor: COLORS.secondary + "36",
      };
    default:
      return {
        backgroundColor: "rgba(255,255,255,0.04)",
        borderColor: "rgba(255,255,255,0.10)",
      };
  }
}

function getNoticeTextStyle(tone: EntityActionSheetTone) {
  switch (tone) {
    case "success":
      return { color: COLORS.primary };
    case "warning":
      return { color: COLORS.warning };
    case "danger":
      return { color: COLORS.danger };
    case "info":
      return { color: COLORS.ink };
    default:
      return { color: COLORS.storm };
  }
}

const styles = StyleSheet.create({
  root: {
    gap: SPACING.md,
    paddingTop: SPACING.xs,
  },
  section: {
    gap: SPACING.sm,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  summaryCard: {
    gap: SPACING.sm,
    padding: SPACING.md,
  },
  summaryTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
  },
  summaryTextWrap: {
    flex: 1,
    gap: 4,
  },
  summaryTitle: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    lineHeight: FONT_SIZE.lg + 4,
  },
  summaryMeta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  statusBadge: {
    minHeight: 24,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  statusBadgeText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs - 1,
  },
  copyBlock: {
    gap: 4,
    paddingTop: SPACING.xs,
    borderTopWidth: 1,
    borderTopColor: GLASS.separator,
  },
  copyLabel: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  copyText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    lineHeight: FONT_SIZE.sm + 8,
  },
  noticeCard: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  noticeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    lineHeight: FONT_SIZE.sm + 7,
  },
  quickActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  quickActionBtn: {
    alignSelf: "flex-start",
  },
  actionStack: {
    gap: SPACING.sm,
  },
});
