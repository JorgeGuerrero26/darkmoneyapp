import { useRef } from "react";
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Archive, ArchiveRestore, BarChart2 } from "lucide-react-native";
import { Card } from "../ui/Card";
import { formatCurrency } from "../ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import { getAccountIcon } from "../../lib/account-icons";
import type { AccountSummary } from "../../types/domain";

type Props = {
  account: AccountSummary;
  onPress?: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onAnalytics?: () => void;
  selected?: boolean;
  selectMode?: boolean;
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking:    "Cuenta corriente",
  savings:     "Ahorro",
  credit_card: "Tarjeta de crédito",
  cash:        "Efectivo",
  investment:  "Inversión",
  loan:        "Préstamo",
  loan_wallet: "Cartera préstamos",
  bank:        "Banco",
  other:       "Otro",
};

const REVEAL_WIDTH = 82;

function AccountCardContent({
  account,
  onAnalytics,
}: {
  account: AccountSummary;
  onAnalytics?: () => void;
}) {
  const typeLabel = ACCOUNT_TYPE_LABELS[account.type] ?? account.type;
  const isNegative = account.currentBalance < 0;
  const AccountIcon = getAccountIcon(account.icon, account.type);

  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: account.color + "22" }]}>
        <AccountIcon size={20} color={account.color} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{account.name}</Text>
        <Text style={styles.sub}>{typeLabel} · {account.currencyCode}</Text>
      </View>
      {onAnalytics ? (
        <TouchableOpacity
          onPress={onAnalytics}
          style={styles.analyticsBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <BarChart2 size={14} color={COLORS.storm} strokeWidth={2} />
        </TouchableOpacity>
      ) : null}
      <Text style={[styles.balance, isNegative && styles.balanceNeg]}>
        {formatCurrency(account.currentBalance, account.currencyCode)}
      </Text>
    </View>
  );
}

export function AccountCard({ account, onPress, onArchive, onRestore, onAnalytics, selected, selectMode }: Props) {
  const isSwipeable = !!(onArchive || onRestore);
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  // Fade the action area in as the card is swiped — invisible at rest
  const actionOpacity = translateX.interpolate({
    inputRange: [-REVEAL_WIDTH, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    isOpen.current = toValue !== 0;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(cb);
  };

  const panResponder = useRef(
    PanResponder.create({
      // Only intercept clearly horizontal moves
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => {
        // Stop animation so drag feels immediate
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, { dx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const next = Math.max(-REVEAL_WIDTH * 1.4, Math.min(0, base + dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const finalX = base + dx;
        if (finalX < -REVEAL_WIDTH / 2 || vx < -0.4) {
          snapTo(-REVEAL_WIDTH);
        } else {
          snapTo(0);
        }
      },
    })
  ).current;

  function handleActionPress() {
    snapTo(0, () => {
      if (account.isArchived) {
        onRestore?.();
      } else {
        onArchive?.();
      }
    });
  }

  function handleCardPress() {
    if (isOpen.current) {
      snapTo(0);
      return;
    }
    onPress?.();
  }

  if (!isSwipeable) {
    return (
      <Card onPress={onPress} style={[styles.card, selected && styles.cardSelected]}>
        <AccountCardContent account={account} onAnalytics={onAnalytics} />
      </Card>
    );
  }

  return (
    <View style={[styles.swipeContainer, selected && styles.cardSelected]}>
      {/* Action revealed on the right — hidden at rest, fades in on swipe */}
      <Animated.View style={[
        styles.actionBg,
        account.isArchived ? styles.actionBgRestore : styles.actionBgArchive,
        { opacity: actionOpacity },
      ]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleActionPress} activeOpacity={0.8}>
          {account.isArchived
            ? <ArchiveRestore size={20} color={COLORS.pine} strokeWidth={2} />
            : <Archive size={20} color={COLORS.ember} strokeWidth={2} />
          }
          <Text style={[styles.actionLabel, account.isArchived ? styles.actionLabelRestore : styles.actionLabelArchive]}>
            {account.isArchived ? "Restaurar" : "Archivar"}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Swipeable card */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Card
          onPress={handleCardPress}
          style={styles.card}
        >
          <AccountCardContent account={account} onAnalytics={onAnalytics} />
        </Card>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: SPACING.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  sub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  balance: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  balanceNeg: { color: COLORS.rosewood },
  analyticsBtn: {
    padding: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    marginRight: 2,
  },
  cardSelected: {
    borderWidth: 1,
    borderColor: COLORS.primary + "55",
    backgroundColor: COLORS.primary + "10",
  },
  // Swipeable layout
  swipeContainer: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  actionBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    // Round left corners to match the card when revealed
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
  },
  actionBgArchive: {
    backgroundColor: COLORS.ember + "30",
  },
  actionBgRestore: {
    backgroundColor: COLORS.pine + "30",
  },
  actionBtn: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  actionLabelArchive: { color: COLORS.ember },
  actionLabelRestore: { color: COLORS.pine },
});
