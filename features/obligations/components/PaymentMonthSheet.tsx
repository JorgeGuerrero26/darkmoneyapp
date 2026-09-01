import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft, ChevronRight, Info } from "lucide-react-native";
import { format, parseISO, setMonth, setYear } from "date-fns";
import { es } from "date-fns/locale";

import { Button } from "../../../components/ui/Button";
import { InlineFormSheet } from "../../../components/ui/InlineFormSheet";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { monthKey } from "../lib/payment-plan";

type Props = {
  visible: boolean;
  /** "Mes del pago 3" — el título dice qué fila se está editando. */
  title: string;
  /** Izquierda de la tira de contexto: "Pago 3 · hoy en". */
  contextLabel: string;
  /** Derecha: "Nov 2026 · S/ 300.00". */
  contextValue: string;
  /** El mes de esa fila hoy, en ISO. Manda el día del mes que se conserva al cambiar. */
  value: string;
  /** El primer mes permitido: el siguiente al pago anterior. */
  min: string;
  /** El primer mes NO permitido, o `null` si no hay pago después. */
  maxExclusive: string | null;
  /** Meses que ya tiene otro pago: `yyyy-MM` → "pago 2". */
  taken: Record<string, string>;
  onPick: (month: string) => void;
  onBack: () => void;
};

const MONTHS_IN_YEAR = 12;

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Nov 2026" — para el botón y la tira de contexto. */
export function shortMonthLabel(isoDate: string) {
  const date = parseISO(isoDate);
  if (Number.isNaN(date.getTime())) return isoDate;
  return capitalize(format(date, "LLL yyyy", { locale: es }));
}

/**
 * Elegir el mes de un pago del plan a medida.
 *
 * **Hoja propia, no una cuadrícula que se despliega dentro del formulario.** Desplegada empujaba
 * "De ahí en adelante" y los totales fuera de vista, y dejaba la fila que se está editando pegada
 * al borde de arriba: con tres o cuatro filas ya no se sabía cuál se estaba cambiando. Es la misma
 * regla que ya siguen moneda, categoría y contacto.
 *
 * **El año va aparte.** Antes eran 24 celdas `MMM AAAA` en cinco columnas: había que leer
 * "Sep 2026" veinticuatro veces para encontrar uno. Con el año en un stepper arriba quedan doce
 * celdas con el mes solo, en tres columnas, y de paso desaparece el tope silencioso de dos años
 * —que se cortaba en Ago 2028 sin decir por qué ni qué hacer si el acuerdo llegaba a 2029—.
 *
 * **Los meses ocupados se ven ocupados.** Poner dos pagos en el mismo mes es el único error que
 * este control puede producir, y con todas las celdas iguales nada lo impedía. El que ya tiene un
 * pago lo dice —"pago 2"— y no se puede tocar.
 */
export function PaymentMonthSheet({
  visible,
  title,
  contextLabel,
  contextValue,
  value,
  min,
  maxExclusive,
  taken,
  onPick,
  onBack,
}: Props) {
  const [selected, setSelected] = useState(value);
  const [year, setYearState] = useState(() => parseISO(value).getFullYear());

  // Cada apertura parte del mes que la fila tiene hoy, no del que se miró la última vez.
  useEffect(() => {
    if (!visible) return;
    setSelected(value);
    const date = parseISO(value);
    if (!Number.isNaN(date.getTime())) setYearState(date.getFullYear());
  }, [value, visible]);

  const minKey = monthKey(min);
  const maxKey = maxExclusive ? monthKey(maxExclusive) : null;
  /** Hoy: hacia atrás no se programa nada. */
  const todayKey = useMemo(() => format(new Date(), "yyyy-MM"), []);

  const cells = useMemo(() => {
    const base = parseISO(value);
    return Array.from({ length: MONTHS_IN_YEAR }, (_, index) => {
      // Se conserva el día del mes que ya tenía la fila; `setMonth` recorta el 31 en los meses
      // que no lo tienen, así que un pago el 31 de enero cae al 28/29 de febrero y no al 3 de marzo.
      const date = setMonth(setYear(base, year), index);
      const iso = format(date, "yyyy-MM-dd");
      const key = monthKey(iso);
      const takenBy = taken[key] ?? null;
      const isPast = key < todayKey;
      const outOfOrder = key < minKey || (maxKey != null && key >= maxKey);
      return {
        iso,
        key,
        label: capitalize(format(date, "LLL", { locale: es })),
        takenBy,
        disabled: Boolean(takenBy) || isPast || outOfOrder,
        isPast,
      };
    });
  }, [maxKey, minKey, taken, todayKey, value, year]);

  const takenThisYear = cells.filter((cell) => cell.takenBy).map((cell) => cell.label);
  const hasPastThisYear = cells.some((cell) => cell.isPast);
  const legend = [
    takenThisYear.length > 0
      ? `${takenThisYear.join(" y ")} ya ${takenThisYear.length === 1 ? "tiene" : "tienen"} un pago.`
      : null,
    hasPastThisYear ? "Los meses anteriores a hoy no se pueden programar." : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Atrás se corta donde ya no hay nada elegible; adelante NO se corta: era el tope silencioso.
  const canGoBack = year > parseISO(min).getFullYear();
  const canGoForward = maxExclusive == null || year < parseISO(maxExclusive).getFullYear();

  return (
    <InlineFormSheet
      visible={visible}
      title={title}
      onBack={onBack}
      height="72%"
      footer={
        <Button
          label={`Usar ${shortMonthLabel(selected)}`}
          size="lg"
          onPress={() => onPick(selected)}
        />
      }
    >
      {/* Qué fila se está editando y en qué anda hoy: al abrirse en su propia hoja, el plan
          queda detrás y sin esto no habría forma de saberlo. */}
      <View style={styles.context}>
        <Text style={styles.contextLabel}>{contextLabel}</Text>
        <Text style={styles.contextValue}>{contextValue}</Text>
      </View>

      <View style={styles.yearRow}>
        <TouchableOpacity
          style={[styles.yearStep, !canGoBack && styles.yearStepOff]}
          onPress={() => setYearState((current) => current - 1)}
          disabled={!canGoBack}
          accessibilityRole="button"
          accessibilityLabel="Año anterior"
        >
          <ChevronLeft size={18} color={canGoBack ? COLORS.fog : COLORS.textDisabled} />
        </TouchableOpacity>
        <Text style={styles.yearValue}>{year}</Text>
        <TouchableOpacity
          style={[styles.yearStep, !canGoForward && styles.yearStepOff]}
          onPress={() => setYearState((current) => current + 1)}
          disabled={!canGoForward}
          accessibilityRole="button"
          accessibilityLabel="Año siguiente"
        >
          <ChevronRight size={18} color={canGoForward ? COLORS.fog : COLORS.textDisabled} />
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const isSelected = cell.key === monthKey(selected);
          return (
            <TouchableOpacity
              key={cell.key}
              style={[
                styles.cell,
                cell.disabled && styles.cellDisabled,
                /* Borde y etiqueta en hueso, no en menta: la menta significa plata que entra, y
                   esto solo dice "esto es lo que tocaste". */
                isSelected && !cell.disabled && styles.cellSelected,
              ]}
              onPress={() => setSelected(cell.iso)}
              disabled={cell.disabled}
              activeOpacity={0.72}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: cell.disabled }}
              accessibilityLabel={
                cell.takenBy
                  ? `${cell.label}, ocupado por el ${cell.takenBy}`
                  : cell.label
              }
            >
              <Text
                style={[
                  styles.cellText,
                  cell.disabled && styles.cellTextDisabled,
                  isSelected && !cell.disabled && styles.cellTextSelected,
                ]}
              >
                {cell.label}
              </Text>
              {cell.takenBy ? <Text style={styles.cellNote}>{cell.takenBy}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Una línea explicando los dos grises, en vez de dejar que el usuario deduzca por qué unos
          están apagados y otros no. */}
      {legend ? (
        <View style={styles.legend}>
          <Info size={13} color={COLORS.storm} />
          <Text style={styles.legendText}>{legend}</Text>
        </View>
      ) : null}
    </InlineFormSheet>
  );
}

const styles = StyleSheet.create({
  context: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.card,
  },
  contextLabel: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  contextValue: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },

  yearRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: SPACING.lg,
  },
  yearStep: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  yearStepOff: { opacity: 0.4 },
  yearValue: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  cell: {
    // 52px: el objetivo táctil de los chips de 38px se quedaba corto para una cuadrícula de doce.
    minHeight: 52,
    flexBasis: "31%",
    flexGrow: 1,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xs,
  },
  cellDisabled: { backgroundColor: "transparent", borderColor: "transparent" },
  cellSelected: { borderColor: COLORS.ink, borderWidth: 1.5 },
  cellText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  cellTextDisabled: { color: COLORS.textDisabled },
  cellTextSelected: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  cellNote: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, marginTop: 1 },

  legend: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  legendText: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    lineHeight: 18,
    color: COLORS.storm,
  },
});
