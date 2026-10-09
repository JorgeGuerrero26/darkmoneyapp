import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { DetailActionBar } from "../../../components/ui/DetailActionBar";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { TextField } from "../../../components/ui/TextField";
import { SearchableSelectSheet } from "../../../components/ui/SearchableSelectSheet";
import { DateTimeSheet } from "../../../components/ui/DateTimeSheet";
import { InlineFormSheet } from "../../../components/ui/InlineFormSheet";
import { Button } from "../../../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { detectionTone } from "../lib/presentation";
import { DuplicateDecision } from "./DetectedMovementCard";
import type { DetectedMovementReview } from "../hooks/useDetectedMovementReview";

type Props = {
  visible: boolean; onClose: () => void; review: DetectedMovementReview;
  position?: string; extras?: ReactNode; overlay?: ReactNode; list?: ReactNode;
};
type Selector = "account" | "destination" | "category" | "date" | "description" | null;

/** Presentación compartida; toda validación y escritura vive en el controlador. */
export function DetectedMovementReviewSheet({ visible, onClose, review: r, position, extras, overlay: extraOverlay, list }: Props) {
  const [selector, setSelector] = useState<Selector>(null);
  useEffect(() => { setSelector(null); }, [r.suggestion?.id, visible]);
  const source = r.activeAccounts.find((a) => a.id === r.accountId);
  const destination = r.activeAccounts.find((a) => a.id === r.destinationAccountId);
  const category = r.categories.find((c) => c.id === r.categoryId);
  const currency = source?.currencyCode ?? r.suggestion?.currencyCode ?? "PEN";
  const isTransfer = r.movementType === "transfer";
  const warning = r.missing[0] ?? (r.suggestion?.status === "needs_review" ? "Revisa los datos del comprobante antes de guardar" : null);
  const close = () => { if (!r.busy) onClose(); };
  return <BottomSheet visible={visible} onClose={close} title={list ? "Por revisar" : "Revisar movimiento"} entranceAnimation="springFade" snapHeight={0.92} scrollEnabled={!list}
    overlay={list ? undefined : selector === "description" ? (
      <InlineFormSheet visible entranceAnimation="springFade" title="Descripción" onBack={() => setSelector(null)} footer={<Button label="Listo" onPress={() => setSelector(null)} />}>
        <TextField value={r.description} onChangeText={r.setDescription} multiline style={styles.descriptionInput} accessibilityLabel="Descripción del movimiento" />
      </InlineFormSheet>
    ) : selector === "date" ? (
      <DateTimeSheet visible entranceAnimation="springFade" date={r.date} time={r.time} onBack={() => setSelector(null)} onConfirm={({ date, time }) => { r.setDate(date); if (time) r.setTime(time); setSelector(null); }} />
    ) : selector ? (
      <SearchableSelectSheet<number | null> inline entranceAnimation="springFade" visible title={selector === "category" ? "Categoría" : selector === "destination" ? "Cuenta destino" : isTransfer ? "Cuenta origen" : "Cuenta"}
        options={selector === "category" ? [{ value: null, label: "Sin categoría" }, ...r.categories.map((c) => ({ value: c.id, label: c.name }))] : (selector === "destination" ? r.destinationAccountsSorted : r.activeAccounts.filter((a) => a.currencyCode === r.suggestion?.currencyCode)).map((a) => ({ value: a.id, label: a.name, meta: a.currencyCode }))}
        value={selector === "category" ? r.categoryId : selector === "destination" ? r.destinationAccountId : r.accountId}
        onChange={(id) => { if (selector === "category") r.selectCategoryManually(id); else if (selector === "destination") r.setDestinationAccountId(id); else r.setAccountId(id); }}
        onClose={() => setSelector(null)} />
    ) : extraOverlay} contentStyle={styles.sheetContent}
    footer={list || !r.initialized ? undefined : <View>
      {warning ? <Text style={styles.footerWarning}>{warning}</Text> : null}
      {r.saveError ? <Text style={styles.footerError} accessibilityRole="alert">{r.saveError}</Text> : null}
      {r.duplicateCandidate ? <View style={styles.duplicateFooter}><DuplicateDecision candidate={r.duplicateCandidate} currency={currency} busy={r.busy} omitting={r.isDiscarding} onOpen={r.openDuplicate} onSame={() => { void r.useExistingDuplicate(); }} onSaveAnyway={() => { void r.submit(true); }} onDiscard={() => { void r.discard(); }} /></View> : <DetailActionBar primarySide="right"
        secondary={{ label: r.isDiscarding ? "Omitiendo…" : "Omitir", accessibilityLabel: "Omitir detección", icon: X, disabled: r.busy, loading: r.isDiscarding, onPress: () => { void r.discard(); } }}
        primary={{ label: r.busy && !r.isDiscarding ? "Guardando…" : r.saveError ? "Reintentar" : "Guardar", accessibilityLabel: r.saveError ? "Reintentar la última acción" : "Guardar movimiento revisado", icon: Check, loading: r.isSaving, disabled: r.busy, onPress: () => { if (r.saveError) void r.retry(); else void r.submit(false); } }} />}
    </View>}
  >
    {list ?? (!r.initialized ? <View style={styles.loading}><ActivityIndicator color={COLORS.storm} /><Text style={styles.meta}>Cargando la detección…</Text></View> : <View pointerEvents={r.busy ? "none" : "auto"} style={styles.content}>
      <Text style={styles.meta}>{position ? `${position} · ` : ""}{r.displayAppLabel}</Text>
      <View style={styles.segment}>{(["expense", "income", "transfer"] as const).map((type) => <Pressable key={type} style={[styles.option, r.movementType === type && styles.optionActive]} accessibilityRole="button" accessibilityState={{ selected: r.movementType === type }} onPress={() => r.switchMovementType(type)} disabled={r.busy}><Text style={[styles.optionLabel, r.movementType === type && { color: detectionTone(type) }]}>{type === "expense" ? "Gasto" : type === "income" ? "Ingreso" : "Transferencia"}</Text></Pressable>)}</View>
      <View style={styles.amountGroup}>
        <View style={styles.amountRow}><Text style={[styles.amountPrefix, { color: detectionTone(r.movementType) }]}>{r.movementType === "income" ? "+" : r.movementType === "expense" ? "−" : ""}{currency === "PEN" ? "S/" : currency === "USD" ? "US$" : currency}</Text><TextField value={r.amount} onChangeText={r.setAmount} keyboardType="decimal-pad" editable={!r.busy} style={[styles.amountInput, { color: detectionTone(r.movementType) }]} accessibilityLabel="Importe del movimiento" /></View>
        <Text style={styles.currency}>{currency}</Text>
      </View>
      <View style={styles.fields}>
        <DetailFieldRow label="Descripción" value={r.description || "Escribir descripción"} onPress={() => setSelector("description")} />
        <DetailFieldRow label="Fecha y hora" value={`${r.date.split("-").reverse().join("/")} · ${r.time}`} onPress={() => setSelector("date")} />
        <DetailFieldRow label={isTransfer ? "Desde" : "Cuenta"} value={source?.name ?? "Elegir cuenta"} onPress={() => setSelector("account")} />
        {isTransfer ? <>
          <DetailFieldRow label="Hacia" value={destination?.name ?? "Elige el destino"} onPress={() => setSelector("destination")} last={!r.transferCurrenciesDiffer} />
          {r.transferCurrenciesDiffer ? <>
            <View style={styles.inputRow}><Text style={styles.fieldLabel}>Llega ({destination?.currencyCode})</Text><TextField value={r.destinationAmount} onChangeText={r.setDestinationAmount} editable={!r.busy} keyboardType="decimal-pad" placeholder="0.00" style={styles.rowInput} accessibilityLabel="Importe que llega al destino" /></View>
            <View style={styles.inputRow}><Text style={styles.fieldLabel}>Tipo de cambio</Text><TextField value={r.transferFxRate} onChangeText={r.setTransferFxRate} editable={!r.busy} keyboardType="decimal-pad" placeholder="0.00" style={styles.rowInput} accessibilityLabel="Tipo de cambio" /></View>
            <Text style={styles.meta}>1 {currency} = {r.transferFxRate || "…"} {destination?.currencyCode}</Text>
          </> : null}
        </> : <DetailFieldRow label="Categoría" value={category?.name ?? "Sin categoría"} onPress={() => setSelector("category")} last />}
      </View>
      <Text style={styles.meta}>Detectado: «{r.suggestion?.description}»</Text>
      {extras}
    </View>)}
  </BottomSheet>;
}

const styles = StyleSheet.create({
  sheetContent: { padding: 0 },
  content: { gap: SPACING.lg, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg },
  loading: { padding: SPACING.xl, gap: SPACING.md },
  meta: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20 },
  segment: { flexDirection: "row", padding: SPACING.xs, borderRadius: RADIUS.md, backgroundColor: SURFACE.input },
  option: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.sm },
  optionActive: { backgroundColor: SURFACE.card },
  optionLabel: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  amountGroup: { alignItems: "center", gap: SPACING.sm, paddingVertical: SPACING.md },
  amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xs },
  amountPrefix: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.amountInput },
  amountInput: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.amountInput, minWidth: 110, maxWidth: 220 },
  currency: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog, backgroundColor: SURFACE.input, borderRadius: RADIUS.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  fields: { paddingHorizontal: SPACING.md, borderRadius: RADIUS.xl, backgroundColor: SURFACE.subtle },
  inputRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: SPACING.md },
  fieldLabel: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm },
  rowInput: { minWidth: 90, textAlign: "right", fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  descriptionInput: { minHeight: 100, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  footerWarning: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.warning },
  footerError: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.sm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.danger },
  duplicateFooter: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
});
