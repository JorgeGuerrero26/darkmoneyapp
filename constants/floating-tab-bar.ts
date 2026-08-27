import { Platform } from "react-native";

/**
 * Barra de pestañas ANCLADA.
 *
 * Hasta el rediseño, en iOS era una píldora flotante `position: absolute`: el contenido corría
 * por detrás, que es lo que daba la sensación de flotar. El precio era que React Navigation NO
 * le reservaba espacio, así que cada lista y cada botón flotante tenía que dejar la franja
 * libre a mano — y con la letra del sistema agrandada las cinco etiquetas se cortaban.
 *
 * Ahora la barra está en el flujo en ambas plataformas y reserva su hueco sola.
 */

/** Alto de la barra SIN el safe area, que se suma aparte. */
export const TAB_BAR_CONTENT_HEIGHT = 64;

/**
 * Espacio extra que las pantallas deben dejar libre por encima del safe area.
 *
 * Vale 0 desde que la barra está anclada. Se conserva exportado a propósito: lo consumen 8
 * pantallas y borrarlo obligaría a tocarlas todas para no ganar nada. Sumar 0 es correcto.
 * Si algún día vuelve una barra flotante, este es el único sitio que hay que cambiar.
 */
export const IOS_FLOATING_TAB_BAR_SPACE = Platform.OS === "ios" ? 0 : 0;
