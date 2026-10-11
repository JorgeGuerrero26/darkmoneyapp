import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { AlertCircle, Ellipsis, RotateCw } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { humanizeError } from "../../lib/errors";

export type FieldFeedback = { kind: "missing" | "invalid"; message: string } | null;
export type FormFieldRule = {
  value: unknown;
  missing?: string | null;
  invalid?: string | null;
  open?: () => void;
  reveal?: () => void;
};
type ContextValue = {
  feedback: (id?: string) => FieldFeedback;
  register: (id: string, open: () => void) => () => void;
  submit: () => void;
  busy: boolean;
  failure: string | null;
};
const Context = createContext<ContextValue | null>(null);

/** Rules belong to the form; this controller only coordinates feedback and focus. */
export function FormFeedbackProvider({ fields, onSubmit, visible = true, busy = false, children }: {
  fields: Record<string, FormFieldRule>; onSubmit: () => void | Promise<void>;
  visible?: boolean; busy?: boolean; children: ReactNode;
}) {
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const savingRef = useRef(false);
  const waiting = useRef<{ id: string; value: unknown } | null>(null);
  const focusPending = useRef<string | null>(null);
  const targets = useRef(new Map<string, () => void>());
  const latest = useRef({ fields, onSubmit, busy, visible });
  latest.current = { fields, onSubmit, busy, visible };
  function openField(id: string, rule: FormFieldRule) {
    rule.reveal?.();
    if (rule.open) rule.open();
    else if (targets.current.has(id)) targets.current.get(id)?.();
    else focusPending.current = id;
  }
  function submit() {
    const state = latest.current;
    if (savingRef.current || state.busy || !state.visible) return;
    setFailure(null);
    setAttempted(true);
    const entries = Object.entries(state.fields);
    const missing = entries.find(([, rule]) => rule.missing);
    if (missing) {
      const [id, rule] = missing;
      waiting.current = { id, value: rule.value };
      openField(id, rule);
      return;
    }
    waiting.current = null;
    const invalid = entries.find(([, rule]) => rule.invalid);
    if (invalid) {
      const [id, rule] = invalid;
      openField(id, rule);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    // Call synchronously so the form's own duplicate guard remains immediate.
    try {
      Promise.resolve(state.onSubmit()).catch((error: unknown) => {
        setFailure(humanizeError(error));
      }).finally(() => { savingRef.current = false; setSaving(false); });
    } catch (error) {
      setFailure(humanizeError(error)); savingRef.current = false; setSaving(false);
    }
  }
  useEffect(() => {
    if (!visible) { waiting.current = null; focusPending.current = null; setAttempted(false); setFailure(null); return; }
    const pending = waiting.current;
    // Continue only the explicit Save flow. Ordinary edits never submit a form.
    if (pending && !busy && !Object.is(fields[pending.id]?.value, pending.value) && !fields[pending.id]?.missing) {
      waiting.current = null;
      submit();
    }
  });
  return <Context.Provider value={{
    submit,
    busy: busy || saving,
    failure,
    feedback: (id) => {
      const rule = id ? fields[id] : undefined;
      if (rule?.missing) return { kind: "missing", message: rule.missing };
      if (attempted && rule?.invalid) return { kind: "invalid", message: rule.invalid };
      return null;
    },
    register: (id, open) => {
      targets.current.set(id, open);
      if (focusPending.current === id && latest.current.visible) { focusPending.current = null; open(); }
      return () => { if (targets.current.get(id) === open) targets.current.delete(id); };
    },
  }}>{children}</Context.Provider>;
}

export function useFormField(id?: string, open?: () => void): FieldFeedback {
  const context = useContext(Context);
  const register = context?.register;
  const callback = useRef(open);
  callback.current = open;
  useEffect(() => {
    if (!id || !register) return;
    return register(id, () => callback.current?.());
  }, [id, register]);
  return context?.feedback(id) ?? null;
}

export function FieldFeedbackMessage({ feedback }: { feedback: FieldFeedback }) {
  return feedback ? <Text accessibilityRole={feedback.kind === "invalid" ? "alert" : undefined}
    style={[styles.message, { color: feedback.kind === "missing" ? COLORS.warning : COLORS.dangerStrong }]}>{feedback.message}</Text> : null;
}

export function FormSaveFailure({ error }: { error?: string | null }) {
  if (!error) return null;
  return <View style={styles.failure} accessibilityRole="alert">
    <AlertCircle size={18} color={COLORS.dangerStrong} />
    <View style={styles.copy}><Text style={styles.failureTitle}>No se pudo guardar</Text>
      <Text style={styles.failureBody}>{error.replace(/\.?\s*Tus cambios siguen aqu[ií]\.?$/i, "")}. Tus cambios siguen aquí.</Text>
    </View>
  </View>;
}

export function FormSubmitBar({ onSubmit, label = "Guardar", loading = false, disabled = false, error, onMore, children }: {
  onSubmit: () => void; label?: string; loading?: boolean; disabled?: boolean;
  error?: string | null; onMore?: () => void; children?: ReactNode;
}) {
  const context = useContext(Context);
  const pending = loading || Boolean(context?.busy);
  const saveError = error || context?.failure;
  return <View style={styles.bar}>
    <FormSaveFailure error={saveError} />
    <View style={styles.actions}>{children}
      {onMore ? <Pressable onPress={onMore} disabled={pending || disabled} accessibilityRole="button" accessibilityLabel="Más opciones" style={styles.more}><Ellipsis color={COLORS.ink} size={20} /></Pressable> : null}
      <Pressable onPress={context?.submit ?? onSubmit} disabled={pending || disabled} accessibilityRole="button" accessibilityLabel={saveError ? "Reintentar" : label}
        accessibilityState={{ disabled: pending || disabled, busy: pending }} style={[styles.save, (pending || disabled) && styles.disabled]}>
        {pending ? <ActivityIndicator size="small" color={COLORS.actionText} /> : saveError ? <RotateCw size={18} color={COLORS.actionText} /> : null}
        <Text style={styles.saveLabel}>{pending ? "Guardando…" : saveError ? "Reintentar" : label}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  message: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, paddingVertical: SPACING.xs },
  bar: { gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SURFACE.separator },
  actions: { flexDirection: "row", gap: SPACING.sm, alignItems: "center" },
  more: { width: 50, height: 50, borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE.input },
  save: { flex: 1, minHeight: 50, borderRadius: RADIUS.md, backgroundColor: COLORS.action, flexDirection: "row", gap: SPACING.sm, alignItems: "center", justifyContent: "center", paddingHorizontal: SPACING.md },
  saveLabel: { color: COLORS.actionText, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  disabled: { opacity: 0.45 },
  failure: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.lg, backgroundColor: SURFACE.subtle },
  copy: { flex: 1, gap: SPACING.xs },
  failureTitle: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  failureBody: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20 },
});
