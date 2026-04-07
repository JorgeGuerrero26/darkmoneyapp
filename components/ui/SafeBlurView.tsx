import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";

type Props = {
  intensity?: number;
  tint?: "light" | "dark" | "default" | "systemMaterial";
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  fallbackColor?: string;
};

function defaultFallbackColor(tint: Props["tint"]): string {
  if (tint === "light") return "rgba(255,255,255,0.14)";
  return "rgba(0,0,0,0.32)";
}

export function SafeBlurView({
  intensity = 20,
  tint = "default",
  style,
  children,
  fallbackColor,
}: Props) {
  if (Platform.OS === "android") {
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
