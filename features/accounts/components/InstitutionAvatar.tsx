import { StyleSheet, Text, View } from "react-native";

import { findInstitution } from "../../../lib/account-institutions";
import { COLORS, FONT_FAMILY } from "../../../constants/theme";

type Props = {
  code: string | null | undefined;
  size?: number;
};

/**
 * Round avatar for an institution. Renders initials over the brand color
 * when the code is in the catalog; falls back to a neutral disc when null/unknown.
 *
 * Pure presentational, no queries. Safe to use inside lists.
 */
export function InstitutionAvatar({ code, size = 24 }: Props) {
  const inst = findInstitution(code);
  const bg = inst?.brandColor ?? COLORS.storm + "33";
  const fontSize = Math.max(9, Math.floor(size * 0.42));

  return (
    <View
      style={[
        styles.shell,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
      accessibilityLabel={inst ? `Institución ${inst.label}` : "Sin institución"}
    >
      {inst ? (
        <Text style={[styles.text, { fontSize }]} numberOfLines={1}>
          {inst.initials}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#FFFFFF",
    fontFamily: FONT_FAMILY.bodySemibold,
    letterSpacing: 0.3,
  },
});
