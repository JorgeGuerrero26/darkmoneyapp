import { forwardRef, useId } from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

/**
 * Los teclados de iOS que **no traen tecla de retorno**.
 *
 * `returnKeyType="done"` no hace nada en ellos: no hay dónde pintarlo. Sin una tecla de cerrar,
 * la única salida es tocar fuera del campo, y dentro de un formulario "fuera del campo" es un
 * sitio concreto que hay que adivinar —por eso se reportaba que a veces el teclado trae botón
 * para cerrarlo y a veces no: depende del tipo de teclado, no del formulario—.
 *
 * En Android la tecla de volver siempre lo cierra, así que la barra sobra.
 */
const KEYBOARDS_WITHOUT_RETURN_KEY = new Set(["decimal-pad", "number-pad", "numeric", "phone-pad"]);

type Props = TextInputProps & {
  /**
   * Estilo del contenedor. El `flex` que venga en `style` se sube aquí solo: el campo real
   * queda dentro y el contenedor es el que tiene que estirarse en la fila.
   */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Un campo de texto cuyo placeholder se lee.
 *
 * En iOS, cuando el placeholder no le cabe al campo, `UITextField` **aprieta el kerning** hasta
 * que entre en vez de recortarlo: las letras se pegan y la frase deja de parecerse a la
 * tipografía del resto de la app. Y mide el ancho antes de que el `flex` de la fila le dé el
 * suyo, así que llega a apretar frases que sí cabían — "Buscar movimientos..." en una barra que
 * ocupa la pantalla entera (reportado el 2026-08-29).
 *
 * Aquí el placeholder es un `Text` encima del campo: respeta la fuente y, si de verdad no cabe,
 * corta con puntos suspensivos, que es honesto y legible. Al nativo no se le pasa nunca, así que
 * no hay forma de que se pinten los dos.
 *
 * Hereda del `style` del campo la fuente, el tamaño y el relleno, para quedar exactamente donde
 * empezará a escribirse.
 */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { style, containerStyle, placeholder, placeholderTextColor, accessibilityLabel, ...rest },
  ref,
) {
  // `useId` trae dos puntos en React 18 y el nativeID los admite mal: se limpian.
  const accessoryId = `kb-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const needsDoneBar =
    Platform.OS === "ios"
    && rest.keyboardType != null
    && KEYBOARDS_WITHOUT_RETURN_KEY.has(rest.keyboardType)
    && rest.editable !== false;

  const flat = StyleSheet.flatten(style) ?? {};
  const { flex, ...inputStyle } = flat;

  const showPlaceholder = Boolean(placeholder) && !rest.value;

  const left = flat.paddingLeft ?? flat.paddingHorizontal ?? flat.padding ?? 0;
  const right = flat.paddingRight ?? flat.paddingHorizontal ?? flat.padding ?? 0;
  // Multilínea: el cursor arranca arriba, no centrado.
  const top = rest.multiline ? (flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0) : 0;

  return (
    <View style={[flex === undefined ? null : { flex }, containerStyle]}>
      <TextInput
        ref={ref}
        style={inputStyle}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        inputAccessoryViewID={needsDoneBar ? accessoryId : undefined}
        {...rest}
      />
      {needsDoneBar ? (
        <InputAccessoryView nativeID={accessoryId}>
          <View style={styles.accessory}>
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel="Cerrar el teclado"
            >
              <Text style={styles.accessoryDone}>Listo</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}
      {showPlaceholder ? (
        <View
          style={[
            styles.placeholderSlot,
            { left, right, top },
            rest.multiline ? null : styles.placeholderSlotCentered,
          ]}
          pointerEvents="none"
        >
          <Text
            style={[
              styles.placeholder,
              {
                fontFamily: flat.fontFamily ?? FONT_FAMILY.body,
                fontSize: flat.fontSize ?? FONT_SIZE.md,
                fontWeight: flat.fontWeight,
                letterSpacing: flat.letterSpacing,
                textAlign: flat.textAlign,
                color: placeholderTextColor ?? COLORS.storm,
              },
            ]}
            numberOfLines={1}
          >
            {placeholder}
          </Text>
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  accessory: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: SURFACE.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SURFACE.separator,
  },
  accessoryDone: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.sm,
  },
  placeholderSlot: { position: "absolute" },
  placeholderSlotCentered: { bottom: 0, justifyContent: "center" },
  placeholder: { includeFontPadding: false },
});
