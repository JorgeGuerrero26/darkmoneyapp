import { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, X, Plus } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Action = {
  label: string;
  color: string;
  icon: React.ReactNode;
  onPress: () => void;
};

type Props = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onGasto: () => void;
  onIngreso: () => void;
  onTransferencia: () => void;
  bottom: number;
};

const ACTIONS = (
  onGasto: () => void,
  onIngreso: () => void,
  onTransferencia: () => void,
): Action[] => [
  {
    label: "Gasto",
    color: COLORS.expense,
    icon: <ArrowDownCircle size={20} color="#FFF" strokeWidth={2} />,
    onPress: onGasto,
  },
  {
    label: "Ingreso",
    color: COLORS.income,
    icon: <ArrowUpCircle size={20} color="#FFF" strokeWidth={2} />,
    onPress: onIngreso,
  },
  {
    label: "Transferencia",
    color: COLORS.primary,
    icon: <ArrowLeftRight size={20} color="#05070B" strokeWidth={2} />,
    onPress: onTransferencia,
  },
];

export function ExpandableFAB({
  open,
  onToggle,
  onClose,
  onGasto,
  onIngreso,
  onTransferencia,
  bottom,
}: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const actions = ACTIONS(onGasto, onIngreso, onTransferencia);

  // Each action has its own translate + opacity
  const actionAnims = useRef(actions.map(() => ({
    translateY: new Animated.Value(0),
    opacity: new Animated.Value(0),
    scale: new Animated.Value(0.6),
  }))).current;

  useEffect(() => {
    if (open) {
      const actionOpenAnims = actionAnims.map((a, i) =>
        Animated.parallel([
          Animated.spring(a.translateY, {
            toValue: -((i + 1) * 68),
            tension: 70,
            friction: 10,
            useNativeDriver: true,
          }),
          Animated.timing(a.opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
          Animated.spring(a.scale, {
            toValue: 1,
            tension: 80,
            friction: 9,
            useNativeDriver: true,
          }),
        ]),
      );
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ...actionOpenAnims,
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        ...actionAnims.map((a) =>
          Animated.parallel([
            Animated.timing(a.translateY, { toValue: 0, duration: 150, useNativeDriver: true }),
            Animated.timing(a.opacity, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(a.scale, { toValue: 0.6, duration: 150, useNativeDriver: true }),
          ]),
        ),
      ]).start();
    }
  }, [open]);

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[styles.overlay, { opacity: overlayOpacity }]}
        pointerEvents={open ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Action sub-buttons */}
      <View style={[styles.actionsWrap, { bottom }]} pointerEvents="box-none">
        {actions.map((action, i) => (
          <Animated.View
            key={action.label}
            style={[
              styles.actionItem,
              {
                transform: [
                  { translateY: actionAnims[i].translateY },
                  { scale: actionAnims[i].scale },
                ],
                opacity: actionAnims[i].opacity,
              },
            ]}
            pointerEvents={open ? "auto" : "none"}
          >
            <TouchableOpacity
              style={[styles.actionLabel]}
              onPress={() => { onClose(); action.onPress(); }}
              activeOpacity={0.85}
            >
              <Text style={styles.actionLabelText}>{action.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: action.color }]}
              onPress={() => { onClose(); action.onPress(); }}
              activeOpacity={0.85}
            >
              {action.icon}
            </TouchableOpacity>
          </Animated.View>
        ))}
      </View>

      {/* Main FAB */}
      <View style={[styles.glowWrap, { bottom, zIndex: 102 }]}>
        <TouchableOpacity
          style={[styles.fab, open && styles.fabOpen]}
          onPress={onToggle}
          activeOpacity={0.82}
          accessibilityLabel={open ? "Cerrar" : "Nuevo movimiento"}
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Plus size={22} color="#05070B" strokeWidth={2.5} />
          </Animated.View>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,7,13,0.6)",
    zIndex: 99,
    elevation: 8,
  },
  actionsWrap: {
    position: "absolute",
    right: SPACING.lg,
    alignItems: "flex-end",
    zIndex: 101,
    elevation: 12,
  },
  actionItem: {
    position: "absolute",
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  actionLabel: {
    backgroundColor: "rgba(8,14,24,0.90)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  actionLabelText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: "#E8EDF5",
  },
  actionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  glowWrap: {
    position: "absolute",
    right: SPACING.lg,
    width: 52,
    height: 52,
    borderRadius: 26,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    borderWidth: 2.5,
    borderColor: COLORS.primary + "40",
    backgroundColor: "transparent",
    elevation: 16,
  },
  fab: {
    width: "100%",
    height: "100%",
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 10,
  },
  fabOpen: {
    backgroundColor: COLORS.storm,
  },
});
