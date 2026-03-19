import { useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { format, parseISO, isValid } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react-native";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  label: string;
  value: string; // "YYYY-MM-DD" or ""
  onChange: (value: string) => void; // emits "YYYY-MM-DD"
  placeholder?: string;
  optional?: boolean;
  minimumDate?: Date;
  maximumDate?: Date;
};

function parseDate(value: string): Date {
  if (!value) return new Date();
  const d = parseISO(value);
  return isValid(d) ? d : new Date();
}

export function DatePickerInput({
  label,
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  optional = false,
  minimumDate,
  maximumDate,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tempDate, setTempDate] = useState<Date>(parseDate(value));

  const displayText = value
    ? format(parseDate(value), "d MMM yyyy", { locale: es })
    : "";

  function handleOpen() {
    setTempDate(parseDate(value));
    setOpen(true);
  }

  function handleChange(_: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") {
      setOpen(false);
      if (date) onChange(format(date, "yyyy-MM-dd"));
    } else {
      if (date) setTempDate(date);
    }
  }

  function handleConfirm() {
    onChange(format(tempDate, "yyyy-MM-dd"));
    setOpen(false);
  }

  function handleClear() {
    onChange("");
    setOpen(false);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity style={styles.input} onPress={handleOpen} activeOpacity={0.7}>
        <Text style={[styles.inputText, !value && styles.placeholder]}>
          {displayText || placeholder}
        </Text>
        <CalendarDays size={16} color={COLORS.textMuted} />
      </TouchableOpacity>

      {/* Android: inline picker shown directly */}
      {Platform.OS === "android" && open && (
        <DateTimePicker
          value={tempDate}
          mode="date"
          display="default"
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}

      {/* iOS: modal with spinner + confirm */}
      {Platform.OS === "ios" && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
            <View style={styles.sheet} onStartShouldSetResponder={() => true}>
              <View style={styles.sheetHeader}>
                {optional ? (
                  <TouchableOpacity onPress={handleClear}>
                    <Text style={styles.clearBtn}>Borrar</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 60 }} />
                )}
                <Text style={styles.sheetTitle}>{label}</Text>
                <TouchableOpacity onPress={handleConfirm}>
                  <Text style={styles.confirmBtn}>Listo</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={tempDate}
                mode="date"
                display="spinner"
                onChange={handleChange}
                minimumDate={minimumDate}
                maximumDate={maximumDate}
                locale="es-ES"
                style={styles.picker}
              />
            </View>
          </Pressable>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: SPACING.xs },
  label: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.bgInput,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  inputText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
  },
  placeholder: {
    color: COLORS.textDisabled,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.bgCard,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingBottom: SPACING.xl,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.text,
  },
  confirmBtn: {
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.primary,
    width: 60,
    textAlign: "right",
  },
  clearBtn: {
    fontSize: FONT_SIZE.md,
    color: COLORS.expense,
    width: 60,
  },
  picker: {
    height: 200,
  },
});
