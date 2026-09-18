import { Pressable, StyleSheet, Text, View } from "react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";

const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

type Props = {
  visible: boolean;
  title: string;
  value: number | null;
  onChange: (day: number) => void;
  onClose: () => void;
};

/**
 * Elegir un día del mes que se repite.
 *
 * No es un selector de fecha: un date picker implica mes y año, que aquí no aplican — "el 25 de
 * cada mes", no "el 25 de octubre". Y no es una rueda: la cuadrícula deja ver los 31 días de
 * golpe y se toca una vez, mientras que una rueda obliga a recorrerlos.
 *
 * La regla del mes corto se dice **aquí y una vez**, como texto fijo. Un aviso por instancia
 * —"febrero no tiene 31"— sería ruido repetido para una regla constante que además ya usan los
 * bancos.
 */
export function DayOfMonthSheet({ visible, title, value, onChange, onClose }: Props) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View style={styles.grid}>
        {DAYS.map((day) => {
          const selected = value === day;
          return (
            <Pressable
              key={day}
              onPress={() => onChange(day)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Día ${day}`}
              style={[styles.cell, selected && styles.cellSelected]}
            >
              <Text
                style={[styles.cellLabel, selected && styles.cellLabelSelected]}
                maxFontSizeMultiplier={1.3}
              >
                {day}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint} maxFontSizeMultiplier={1.4}>
        Se repite este día cada mes. Si el mes no lo tiene, cae en el último día.
      </Text>

      <Button label="Listo" size="lg" onPress={onClose} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.xs,
    justifyContent: "flex-start",
  },
  cell: {
    width: 44,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: SURFACE.inputBorder,
  },
  cellSelected: {
    backgroundColor: COLORS.action,
    borderColor: COLORS.action,
  },
  cellLabel: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
  },
  cellLabelSelected: {
    color: COLORS.actionText,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  hint: {
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 17,
  },
});
