import { StyleSheet, Text, View } from "react-native";
import { ArrowUpRight, X } from "lucide-react-native";
import { BottomSheet } from "./BottomSheet";
import { DetailActionBar } from "./DetailActionBar";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

export function ProBadge() {
  return <View style={styles.badge}><Text style={styles.badgeText}>PRO</Text></View>;
}

type Props = {
  visible: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onViewPro: () => void;
};

/** Aviso de acceso compartido por configuración y las sugerencias detectadas. */
export function ProFeatureSheet({ visible, title, description, onClose, onViewPro }: Props) {
  return <BottomSheet
    visible={visible} onClose={onClose} title="Disponible con PRO"
    entranceAnimation="springFade" snapHeight={0.48}
    footer={<DetailActionBar primarySide="right"
      secondary={{ label: "Ahora no", accessibilityLabel: "Cerrar aviso PRO", icon: X, onPress: onClose }}
      primary={{ label: "Ver PRO", accessibilityLabel: "Ver planes DarkMoney PRO", icon: ArrowUpRight, onPress: onViewPro }}
    />}
  >
    <View style={styles.content}>
      <ProBadge />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  </BottomSheet>;
}

const styles = StyleSheet.create({
  content: { gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md },
  badge: { alignSelf: "flex-start", paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: RADIUS.sm, backgroundColor: COLORS.proMuted },
  badgeText: { color: COLORS.pro, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.xs },
  title: { color: COLORS.ink, fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl },
  description: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, lineHeight: 24 },
});
