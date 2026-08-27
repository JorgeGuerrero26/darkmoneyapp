import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

import { SURFACE } from "../../constants/theme";

type Props = {
  /**
   * Difuminar de verdad. **Por defecto NO.**
   *
   * Rediseño fase 3: el vidrio esmerilado sale de todas partes menos dos sitios — la barra
   * inferior y el fondo de las hojas —, los únicos donde algo pasa realmente por detrás.
   * En el resto era ruido: cuesta legibilidad al sol (el fondo cambia bajo el texto), cuesta
   * batería en listas largas y sugiere que la superficie es un efecto y no un dato.
   *
   * El defecto se invirtió a propósito en vez de editar los 11 call sites que lo pierden:
   * así el cambio es una sola línea aquí y dos opt-ins, no once ediciones de layout.
   *
   * Además el modo plano NO es nuevo ni arriesgado: en Android este componente ya caía a
   * color liso desde siempre, y ese es el look que el usuario ya venía validando.
   */
  blur?: boolean;
  intensity?: number;
  // Los materiales "system*" son los mismos que usan las apps nativas de iOS (el look glass).
  // En Android no aplican: allí este componente cae a un color plano.
  tint?: "light" | "dark" | "default" | "systemMaterial" | "systemChromeMaterialDark";
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  fallbackColor?: string;
};

function defaultFallbackColor(tint: Props["tint"]): string {
  if (tint === "light") return "rgba(244,241,236,0.14)";
  return SURFACE.scrim;
}

export function SafeBlurView({
  blur = false,
  intensity = 20,
  tint = "default",
  style,
  children,
  fallbackColor,
}: Props) {
  if (!blur || Platform.OS === "android") {
    return (
      <View style={[style, { backgroundColor: fallbackColor ?? defaultFallbackColor(tint) }]}>
        {children}
      </View>
    );
  }

  return (
    <BlurView intensity={intensity} tint={tint} style={style}>
      {children}
    </BlurView>
  );
}
