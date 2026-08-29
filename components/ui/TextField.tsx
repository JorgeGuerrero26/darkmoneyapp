import { forwardRef } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE } from "../../constants/theme";

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
        {...rest}
      />
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
  placeholderSlot: { position: "absolute" },
  placeholderSlotCentered: { bottom: 0, justifyContent: "center" },
  placeholder: { includeFontPadding: false },
});
