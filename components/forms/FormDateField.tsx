import type { LucideIcon } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../../constants/theme";

export type FormDateFieldProps = {
  /** Título corto (también se usa en el modal del calendario) */
  title: string;
  /** Texto de ayuda debajo del título */
  description: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  /** Icono a la izquierda (Lucide) */
  Icon: LucideIcon;
  accentColor: string;
};

/**
 * Campo de fecha para formularios: borde de acento, icono, título, ayuda y selector unificado.
 */
export function FormDateField({
  title,
  description,
  value,
  onChange,
  required = false,
  optional = false,
  placeholder,
  minimumDate,
  maximumDate,
  Icon,
  accentColor,
}: FormDateFieldProps) {
  const modalLabel = `${title}${required ? "" : " (opcional)"}`;

  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      <View style={styles.cardTop}>
        <View style={[styles.iconWrap, { borderColor: accentColor + "55", backgroundColor: accentColor + "14" }]}>
          <Icon size={20} color={accentColor} strokeWidth={2} />
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title}>
            {title}
            {required ? <Text style={styles.asterisk}> *</Text> : null}
          </Text>
          <Text style={styles.description}>{description}</Text>
        </View>
      </View>
      <DatePickerInput
        hideLabel
        label={modalLabel}
        value={value}
        onChange={onChange}
        placeholder={placeholder ?? "Elegir fecha"}
        optional={optional}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        variant="formRow"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  title: {
    fontSize: FONT_SIZE.sm,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.ink,
  },
  asterisk: {
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  description: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    lineHeight: 18,
  },
});
