import { Text, TouchableOpacity, View } from "react-native";

import { dashboardSimpleStyles as subStyles } from "./styles";

type ModeToggleProps = {
  mode: string;
  setMode: (m: "simple" | "advanced") => void;
  isPro: boolean;
};

export function ModeToggle({ mode, setMode, isPro }: ModeToggleProps) {
  return (
    <View style={subStyles.toggleRow}>
      <TouchableOpacity
        style={[subStyles.toggleBtn, mode === "simple" && subStyles.toggleBtnActive]}
        onPress={() => setMode("simple")}
      >
        <Text style={[subStyles.toggleText, mode === "simple" && subStyles.toggleTextActive]}>Simple</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[subStyles.toggleBtn, mode === "advanced" && subStyles.toggleBtnActive]}
        onPress={() => setMode("advanced")}
      >
        <Text style={[subStyles.toggleText, mode === "advanced" && subStyles.toggleTextActive]}>Avanzado</Text>
        {!isPro && <Text style={subStyles.proBadge}> PRO</Text>}
      </TouchableOpacity>
    </View>
  );
}
