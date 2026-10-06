import { useEffect, useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MoreVertical } from "lucide-react-native";
import { BottomSheet } from "./BottomSheet";
import { DetailFieldRow, type DetailFieldRowProps } from "./DetailFieldRow";
import { DetailActionBar } from "./DetailActionBar";
import { Button } from "./Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";

export type ResourceDetailSheetAction = { key: string; label: string; onPress: () => void; disabled?: boolean };
type Props = {
  visible: boolean;
  onClose: () => void;
  title: string;
  name: string;
  caption?: string;
  value?: string;
  fields: DetailFieldRowProps[];
  actions?: ResourceDetailSheetAction[];
  primary?: ComponentProps<typeof DetailActionBar>["primary"];
  secondary?: ComponentProps<typeof DetailActionBar>["secondary"];
};

/** Reading first, editing from the fixed footer. Secondary actions stay in the same native sheet. */
export function ResourceDetailSheet({ visible, onClose, title, name, caption, value, fields, actions = [], primary, secondary }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { if (!visible) setMenuOpen(false); }, [visible]);
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} snapHeight={0.82} entranceAnimation="springFade"
      headerAction={actions.length > 0 ? (
        <Pressable onPress={() => setMenuOpen((open) => !open)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Más acciones" accessibilityState={{ expanded: menuOpen }}>
          <MoreVertical size={22} color={COLORS.storm} />
        </Pressable>
      ) : undefined}
      footer={<DetailActionBar primary={primary} secondary={secondary} primarySide={secondary ? "right" : "left"} />}
      contentStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.name}>{name}</Text>
        {value ? <Text style={styles.value}>{value}</Text> : null}
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      {menuOpen ? <View style={styles.menu}>
        <Text style={styles.caption}>Más acciones</Text>
        {actions.map((action) => <Button key={action.key} label={action.label} variant="ghost" disabled={action.disabled} onPress={() => { setMenuOpen(false); action.onPress(); }} />)}
      </View> : <View>{fields.map((field, index) => <DetailFieldRow key={field.label} {...field} last={index === fields.length - 1} />)}</View>}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxl },
  hero: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  name: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxl, color: COLORS.ink, textAlign: "center" },
  value: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xxxl, color: COLORS.ink, textAlign: "center" },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center" },
  menu: { gap: SPACING.sm, paddingVertical: SPACING.lg },
});
