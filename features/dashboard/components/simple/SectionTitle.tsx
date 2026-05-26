import { Text } from "react-native";

import { dashboardSimpleStyles } from "./styles";

export function SectionTitle({ children }: { children: string }) {
  return <Text style={dashboardSimpleStyles.sectionTitle}>{children}</Text>;
}
