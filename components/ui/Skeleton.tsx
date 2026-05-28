import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { RADIUS, SPACING, SURFACE } from "../../constants/theme";

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

type Props = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

export function Skeleton({ width = "100%", height = 16, borderRadius = RADIUS.sm, style }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const [measuredWidth, setMeasuredWidth] = useState(0);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1400,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [progress]);

  function handleLayout(event: LayoutChangeEvent) {
    const w = event.nativeEvent.layout.width;
    if (w > 0 && w !== measuredWidth) setMeasuredWidth(w);
  }

  const translateX = measuredWidth
    ? progress.interpolate({
        inputRange: [0, 1],
        outputRange: [-measuredWidth, measuredWidth],
      })
    : 0;

  return (
    <View
      onLayout={handleLayout}
      style={[
        { width: width as any, height, borderRadius, backgroundColor: SURFACE.card, overflow: "hidden" },
        style,
      ]}
    >
      {measuredWidth > 0 ? (
        <AnimatedLinearGradient
          colors={["rgba(255,255,255,0)", "rgba(255,255,255,0.12)", "rgba(255,255,255,0)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[StyleSheet.absoluteFillObject, { transform: [{ translateX }] }]}
        />
      ) : null}
    </View>
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
