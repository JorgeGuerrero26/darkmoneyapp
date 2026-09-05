import { useEffect, useState } from "react";
import { Keyboard, LayoutAnimation, Platform } from "react-native";

/**
 * Cuánto ocupa el teclado ahora mismo, medido a mano.
 *
 * Hace falta porque las capas de la app son `position: absolute` dentro de un Modal, y el
 * posicionamiento absoluto **ignora el padding del padre**: `KeyboardAvoidingView` no las mueve.
 * En Android, además, un Modal con `statusBarTranslucent` tampoco respeta `adjustResize`.
 *
 * iOS avisa con los eventos *Will*, antes de animar, así que la capa sube en sincronía con el
 * teclado; Android solo emite los *Did* de forma fiable.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    // Copia la curva y la duración reales del teclado: sin esto, el alto y el desplazamiento
    // van por separado y se ve el corte.
    const animateWithKeyboard = (duration?: number) => {
      if (Platform.OS !== "ios") return;
      LayoutAnimation.configureNext({
        duration: duration && duration > 0 ? duration : 250,
        update: { type: "keyboard" },
      });
    };

    const showSub = Keyboard.addListener(showEvent, (event) => {
      animateWithKeyboard(event.duration);
      setHeight(event.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, (event) => {
      animateWithKeyboard(event?.duration);
      setHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
