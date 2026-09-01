import { useEffect, useState, type ReactNode } from "react";
import {
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { SafeBlurView } from "./SafeBlurView";

const SCREEN_HEIGHT = Dimensions.get("window").height;

type Props = {
  visible: boolean;
  title: string;
  /** Volver sin guardar. Descarta solo lo de esta hoja. */
  onBack: () => void;
  /** Texto de la acción de la cabecera, a la derecha. Guarda y vuelve. */
  doneLabel?: string;
  onDone?: () => void;
  children: ReactNode;
  /** Barra fija al pie, hermana del scroll. */
  footer?: ReactNode;
  /** Alto máximo como fracción de la pantalla. */
  height?: `${number}%`;
};

/**
 * Una hoja **dentro** de otra hoja.
 *
 * iOS presenta un Modal a la vez, así que una segunda pantalla abierta desde un formulario no
 * puede ser otro Modal: se pinta como capa sobre el sheet que la abrió, por la prop `overlay`
 * de `BottomSheet`. Misma razón que `<ConfirmDialog inline />` y `<SearchableSelectSheet inline />`
 * (fallo del 2026-08-13).
 *
 * La cabecera lleva el chevrón de volver a la izquierda —vuelve **sin guardar**— y la acción de
 * guardar a la derecha, porque estas hojas se abren desde un formulario al que hay que regresar.
 */
export function InlineFormSheet({
  visible,
  title,
  onBack,
  doneLabel,
  onDone,
  children,
  footer,
  height = "92%",
}: Props) {
  const insets = useSafeAreaInsets();
  /**
   * El teclado, medido a mano y en las dos plataformas — el mismo tratamiento que ya tenía
   * `BottomSheet` y que esta hoja nunca recibió.
   *
   * Sin esto pasaban las dos cosas que se reportaron a la vez: el botón del pie quedaba pegado
   * al borde inferior del teléfono (faltaba el área segura, que en un iPhone con gesto son 34px
   * de barra), y al escribir un monto el teclado tapaba el campo en lugar de empujar la hoja,
   * porque la capa es `position: absolute` y el padding del padre no la mueve.
   */
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // iOS avisa con los *Will*, antes de animar; Android solo emite los *Did* de forma fiable.
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const animateWithKeyboard = (duration?: number) => {
      if (Platform.OS !== "ios") return;
      // Copia la curva y la duración reales del teclado, así el alto y el desplazamiento van
      // juntos y no se ve el corte.
      LayoutAnimation.configureNext({
        duration: duration && duration > 0 ? duration : 250,
        update: { type: "keyboard" },
      });
    };
    const showSub = Keyboard.addListener(showEvent, (event) => {
      animateWithKeyboard(event.duration);
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      animateWithKeyboard(event?.duration);
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  if (!visible) return null;

  const maxRatio = Number(height.replace("%", "")) / 100;

  return (
    <View style={styles.root}>
      <SafeBlurView intensity={45} tint="dark" style={StyleSheet.absoluteFillObject} />
      <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={onBack} activeOpacity={1} />
      <View
        style={[
          styles.card,
          {
            maxHeight: Math.min(
              SCREEN_HEIGHT * maxRatio,
              SCREEN_HEIGHT - keyboardHeight - insets.top - SPACING.lg,
            ),
            bottom: keyboardHeight,
            // Con el teclado fuera, el pie respeta la barra de gestos; con el teclado dentro, esa
            // barra no está y el hueco sobraría.
            paddingBottom: keyboardHeight > 0 ? SPACING.md : insets.bottom + SPACING.md,
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={onBack}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Volver sin guardar"
          >
            <ChevronLeft size={20} color={COLORS.fog} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {doneLabel && onDone ? (
            <TouchableOpacity
              onPress={onDone}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
            >
              <Text style={styles.done}>{doneLabel}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSpacer} />
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>

        {footer}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    elevation: 20,
    justifyContent: "flex-end",
  },
  card: {
    // `bottom` se controla desde el render para subir la hoja con el teclado.
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: SURFACE.sheet,
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderTopWidth: 1,
    borderTopColor: SURFACE.sheetBorder,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    flex: 1,
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    letterSpacing: -0.3,
  },
  done: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.md,
    color: COLORS.fog,
  },
  headerSpacer: { width: 20 },
  scroll: { flexShrink: 1 },
  content: { padding: SPACING.lg, paddingTop: 0, gap: SPACING.md },
});
