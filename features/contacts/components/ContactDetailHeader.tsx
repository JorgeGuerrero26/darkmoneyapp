import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";
import { TYPE_LABELS } from "../lib/contactsLabels";
import type { CounterpartyOverview } from "../../../types/domain";

type Props = {
  contact: CounterpartyOverview;
  lastActivityAt: string | null;
};

export function ContactDetailHeader({ contact, lastActivityAt }: Props) {
  return (
    <View style={styles.hero}>
      <Text style={styles.heroName}>{contact.name}</Text>
      <Text style={styles.heroType}>{TYPE_LABELS[contact.type]} · {contact.isArchived ? "Archivado" : "Activo"}</Text>
      {lastActivityAt ? (
        <Text style={styles.heroMeta}>
          Última actividad · {format(new Date(lastActivityAt), "d MMM yyyy", { locale: es })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xl, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  heroName: { fontSize: FONT_SIZE.xxl, fontFamily: FONT_FAMILY.heading, color: COLORS.ink, textAlign: "center" },
  heroType: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.body, color: COLORS.storm },
  heroMeta: { fontSize: FONT_SIZE.xs, fontFamily: FONT_FAMILY.body, color: COLORS.storm },
});
