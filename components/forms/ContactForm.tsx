import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../hooks/useToast";
import { useHaptics } from "../../hooks/useHaptics";
import { humanizeError } from "../../lib/errors";
import {
  useCreateCounterpartyMutation,
  useUpdateCounterpartyMutation,
  type CounterpartyFormInput,
} from "../../services/queries/workspace-data";
import type { CounterpartyOverview } from "../../types/domain";
import { BottomSheet } from "../ui/BottomSheet";
import { FormOptionRow } from "../ui/FormOptionRow";
import { SearchableSelectSheet } from "../ui/SearchableSelectSheet";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { sortByLabel } from "../../lib/sort-locale";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

const TYPE_OPTIONS: { value: CounterpartyFormInput["type"]; label: string }[] = sortByLabel([
  { value: "person", label: "Persona" },
  { value: "company", label: "Empresa" },
  { value: "merchant", label: "Comercio" },
  { value: "service", label: "Servicio" },
  { value: "bank", label: "Banco" },
  { value: "other", label: "Otro" },
]);

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess?: (id?: number) => void;
  editContact?: CounterpartyOverview;
};

export function ContactForm({ visible, onClose, onSuccess, editContact }: Props) {
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const haptics = useHaptics();
  const createMutation = useCreateCounterpartyMutation(activeWorkspaceId);
  const updateMutation = useUpdateCounterpartyMutation(activeWorkspaceId);

  const isEditing = Boolean(editContact);

  const [typeOpen, setTypeOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<CounterpartyFormInput["type"]>("person");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [nameError, setNameError] = useState("");
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (editContact) {
      setName(editContact.name);
      setType(editContact.type);
      setPhone(editContact.phone ?? "");
      setEmail(editContact.email ?? "");
      setDocumentNumber(editContact.documentNumber ?? "");
      setNotes(editContact.notes ?? "");
    } else {
      setName("");
      setType("person");
      setPhone("");
      setEmail("");
      setDocumentNumber("");
      setNotes("");
    }
    setNameError("");
  }, [visible, editContact?.id, editContact?.name, editContact?.type, editContact?.phone, editContact?.email, editContact?.documentNumber, editContact?.notes]);

  function hasUnsavedChanges() {
    if (!isEditing || !editContact) {
      return Boolean(name.trim() || phone.trim() || email.trim() || documentNumber.trim() || notes.trim());
    }
    return (
      name.trim() !== (editContact.name ?? "").trim() ||
      type !== editContact.type ||
      phone.trim() !== (editContact.phone ?? "").trim() ||
      email.trim() !== (editContact.email ?? "").trim() ||
      documentNumber.trim() !== (editContact.documentNumber ?? "").trim() ||
      notes.trim() !== (editContact.notes ?? "").trim()
    );
  }

  function handleClose() {
    if (hasUnsavedChanges()) {
      setShowDiscardDialog(true);
    } else {
      onClose();
    }
  }

  const submittingRef = useRef(false);

  async function handleSubmit() {
    if (submittingRef.current) return; // guard anti-doble-tap: evita duplicados
    setNameError("");
    if (!name.trim()) { haptics.error(); setNameError("El nombre es obligatorio"); return; }

    const input: CounterpartyFormInput = {
      name: name.trim(),
      type,
      phone: phone.trim() || null,
      email: email.trim() || null,
      documentNumber: documentNumber.trim() || null,
      notes: notes.trim() || null,
    };

    submittingRef.current = true;
    try {
      if (isEditing && editContact) {
        await updateMutation.mutateAsync({ id: editContact.id, input });
        showToast("Contacto actualizado", "warning");
        haptics.success();
        onSuccess?.();
      } else {
        const result = await createMutation.mutateAsync(input);
        showToast("Contacto creado", "success");
        haptics.success();
        onSuccess?.(result.id);
      }
      onClose();
    } catch (err: unknown) {
      haptics.error();
      showToast(humanizeError(err), "error");
    } finally {
      submittingRef.current = false;
    }
  }

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <>
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      title={isEditing ? "Editar contacto" : "Nuevo contacto"}
      snapHeight={0.85}
      // Dentro del sheet: iOS solo presenta un Modal a la vez y como hermano no aparecía.
      overlay={
        <>
        <SearchableSelectSheet
          inline
          visible={typeOpen}
          title="Tipo de contacto"
          options={TYPE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          value={type}
          onChange={setType}
          onClose={() => setTypeOpen(false)}
        />
        <ConfirmDialog
          inline
          visible={showDiscardDialog}
          title="¿Descartar cambios?"
          body="Perderás los cambios que no hayas guardado."
          confirmLabel="Descartar"
          cancelLabel="Continuar editando"
          destructive
          onConfirm={() => { setShowDiscardDialog(false); onClose(); }}
          onCancel={() => setShowDiscardDialog(false)}
        />
        </>
      }
    >

      {/* Los seis tipos eran cápsulas con emoji que se cortaban por el borde. El emoji sale:
          no distingue nada que la palabra no diga, y con seis seguidos tampoco decora. */}
      {/* Name */}
      <View>
        <Text style={styles.label}>Nombre *</Text>
        <TextInput
          style={[styles.textInput, nameError ? styles.inputError : null]}
          value={name}
          onChangeText={(t) => { setName(t); setNameError(""); }}
          placeholder="Nombre completo o razón social"
          placeholderTextColor={COLORS.textDisabled}
        />
        {nameError ? <Text style={styles.fieldError}>{nameError}</Text> : null}
      </View>

      <FormOptionRow
        label="Tipo"
        value={TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? null}
        onPress={() => setTypeOpen(true)}
      />
      {/* Phone */}
      <View>
        <Text style={styles.label}>Teléfono (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={phone}
          onChangeText={setPhone}
          placeholder="+51 999 999 999"
          placeholderTextColor={COLORS.textDisabled}
          keyboardType="phone-pad"
        />
      </View>

      {/* Email */}
      <View>
        <Text style={styles.label}>Email (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={email}
          onChangeText={setEmail}
          placeholder="correo@ejemplo.com"
          placeholderTextColor={COLORS.textDisabled}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      {/* Document */}
      <View>
        <Text style={styles.label}>DNI / RUC (opcional)</Text>
        <TextInput
          style={styles.textInput}
          value={documentNumber}
          onChangeText={setDocumentNumber}
          placeholder="Número de documento"
          placeholderTextColor={COLORS.textDisabled}
          keyboardType="number-pad"
        />
      </View>

      {/* Notes */}
      <View>
        <Text style={styles.label}>Notas (opcional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Información adicional"
          placeholderTextColor={COLORS.textDisabled}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

      <Button
        label={isEditing ? "Guardar cambios" : "Crear contacto"}
        onPress={handleSubmit}
        loading={isLoading}
        style={styles.submitBtn}
      />
    </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: SPACING.xs,
  },
  textInput: {
    backgroundColor: SURFACE.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  textArea: { minHeight: 72 },
  inputError: { borderColor: COLORS.danger },
  fieldError: { fontSize: FONT_SIZE.xs, color: COLORS.danger, marginTop: 4 },
  submitBtn: { marginTop: SPACING.sm },
});
