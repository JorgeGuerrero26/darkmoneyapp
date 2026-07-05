import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { SafeBlurView } from "./SafeBlurView";

const SCREEN_HEIGHT = Dimensions.get("window").height;
const DISMISS_THRESHOLD = 80;

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapHeight?: number;
  scrollRef?: React.RefObject<ScrollView | null>;
  backdropColor?: string;
  blurBackdrop?: boolean;
};

export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  snapHeight = 0.75,
  scrollRef,
  backdropColor = "rgba(0,0,0,0.45)",
  blurBackdrop = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const isSwiping = useRef(false);
  // Android: el Modal con statusBarTranslucent NO respeta adjustResize, así que el
  // KeyboardAvoidingView no empuja nada y el teclado tapaba los inputs del sheet.
  // Medimos el teclado a mano y levantamos el sheet esa altura.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      isSwiping.current = false;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 58,
          friction: 13,
        }),
      ]).start();
    } else if (!isSwiping.current) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, translateY, backdropOpacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, { dx, dy }) => dy > 6 && Math.abs(dy) > Math.abs(dx),
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) translateY.setValue(dy);
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > DISMISS_THRESHOLD || vy > 0.5) {
          isSwiping.current = true;
          Animated.parallel([
            Animated.timing(backdropOpacity, {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: SCREEN_HEIGHT,
              duration: 240,
              useNativeDriver: true,
            }),
          ]).start(() => {
            isSwiping.current = false;
            onClose();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
          }).start();
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Animated backdrop: blur + dark dim */}
      <Animated.View style={[StyleSheet.absoluteFillObject, { opacity: backdropOpacity }]}>
        {blurBackdrop ? (
          <SafeBlurView
            intensity={22}
            tint="dark"
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        <Pressable
          style={[StyleSheet.absoluteFillObject, { backgroundColor: backdropColor }]}
          onPress={onClose}
        />
      </Animated.View>

      {/* Sheet — iOS usa KAV (padding); Android usa keyboardHeight medido a mano */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboardContainer}
      >
      <Animated.View
        style={[
          styles.sheet,
          {
            maxHeight: Math.min(
              SCREEN_HEIGHT * snapHeight,
              SCREEN_HEIGHT - keyboardHeight - insets.top - SPACING.lg,
            ),
            bottom: keyboardHeight,
            paddingBottom: keyboardHeight > 0 ? SPACING.md : insets.bottom + SPACING.lg,
            transform: [{ translateY }],
          },
        ]}
      >
        <View {...panResponder.panHandlers}>
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                <View style={styles.closeBtnInner}>
                  <X size={16} color={COLORS.storm} />
                </View>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

        <ScrollView
          ref={scrollRef as React.RefObject<ScrollView> | undefined}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {children}
        </ScrollView>
      </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderTopColor: SURFACE.sheetBorder,
    borderLeftColor: SURFACE.sheetBorder,
    borderRightColor: SURFACE.sheetBorder,
    ...ELEVATION[4],
  },
  handleWrap: {
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xxxl,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    borderBottomWidth: 0.5,
    borderBottomColor: SURFACE.separator,
  },
  title: {
    flex: 1,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  closeBtn: { padding: SPACING.xs },
  closeBtnInner: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: SURFACE.cardBorder,
    borderWidth: 1,
    borderColor: SURFACE.sheetBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  content: { padding: SPACING.lg, gap: SPACING.md },
});
