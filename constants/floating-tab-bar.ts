import { Platform } from "react-native";

/**
 * Barra de pestañas flotante de iOS.
 *
 * En iOS la barra es una píldora `position: absolute` separada del borde, así que el
 * contenido corre POR DETRÁS de ella (es lo que da la sensación de flotar y de vidrio).
 * A cambio, React Navigation ya no le reserva espacio: cada lista/scroll y cada FAB debe
 * dejar libre esta franja para no quedar tapado.
 *
 * En Android la barra sigue en el flujo y ocupa todo el ancho, así que aquí vale 0 y nada
 * cambia de ese lado.
 */
export const FLOATING_TAB_BAR_HEIGHT = 60;
/** Separación entre la píldora y el safe area inferior. */
export const FLOATING_TAB_BAR_GAP = 8;

/** Espacio que la píldora ocupa por encima del safe area. 0 en Android. */
export const IOS_FLOATING_TAB_BAR_SPACE =
  Platform.OS === "ios" ? FLOATING_TAB_BAR_HEIGHT + FLOATING_TAB_BAR_GAP : 0;
