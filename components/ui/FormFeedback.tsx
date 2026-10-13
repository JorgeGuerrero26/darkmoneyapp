import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from "react-native";
import type { RefObject } from "react";
import { AlertCircle, Ellipsis, RotateCw } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import { humanizeError } from "../../lib/errors";
import { formErrorFields } from "../../lib/form-errors";
import { Button } from "./Button";

export type FieldFeedback = { kind: "missing" | "invalid"; message: string } | null;
export type FormFieldRule = {
  value: unknown;
  missing?: string | null;
  invalid?: string | null;
  open?: () => void;
  reveal?: () => void;
  autoContinue?: boolean;
  serverKeys?: readonly string[];
};
type ContextValue = {
  feedback: (id?: string) => FieldFeedback;
  register: (id: string, open: () => void, reveal: () => void, autoContinue: boolean) => () => void;
  submit: () => void;
  runAction: (action: () => void | Promise<void>) => void;
  busy: boolean;
  failure: string | null;
};
const Context = createContext<ContextValue | null>(null);
const ScrollContext = createContext<{ scroll: RefObject<ScrollView | null>; offset: RefObject<number> } | null>(null);
export function FormFieldScrollScope({ scroll, offset, children }: { scroll: RefObject<ScrollView | null>; offset: RefObject<number>; children: ReactNode }) {
  return <ScrollContext.Provider value={{ scroll, offset }}>{children}</ScrollContext.Provider>;
}

export function FormScrollView({ children, onScroll, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} ref={scroll} scrollEventThrottle={16}
    onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}>
    <FormFieldScrollScope scroll={scroll} offset={offset}>{children}</FormFieldScrollScope>
  </ScrollView>;
}

export function useFormSubmit() { return useContext(Context)?.submit; }

/** Rules belong to the form; this controller only coordinates feedback and focus. */
export function FormFeedbackProvider({ fields, onSubmit, visible = true, busy = false, resetKey, children }: {
  fields: Record<string, FormFieldRule>; onSubmit: () => void | Promise<void>;
  visible?: boolean; busy?: boolean; resetKey?: string | number; children: ReactNode;
}) {
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, { value: unknown; message: string }>>({});
  const savingRef = useRef(false);
  const retryAction = useRef<(() => void | Promise<void>) | undefined>(undefined);
  const generation = useRef(0);
  const waiting = useRef<{ id: string; value: unknown } | null>(null);
  const focusPending = useRef<{ id: string; mode: "open" | "reveal" } | null>(null);
  const targets = useRef(new Map<string, { open: () => void; reveal: () => void; autoContinue: boolean }>());
  const latest = useRef({ fields, onSubmit, busy, visible });
  latest.current = { fields, onSubmit, busy, visible };
  function openField(id: string, rule: FormFieldRule) {
    rule.reveal?.();
    if (rule.open) rule.open();
    else if (targets.current.has(id)) { targets.current.get(id)?.reveal(); targets.current.get(id)?.open(); }
    else focusPending.current = { id, mode: "open" };
  }
  function submit(action?: () => void | Promise<void>) {
    const state = latest.current;
    if (savingRef.current || state.busy || !state.visible) return;
    setFailure(null);
    retryAction.current = undefined;
    setServerErrors({});
    setAttempted(true);
    const entries = action ? [] : Object.entries(state.fields);
    const missing = entries.find(([, rule]) => rule.missing);
    if (missing) {
      const [id, rule] = missing;
      // Selecting an option can finish Save. Typing into an empty input cannot.
      waiting.current = (rule.autoContinue ?? (Boolean(rule.open) || targets.current.get(id)?.autoContinue)) ? { id, value: rule.value } : null;
      openField(id, rule);
      return;
    }
    waiting.current = null;
    const invalid = entries.find(([, rule]) => rule.invalid);
    if (invalid) {
      const [id, rule] = invalid;
      rule.reveal?.();
      if (targets.current.has(id)) targets.current.get(id)?.reveal();
      else focusPending.current = { id, mode: "reveal" };
      return;
    }
    savingRef.current = true;
    setSaving(true);
    const submissionGeneration = generation.current;
    // Call synchronously so the form's own duplicate guard remains immediate.
    try {
      const operation = (action ?? state.onSubmit)();
      if (operation && typeof operation.then === "function") {
        operation.catch((error: unknown) => {
          if (latest.current.visible && generation.current === submissionGeneration) reportFailure(error, state.fields, action);
        }).finally(() => { savingRef.current = false; setSaving(false); });
      } else { savingRef.current = false; setSaving(false); }
    } catch (error) {
      reportFailure(error, state.fields, action); savingRef.current = false; setSaving(false);
    }
  }
  function reportFailure(error: unknown, submittedFields: Record<string, FormFieldRule>, action?: () => void | Promise<void>) {
    const mapped = formErrorFields(error, submittedFields);
    if (!Object.keys(mapped).length) { retryAction.current = action; setFailure(humanizeError(error)); return; }
    const entries = Object.entries(mapped).filter(([id]) => Object.is(submittedFields[id].value, latest.current.fields[id]?.value));
    if (!entries.length) return;
    setServerErrors(Object.fromEntries(entries.map(([id, message]) => [id, { value: latest.current.fields[id].value, message }])));
    const [id] = entries[0];
    latest.current.fields[id].reveal?.();
    if (targets.current.has(id)) targets.current.get(id)?.reveal();
    else focusPending.current = { id, mode: "reveal" };
  }
  useEffect(() => {
    generation.current += 1;
    waiting.current = null;
    focusPending.current = null;
    setAttempted(false);
    setFailure(null);
    retryAction.current = undefined;
    setServerErrors({});
  }, [visible, resetKey]);
  const submitRef = useRef(submit);
  submitRef.current = submit;
  useEffect(() => {
    if (!visible) return;
    const pending = waiting.current;
    // Continue only the explicit Save flow. Ordinary edits never submit a form.
    if (pending && !busy && !Object.is(fields[pending.id]?.value, pending.value) && !fields[pending.id]?.missing) {
      waiting.current = null;
      submitRef.current();
    }
  }, [visible, busy, fields]);
  return <Context.Provider value={{
    submit: () => submit(retryAction.current),
    runAction: (action) => submit(action),
    busy: busy || saving,
    failure,
    feedback: (id) => {
      const rule = id ? fields[id] : undefined;
      if (rule?.missing) return { kind: "missing", message: rule.missing };
      if (attempted && rule?.invalid) return { kind: "invalid", message: rule.invalid };
      const server = id ? serverErrors[id] : undefined;
      if (server && Object.is(server.value, rule?.value)) return { kind: "invalid", message: server.message };
      return null;
    },
    register: (id, open, reveal, autoContinue) => {
      targets.current.set(id, { open, reveal, autoContinue });
      if (focusPending.current?.id === id && latest.current.visible) {
        const pending = focusPending.current;
        focusPending.current = null;
        if (pending.mode === "open") open(); else reveal();
      }
      return () => { if (targets.current.get(id)?.open === open) targets.current.delete(id); };
    },
  }}>{children}</Context.Provider>;
}

export function useFormField(id?: string, open?: () => void, view?: RefObject<View | null>, autoContinue = false): FieldFeedback {
  const context = useContext(Context);
  const scope = useContext(ScrollContext);
  const register = context?.register;
  const callback = useRef(open);
  const hasOpen = Boolean(open);
  callback.current = open;
  useEffect(() => {
    if (!id || !register || !hasOpen) return;
    return register(id, () => callback.current?.(), () => {
      const scroll = scope?.scroll.current;
      if (!scroll || !view?.current) return;
      view.current.measureInWindow((_x, y, _width, height) => {
        const viewport = scroll.getNativeScrollRef() as View | null;
        viewport?.measureInWindow((_scrollX, scrollY, _scrollWidth, scrollHeight) => {
          if (y < scrollY || y + height > scrollY + scrollHeight) {
            scroll.scrollTo({ y: Math.max(0, (scope?.offset.current ?? 0) + y - scrollY - SPACING.md), animated: true });
          }
        });
      });
    }, autoContinue);
  }, [id, register, scope, view, hasOpen, autoContinue]);
  return context?.feedback(id) ?? null;
}

export function FieldFeedbackMessage({ feedback }: { feedback: FieldFeedback }) {
  return feedback ? <Text accessibilityRole={feedback.kind === "invalid" ? "alert" : undefined}
    style={[styles.message, { color: feedback.kind === "missing" ? COLORS.warning : COLORS.dangerStrong }]}>{feedback.message}</Text> : null;
}

/** An inline collection of choices is also a field, with one local status. */
export function FormFieldGroup({ fieldId, label, children }: { fieldId: string; label: string; children: ReactNode }) {
  const view = useRef<View>(null);
  const feedback = useFormField(fieldId, () => {}, view, true);
  return <View ref={view} collapsable={false} style={feedback?.kind === "invalid" ? styles.invalidGroup : undefined}>
    <Text style={[styles.message, { color: feedback?.kind === "invalid" ? COLORS.dangerStrong : COLORS.storm }]}>{label}</Text>
    <FieldFeedbackMessage feedback={feedback} />
    {children}
  </View>;
}

/** Secondary decisions share busy/error handling, without validating the primary action's fields. */
export function FormActionButton({ onAction, ...props }: Omit<ComponentProps<typeof Button>, "onPress"> & { onAction: () => void | Promise<void> }) {
  const context = useContext(Context);
  return <Button {...props} disabled={props.disabled || context?.busy} onPress={() => {
    if (context) context.runAction(onAction); else void onAction();
  }} />;
}

export function FormSaveFailure({ error, title = "No se pudo guardar" }: { error?: string | null; title?: string }) {
  if (!error) return null;
  return <View style={styles.failure} accessibilityRole="alert">
    <AlertCircle size={18} color={COLORS.dangerStrong} />
    <View style={styles.copy}><Text style={styles.failureTitle}>{title}</Text>
      <Text style={styles.failureBody}>{error.replace(/\.?\s*Tus cambios siguen aqu[ií]\.?$/i, "").replace(/[.\s]+$/, "")}. Tus cambios siguen aquí.</Text>
    </View>
  </View>;
}

export function FormSubmitBar({ onSubmit, label = "Guardar", loading = false, loadingLabel = "Guardando…", failureTitle, disabled = false, error, onMore, children }: {
  onSubmit: () => void; label?: string; loading?: boolean; disabled?: boolean;
  error?: string | null; onMore?: () => void; children?: ReactNode;
  loadingLabel?: string; failureTitle?: string;
}) {
  const context = useContext(Context);
  const pending = loading || Boolean(context?.busy);
  const saveError = error || context?.failure;
  return <View style={styles.bar}>
    <FormSaveFailure error={saveError} title={failureTitle} />
    <View style={styles.actions}>{children}
      {onMore ? <Pressable onPress={onMore} disabled={pending || disabled} accessibilityRole="button" accessibilityLabel="Más opciones" style={styles.more}><Ellipsis color={COLORS.ink} size={20} /></Pressable> : null}
      <Pressable onPress={context?.submit ?? onSubmit} disabled={pending || disabled} accessibilityRole="button" accessibilityLabel={saveError ? "Reintentar" : label}
        accessibilityState={{ disabled: pending || disabled, busy: pending }} style={[styles.save, (pending || disabled) && styles.disabled]}>
        {pending ? <ActivityIndicator size="small" color={COLORS.actionText} /> : saveError ? <RotateCw size={18} color={COLORS.actionText} /> : null}
        <Text style={styles.saveLabel}>{pending ? loadingLabel : saveError ? "Reintentar" : label}</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  invalidGroup: { backgroundColor: SURFACE.dangerBg, borderRadius: RADIUS.md, padding: SPACING.sm },
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
