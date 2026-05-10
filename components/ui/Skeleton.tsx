import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { RADIUS, SPACING, SURFACE } from "../../constants/theme";

type Props = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = "100%", height = 16, borderRadius = RADIUS.sm, style }: Props) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.85, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius, backgroundColor: SURFACE.card, opacity }, style]}
    />
  );
}

export function SkeletonList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[skStyles.list, style]}>{children}</View>;
}

export function SkeletonCard({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[skStyles.card, style]}>
      <View style={skStyles.row}>
        <Skeleton width={44} height={44} borderRadius={RADIUS.lg} />
        <View style={skStyles.lines}>
          <Skeleton width="55%" height={15} />
          <Skeleton width="35%" height={11} />
        </View>
        <Skeleton width={70} height={14} />
      </View>
    </View>
  );
}

export function SkeletonMovementRow({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[skStyles.rowPad, style]}>
      <Skeleton width={42} height={42} borderRadius={RADIUS.lg} />
      <View style={skStyles.lines}>
        <Skeleton width="50%" height={13} />
        <Skeleton width="30%" height={10} />
      </View>
      <Skeleton width={60} height={13} />
    </View>
  );
}

export function SkeletonKpi({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[skStyles.kpi, style]}>
      <Skeleton width="40%" height={11} />
      <Skeleton width="65%" height={32} />
      <Skeleton width="50%" height={11} />
    </View>
  );
}

export function SkeletonObligationRow({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[skStyles.obligationCard, style]}>
      <View style={skStyles.obligationHeader}>
        <View style={skStyles.lines}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="30%" height={11} />
        </View>
        <View style={skStyles.obligationRight}>
          <Skeleton width={80} height={18} />
          <Skeleton width={56} height={10} />
        </View>
      </View>
      <View style={skStyles.obligationBadges}>
        <Skeleton width={60} height={20} borderRadius={99} />
        <Skeleton width={52} height={20} borderRadius={99} />
      </View>
      <Skeleton width="100%" height={4} borderRadius={4} />
    </View>
  );
}

const skStyles = StyleSheet.create({
  list: {
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  obligationCard: {
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  obligationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  obligationRight: {
    alignItems: "flex-end",
    gap: SPACING.xs,
  },
  obligationBadges: {
    flexDirection: "row",
    gap: SPACING.xs,
  },
  card: {
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
  },
  rowPad: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.cardBorder,
  },
  lines: {
    flex: 1,
    gap: SPACING.sm,
  },
  kpi: {
    backgroundColor: SURFACE.card,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
});
