import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import type { ReactNode } from "react";

import { COLORS } from "../../constants/theme";

type Props = {
  topInset?: number;
  header: ReactNode;
  toolbar?: ReactNode;
  activeFilters?: ReactNode;
  context?: ReactNode;
  summary?: ReactNode;
  bulkActions?: ReactNode;
  list: ReactNode;
  fab?: ReactNode;
  overlays?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function ResourceModuleTemplate({
  topInset = 0,
  header,
  toolbar,
  activeFilters,
  context,
  summary,
  bulkActions,
  list,
  fab,
  overlays,
  style,
}: Props) {
  return (
    <View collapsable={false} style={[styles.screen, { paddingTop: topInset }, style]}>
      {header}
      {toolbar}
      {activeFilters}
      {context}
      {summary}
      {bulkActions}
      {list}
      {fab}
      {overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});
