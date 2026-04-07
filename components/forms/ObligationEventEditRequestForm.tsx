import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AlertCircle, Info } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import { useCreateObligationEventEditRequestMutation } from "../../services/queries/workspace-data";
import type { ObligationEventSummary, SharedObligationSummary } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { CurrencyInput } from "../ui/CurrencyInput";
import { DatePickerInput } from "../ui/DatePickerInput";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  obligation: SharedObligationSummary;
  event: ObligationEventSummary | null;
};

export function ObligationEventEditRequestForm({
  visible,
  onClose,
  onSuccess,
  obligation,
  event,
}: Props) {
  const { profile } = useAuth();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const createRequest = useCreateObligationEventEditRequestMutation();
  const scrollRef = useRef<ScrollView>(null);
  const amountRef = useRef<TextInput>(null);

  const [amount, setAmount] = useState("");
  const [eventDate, setEventDate] = useState(event?.eventDate ?? "");
  const [installmentNo, setInstallmentNo] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [amountError, setAmountError] = useState("");
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!visible || !event) return;
    setAmount(String(event.amount));
    setEventDate(event.eventDate);
    setInstallmentNo(event.installmentNo != null ? String(event.installmentNo) : "");
    setDescription(event.description ?? "");
    setNotes(event.notes ?? "");
    setAmountError("");
    setSubmitError("");
  }, [event, visible]);

  function handleClose() {
    onClose();
  }

  async function handleSubmit() {
    if (!event || !profile?.id) return;
    setAmountError("");
    setSubmitError("");

    const parsedAmount = Number.parseFloat(amount.replace(",", "."));
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      haptics.error();
      setAmountError("Ingresa un monto valido");
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      setTimeout(() => amountRef.current?.focus(), 180);
      return;
    }

    try {
      await createRequest.mutateAsync({
        obligationId: obligation.id,
        eventId: event.id,
        currencyCode: obligation.currencyCode,
        eventType: event.eventType,
        ownerUserId: obligation.share.ownerUserId,
        viewerUserId: profile.id,
        viewerDisplayName: profile.fullName ?? null,
        obligationTitle: obligation.title,
        currentAmount: event.amount,
        currentEventDate: event.eventDate,
        currentInstallmentNo: event.installmentNo ?? null,
        currentDescription: event.description ?? null,
        currentNotes: event.notes ?? null,
        proposedAmount: parsedAmount,
        proposedEventDate: eventDate,
        proposedInstallmentNo: event.eventType === "payment" && installmentNo.trim()
          ? Number.parseInt(installmentNo.trim(), 10)
          : null,
        proposedDescription: description.trim() || null,
        proposedNotes: notes.trim() || null,
      });
      showToast("Solicitud de edicion enviada", "success");
      haptics.success();
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      haptics.error();
      setSubmitError(humanizeError(error));
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  }

  const ownerName = obligation.share.ownerDisplayName?.trim() || "el propietario";
  const isPayment = event?.eventType === "payment";

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title="Solicitar edicion"
      scrollRef={scrollRef}
    >
      {submitError ? (
        <View style={styles.errorBanner}>
          <AlertCircle size={15} color={COLORS.danger} strokeWidth={2} />
          <Text style={styles.errorText}>{submitError}</Text>
        </View>
      ) : null}

      <View style={styles.infoBox}>
        <View style={styles.infoHeader}>
          <Info size={14} color={COLORS.primary} strokeWidth={2} />
          <Text style={styles.infoTitle}>Como funciona</Text>
        </View>
        <Text style={styles.infoText}>
          Enviaremos esta propuesta a {ownerName}. Si la acepta, el evento y los movimientos
          relacionados se actualizaran para ambos.
        </Text>
      </View>

      <CurrencyInput
        ref={amountRef}
        label="Monto propuesto *"
        value={amount}
        onChangeText={(value) => {
          setAmount(value);
          setAmountError("");
        }}
        currencyCode={obligation.currencyCode}
        error={amountError}
      />

      <DatePickerInput
        label="Fecha propuesta *"
        value={eventDate}
        onChange={setEventDate}
      />

      {isPayment ? (
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Cuota propuesta</Text>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              value={installmentNo}
              onChangeText={setInstallmentNo}
              keyboardType="number-pad"
              placeholder="Ej. 4"
              placeholderTextColor={COLORS.textDisabled}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Descripcion propuesta</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={description}
            onChangeText={setDescription}
            placeholder="Descripcion"
            placeholderTextColor={COLORS.textDisabled}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Notas propuestas</Text>
        <View style={[styles.inputWrap, styles.textAreaWrap]}>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder="Notas"
            placeholderTextColor={COLORS.textDisabled}
          />
        </View>
      </View>

      <Button
        label="Enviar solicitud"
        onPress={handleSubmit}
        loading={createRequest.isPending}
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    backgroundColor: COLORS.danger + "18",
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
  },
  errorText: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.danger,
    fontFamily: FONT_FAMILY.body,
  },
  infoBox: {
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: COLORS.primary + "33",
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary + "12",
    padding: SPACING.sm,
  },
  infoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  infoTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  infoText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    lineHeight: 18,
    fontFamily: FONT_FAMILY.body,
  },
  field: {
    gap: SPACING.xs,
  },
  fieldLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: RADIUS.md,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: SPACING.sm,
    minHeight: 48,
    justifyContent: "center",
  },
  input: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    paddingVertical: SPACING.xs,
  },
  textAreaWrap: {
    minHeight: 96,
    alignItems: "stretch",
  },
  textArea: {
    minHeight: 76,
    textAlignVertical: "top",
  },
});
