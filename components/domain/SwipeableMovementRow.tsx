import { useRef } from "react";
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { CheckCircle2, Circle, Trash2 } from "lucide-react-native";

import { MovementRow } from "./MovementRow";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";
import type { MovementRecord } from "../../types/domain";

const REVEAL_WIDTH = 80;

type Props = {
  movement: MovementRecord;
  baseCurrencyCode: string;
  onPress?: () => void;
  onLongPress?: () => void;
  onDelete?: () => void;
  selectMode?: boolean;
  selected?: boolean;
};

export function SwipeableMovementRow({
  movement, baseCurrencyCode, onPress, onLongPress, onDelete, selectMode, selected,
}: Props) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

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
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => { translateX.stopAnimation(); },
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

  function handleCardPress() {
    if (isOpen.current) { snapTo(0); return; }
    onPress?.();
  }

  function handleDeletePress() {
    snapTo(0, onDelete);
  }

  return (
    <View style={[styles.container, selected && styles.containerSelected]}>
      {/* Delete action revealed on the right */}
      {!selectMode ? (
        <Animated.View style={[styles.actionBg, { opacity: actionOpacity }]}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleDeletePress} activeOpacity={0.8}>
            <Trash2 size={18} color={COLORS.danger} strokeWidth={2} />
            <Text style={styles.actionLabel}>Eliminar</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      {/* Swipeable / tappable row */}
      <Animated.View
        style={{ transform: [{ translateX: selectMode ? new Animated.Value(0) : translateX }], flexDirection: "row", alignItems: "center" }}
        {...(selectMode ? {} : panResponder.panHandlers)}
      >
        {selectMode ? (
          <TouchableOpacity
            style={styles.checkWrap}
            onPress={() => onPress?.()}
            activeOpacity={0.7}
          >
            {selected
              ? <CheckCircle2 size={20} color={COLORS.primary} />
              : <Circle size={20} color={COLORS.storm} />}
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }}>
          <MovementRow
            movement={movement}
            baseCurrencyCode={baseCurrencyCode}
            onPress={handleCardPress}
            onLongPress={onLongPress}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.md,
    marginHorizontal: SPACING.sm,
    marginVertical: 2,
  },
  containerSelected: {
    backgroundColor: COLORS.primary + "12",
    borderWidth: 1,
    borderColor: COLORS.primary + "30",
  },
  checkWrap: {
    paddingLeft: SPACING.sm,
    paddingRight: 4,
    paddingVertical: SPACING.sm,
  },
  actionBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL_WIDTH,
    backgroundColor: COLORS.danger + "30",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: RADIUS.md,
    borderBottomLeftRadius: RADIUS.md,
  },
  actionBtn: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  actionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.danger,
  },
});
