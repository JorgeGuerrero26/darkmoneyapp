import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Sparkles } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { useHaptics } from "../../hooks/useHaptics";

type Props = {
  label: string;
  detail?: string;
  onApply: () => void;
};

type LoadingProps = {
  title?: string;
  detail?: string;
};

const AI_GRADIENT_COLORS = [COLORS.secondary, COLORS.dangerSoft, COLORS.gold, COLORS.primary] as const;

export function SmartSuggestion({ label, detail, onApply }: Props) {
  const haptics = useHaptics();
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={() => { haptics.light(); onApply(); }}
    >
      <Sparkles size={13} color={COLORS.primary} strokeWidth={2} />
      <View style={styles.copy}>
        <Text style={styles.text} numberOfLines={1}>
          Sugerido:{" "}
          <Text style={styles.value}>{label}</Text>
        </Text>
        {detail ? <Text style={styles.detail} numberOfLines={1}>{detail}</Text> : null}
      </View>
      <View style={styles.applyBadge}>
        <Text style={styles.applyText}>Aplicar</Text>
      </View>
    </Pressable>
  );
}

export function SmartSuggestionLoading({
  title = "Preparando una mejor sugerencia",
  detail = "Revisando si conviene confirmar o mejorar la categoría actual.",
}: LoadingProps) {
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      breath.stopAnimation();
    };
  }, [breath]);

  const opacity = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 0.9],
  });
  const scale = breath.interpolate({
    inputRange: [0, 1],
    outputRange: [0.985, 1.015],
  });

  return (
    <View style={styles.loadingRow}>
      <Animated.View style={[styles.loadingGradientWrap, { opacity, transform: [{ scaleX: scale }] }]}>
        <LinearGradient
          colors={AI_GRADIENT_COLORS}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.loadingIcon}>
        <Sparkles size={13} color={COLORS.primary} strokeWidth={2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.loadingTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.detail} numberOfLines={2}>{detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingVertical: SPACING.xs + 2,
    paddingHorizontal: SPACING.md,
    backgroundColor: "rgba(107,228,197,0.06)",
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.20)",
    marginTop: -SPACING.xs,
  },
  copy: {
    flex: 1,
  },
  pressed: { opacity: 0.7 },
  text: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  value: {
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.primary,
  },
  detail: {
    marginTop: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.storm,
  },
  applyBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    backgroundColor: SURFACE.cardActive,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: SURFACE.cardActiveBorder,
  },
  applyText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
  },
  loadingRow: {
    position: "relative",
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: SURFACE.deepNavy,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.22)",
    marginTop: -SPACING.xs,
  },
  loadingGradientWrap: {
    position: "absolute",
    left: -12,
    right: -12,
    top: 0,
    height: 2,
  },
  loadingIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(107,228,197,0.10)",
    borderWidth: 1,
    borderColor: "rgba(107,228,197,0.24)",
  },
  loadingTitle: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.ink,
  },
});
