import { StyleSheet, Text, View } from "react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../components/ui/Card";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../../constants/theme";
import { TYPE_LABELS } from "../lib/contactsLabels";
import type { CounterpartyOverview } from "../../../types/domain";

type Props = {
  contact: CounterpartyOverview;
  lastActivityAt: string | null;
};

export function ContactDetailHeader({ contact, lastActivityAt }: Props) {
  return (
    <Card style={styles.heroCard}>
      <Text style={styles.heroName}>{contact.name}</Text>
      <Text style={styles.heroType}>{TYPE_LABELS[contact.type] ?? contact.type}</Text>
      {contact.isArchived ? <Text style={styles.archivedBadge}>Archivado</Text> : null}
      {lastActivityAt ? (
        <Text style={styles.heroMeta}>
          Última actividad · {format(new Date(lastActivityAt), "d MMM yyyy", { locale: es })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  heroCard: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.xl },
  heroName: { fontSize: FONT_SIZE.xxl, fontWeight: FONT_WEIGHT.bold, color: COLORS.text },
  heroType: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  heroMeta: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  archivedBadge: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: RADIUS.full,
  },
});
