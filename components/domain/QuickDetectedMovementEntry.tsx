import { useEffect, useMemo, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { DatePickerInput } from "../ui/DatePickerInput";
import { SmartSuggestion } from "../ui/SmartSuggestion";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import { useToast } from "../../hooks/useToast";
import {
  findPossibleDuplicateMovement,
  useNotificationDetectionSettingsQuery,
  useDetectedMovementSuggestionQuery,
  useMarkDetectedMovementSuggestionMutation,
} from "../../services/queries/notification-detection";
import { getFinancialAppByKey, resolveFinancialAppByPackage } from "../../lib/notification-detection-apps";
import {
  useCreateCategoryMutation,
  useCreateMovementMutation,
  useDashboardAnalyticsQuery,
  useMarkNotificationReadMutation,
  usePersistLearningFeedbackMutation,
  useUserEntitlementQuery,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { useMovementPatternsQuery } from "../../services/queries/movement-patterns";
import { buildPatternMaps, suggestCategoryFromDescription } from "../../lib/movement-patterns";
import { normalizeAnalyticsText } from "../../services/analytics/movement-features";
import { useMovementCategoryAiSuggestion } from "../../hooks/useMovementCategoryAiSuggestion";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING, SURFACE } from "../../constants/theme";
import type { CategorySummary } from "../../types/domain";

function textSimilarity(left: string, right: string): number {
  const leftTokens = new Set(normalizeAnalyticsText(left).split(" ").filter((t) => t.length >= 3));
  const rightTokens = new Set(normalizeAnalyticsText(right).split(" ").filter((t) => t.length >= 3));
  const all = new Set([...leftTokens, ...rightTokens]);
  if (all.size === 0) return 0;
  let overlap = 0;
  for (const t of all) if (leftTokens.has(t) && rightTokens.has(t)) overlap++;
  return overlap / all.size;
}

type Props = {
  visible: boolean;
  suggestionId: number | null;
  notificationId?: number | null;
  onClose: () => void;
};

type CategorySuggestionState = {
  categoryId: number | null;
  categoryName: string;
  newCategoryName?: string | null;
  confidence: number;
  detail: string;
  reasons: string[];
  source?: "deepseek" | "local";
};

type CategoryFeedbackIntent = {
  kind: "accepted_category_suggestion" | "manual_category_change";
  categoryId: number;
  categoryName?: string | null;
  confidence?: number | null;
  reasons?: string[];
  source?: "deepseek" | "local";
};

function localDate(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function QuickDetectedMovementEntry({ visible, suggestionId, notificationId, onClose }: Props) {
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();
  const suggestionQuery = useDetectedMovementSuggestionQuery(suggestionId);
  const suggestion = suggestionQuery.data;
  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const settingsQuery = useNotificationDetectionSettingsQuery(profile?.id, activeWorkspaceId);
  const settings = settingsQuery.data ?? [];
  const createMovement = useCreateMovementMutation(activeWorkspaceId);
  const createCategory = useCreateCategoryMutation(activeWorkspaceId);
  const markSuggestion = useMarkDetectedMovementSuggestionMutation();
  const markNotificationRead = useMarkNotificationReadMutation(profile?.id ?? null);
  const entitlementQuery = useUserEntitlementQuery(profile?.id ?? null, profile?.email ?? null);
  const persistLearningFeedback = usePersistLearningFeedbackMutation(activeWorkspaceId, profile?.id);
  const { data: patternMovements } = useMovementPatternsQuery(activeWorkspaceId);
  const { data: dashboardAnalytics } = useDashboardAnalyticsQuery(activeWorkspaceId, profile?.id);
  const patternMaps = useMemo(
    () => (patternMovements ? buildPatternMaps(patternMovements) : null),
    [patternMovements],
  );

  const activeAccounts = useMemo(
    () => (snapshot?.accounts ?? []).filter((account) => !account.isArchived),
    [snapshot?.accounts],
  );
  const [movementType, setMovementType] = useState<"expense" | "income">("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const [categoryFeedbackIntent, setCategoryFeedbackIntent] = useState<CategoryFeedbackIntent | null>(null);

  const categories = useMemo(() => {
    const kind = movementType === "income" ? "income" : "expense";
    return (snapshot?.categories ?? []).filter((category) =>
      category.isActive && (category.kind === kind || category.kind === "both"),
    );
  }, [movementType, snapshot?.categories]);

  const localCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (categoryId !== null || !description.trim()) return null;

    // Learned: text similarity against accepted feedback (same as MovementForm)
    const accepted = (dashboardAnalytics?.learningFeedback ?? []).filter(
      (fb) => fb.acceptedCategoryId != null &&
        (fb.feedbackKind === "accepted_category_suggestion" || fb.feedbackKind === "manual_category_change"),
    );
    const normalized = normalizeAnalyticsText(description);
    if (normalized && accepted.length > 0) {
      const best = accepted
        .map((fb) => ({ fb, sim: textSimilarity(normalized, fb.normalizedDescription ?? "") }))
        .filter((item) => item.sim >= 0.58)
        .sort((a, b) => b.sim - a.sim || new Date(b.fb.createdAt).getTime() - new Date(a.fb.createdAt).getTime())[0];
      if (best?.fb.acceptedCategoryId) {
        const cat = categories.find((c) => c.id === best.fb.acceptedCategoryId);
        if (cat) return {
          categoryId: cat.id,
          categoryName: cat.name,
          confidence: Math.max(0.68, Math.min(0.98, 0.62 + best.sim * 0.28)),
          detail: `${Math.round(Math.max(0.68, Math.min(0.98, 0.62 + best.sim * 0.28)) * 100)}% · aprendido de tus correcciones`,
          reasons: ["aprendido de tus correcciones"],
          source: "local",
        };
      }
    }

    // Pattern-based: word frequency against recent movements
    if (patternMaps) {
      const suggestedId = suggestCategoryFromDescription(description, patternMaps);
      if (suggestedId !== null) {
        const cat = categories.find((c) => c.id === suggestedId);
        if (cat) return {
          categoryId: cat.id,
          categoryName: cat.name,
          confidence: 0.62,
          detail: "patrón repetido en tu historial",
          reasons: ["patrón repetido en tu historial"],
          source: "local",
        };
      }
    }

    return null;
  }, [categoryId, description, dashboardAnalytics?.learningFeedback, categories, patternMaps]);

  const aiCategoryInput = useMemo(() => {
    if (!activeWorkspaceId || categoryId !== null || !description.trim() || !categories.length) return null;
    return {
      workspaceId: activeWorkspaceId,
      surface: "notification_form" as const,
      movementType,
      amount: Number(amount.replace(",", ".")) || suggestion?.amount || null,
      currencyCode: suggestion?.currencyCode ?? "PEN",
      description: description.trim(),
      occurredAt: date ? new Date(`${date}T12:00:00`).toISOString() : suggestion?.occurredAt ?? null,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
      })),
      localSuggestion: localCategorySuggestion
        ? {
          categoryId: localCategorySuggestion.categoryId,
          categoryName: localCategorySuggestion.categoryName,
          confidence: localCategorySuggestion.confidence,
          reasons: localCategorySuggestion.reasons,
        }
        : null,
    };
  }, [activeWorkspaceId, amount, categories, categoryId, date, description, localCategorySuggestion, movementType, suggestion]);
  const { recommendation: aiCategoryRecommendation } = useMovementCategoryAiSuggestion({
    enabled: Boolean(visible && entitlementQuery.data?.proAccessEnabled && aiCategoryInput),
    input: aiCategoryInput,
  });
  const aiCategorySuggestion = useMemo<CategorySuggestionState | null>(() => {
    if (!aiCategoryRecommendation) return null;
    const detail = `IA Pro · ${Math.round(aiCategoryRecommendation.confidence * 100)}% · ${aiCategoryRecommendation.reasons.join(" · ")}`;
    if (aiCategoryRecommendation.type === "existing_category" && aiCategoryRecommendation.categoryId) {
      return {
        categoryId: aiCategoryRecommendation.categoryId,
        categoryName: aiCategoryRecommendation.categoryName ?? "Categoría sugerida",
        confidence: aiCategoryRecommendation.confidence,
        detail,
        reasons: aiCategoryRecommendation.reasons,
        source: "deepseek",
      };
    }
    if (aiCategoryRecommendation.type === "new_category" && aiCategoryRecommendation.newCategoryName) {
      return {
        categoryId: null,
        categoryName: `Crear categoría "${aiCategoryRecommendation.newCategoryName}"`,
        newCategoryName: aiCategoryRecommendation.newCategoryName,
        confidence: aiCategoryRecommendation.confidence,
        detail,
        reasons: aiCategoryRecommendation.reasons,
        source: "deepseek",
      };
    }
    return null;
  }, [aiCategoryRecommendation]);
  const categorySuggestion = aiCategorySuggestion ?? localCategorySuggestion;

  useEffect(() => {
    if (!suggestion || !visible) return;
    const defaultAccountId = settings.find(
      (setting) => setting.financialAppKey === suggestion.financialAppKey && setting.enabled,
    )?.defaultAccountId;
    const defaultAccount = activeAccounts.find((account) => account.id === defaultAccountId) ?? activeAccounts[0];
    setMovementType(suggestion.movementType === "income" ? "income" : "expense");
    setAmount(String(suggestion.amount));
    setDescription(suggestion.description);
    setDate(localDate(suggestion.occurredAt));
    setCategoryId(null);
    setAccountId(defaultAccount?.id ?? null);
    setCategoryFeedbackIntent(null);
  }, [activeAccounts, settings, suggestion, visible]);

  function selectCategoryManually(id: number | null) {
    setCategoryId(id);
    if (id == null) {
      setCategoryFeedbackIntent(null);
      return;
    }
    const category = categories.find((item) => item.id === id);
    setCategoryFeedbackIntent({
      kind: "manual_category_change",
      categoryId: id,
      categoryName: category?.name ?? null,
      confidence: null,
      reasons: ["elegida manualmente en el formulario"],
    });
  }

  async function applyCategorySuggestion(suggestionState: CategorySuggestionState) {
    let nextCategoryId = suggestionState.categoryId;
    let nextCategoryName = suggestionState.categoryName;

    if (nextCategoryId == null && suggestionState.newCategoryName) {
      const normalizedNewName = normalizeAnalyticsText(suggestionState.newCategoryName);
      const existing = categories.find((category) => normalizeAnalyticsText(category.name) === normalizedNewName);
      if (existing) {
        nextCategoryId = existing.id;
        nextCategoryName = existing.name;
      } else {
        const created = await createCategory.mutateAsync({
          name: suggestionState.newCategoryName,
          kind: movementType === "income" ? "income" : "expense",
        });
        nextCategoryId = created.id;
        nextCategoryName = suggestionState.newCategoryName;
        showToast("Categoría creada", "success");
      }
    }

    if (nextCategoryId == null) return;
    setCategoryId(nextCategoryId);
    setCategoryFeedbackIntent({
      kind: "accepted_category_suggestion",
      categoryId: nextCategoryId,
      categoryName: nextCategoryName,
      confidence: suggestionState.confidence,
      reasons: suggestionState.reasons,
      source: suggestionState.source,
    });
  }

  async function discard() {
    if (!suggestion) return;
    setIsDiscarding(true);
    try {
      await markSuggestion.mutateAsync({ suggestionId: suggestion.id, status: "discarded" });
      if (notificationId) markNotificationRead.mutate(notificationId);
      showToast("Sugerencia descartada", "info");
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo descartar", "error");
    } finally {
      setIsDiscarding(false);
    }
  }

  async function submit(force = false) {
    if (!suggestion || !activeWorkspaceId) return;
    const parsedAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showToast("Ingresa un monto válido", "error");
      return;
    }
    if (!accountId) {
      showToast("Selecciona una cuenta", "error");
      return;
    }

    const occurredAt = new Date(`${date}T12:00:00`).toISOString();
    if (!force) {
      setCheckingDuplicate(true);
      try {
        const duplicate = await findPossibleDuplicateMovement({
          workspaceId: activeWorkspaceId,
          movementType,
          accountId,
          amount: parsedAmount,
          occurredAt,
          description,
        });
        if (duplicate) {
          Alert.alert(
            "Puede que este movimiento ya exista",
            "Encontramos un movimiento con la misma fecha, cuenta, monto y descripción.",
            [
              { text: "Revisar", style: "cancel" },
              { text: "Registrar de todas formas", onPress: () => void submit(true) },
            ],
          );
          return;
        }
      } finally {
        setCheckingDuplicate(false);
      }
    }

    try {
      const created = await createMovement.mutateAsync({
        movementType,
        status: "posted",
        occurredAt,
        description: description.trim() || suggestion.description,
        notes: null,
        sourceAccountId: movementType === "expense" ? accountId : null,
        sourceAmount: movementType === "expense" ? parsedAmount : null,
        destinationAccountId: movementType === "income" ? accountId : null,
        destinationAmount: movementType === "income" ? parsedAmount : null,
        fxRate: null,
        categoryId,
        counterpartyId: null,
        metadata: {
          source: "notification_detection",
          suggestionId: suggestion.id,
          financialAppKey: suggestion.financialAppKey,
          confidence: suggestion.confidence,
        },
      });
      await markSuggestion.mutateAsync({ suggestionId: suggestion.id, status: "registered", movementId: created.id });
      if (categoryId != null && categoryFeedbackIntent) {
        void persistLearningFeedback.mutateAsync({
          movementId: created.id,
          feedbackKind: categoryFeedbackIntent.kind,
          normalizedDescription: normalizeAnalyticsText(description.trim() || suggestion.description) || null,
          previousCategoryId: null,
          acceptedCategoryId: categoryId,
          confidence: categoryFeedbackIntent.confidence ?? (categoryFeedbackIntent.kind === "accepted_category_suggestion" ? 0.7 : null),
          source: categoryFeedbackIntent.source === "deepseek" ? "notification-form-ai" : "notification-form",
          metadata: {
            categoryName: categoryFeedbackIntent.categoryName ?? null,
            reasons: categoryFeedbackIntent.reasons ?? [],
            aiProvider: categoryFeedbackIntent.source === "deepseek" ? "deepseek" : null,
            suggestionId: suggestion.id,
            financialAppKey: suggestion.financialAppKey,
          },
        });
      }
      if (notificationId) markNotificationRead.mutate(notificationId);
      showToast("Movimiento guardado", "success");
      onClose();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "No se pudo guardar el movimiento", "error");
    }
  }

  const displayAppLabel = suggestion
    ? (getFinancialAppByKey(suggestion.financialAppKey)?.label
        ?? resolveFinancialAppByPackage(suggestion.packageName)?.label
        ?? suggestion.appLabel)
    : "Movimiento detectado";


  if (suggestion?.status === "registered") {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Movimiento detectado" snapHeight={0.52}>
        <View style={styles.resolvedContainer}>
          <Text style={styles.resolvedTitle}>Este movimiento ya fue registrado</Text>
          <Text style={styles.resolvedMeta}>{displayAppLabel} · {suggestion.currencyCode === "PEN" ? "S/" : "USD"} {suggestion.amount.toFixed(2)}</Text>
          <View style={styles.actions}>
            {suggestion.movementId ? (
              <Button label="Ver movimiento" onPress={() => { onClose(); router.push(`/movement/${suggestion.movementId}` as never); }} />
            ) : null}
            <Button label="Cerrar" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </BottomSheet>
    );
  }

  if (suggestion?.status === "discarded") {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Movimiento detectado" snapHeight={0.44}>
        <View style={styles.resolvedContainer}>
          <Text style={styles.resolvedTitle}>Esta sugerencia ya fue descartada</Text>
          <View style={styles.actions}>
            <Button label="Cerrar" variant="secondary" onPress={onClose} />
          </View>
        </View>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Registrar movimiento" snapHeight={0.88}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.appRow}>
          <View style={styles.logoWrap}>
            <Image source={require("../../assets/images/logo-sin-fondo.png")} style={styles.heroLogo} resizeMode="contain" />
          </View>
          <Text style={styles.appSourceLabel}>Detectado desde {displayAppLabel}</Text>
        </View>

        <View style={styles.amountCard}>
          <Text style={styles.amountCardLabel}>Monto detectado</Text>
          <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" style={styles.amountInput} placeholderTextColor={COLORS.textMuted} />
          <Text style={styles.amountMeta}>{suggestion?.currencyCode ?? "PEN"} · {suggestion?.confidence === "high" ? "alta" : suggestion?.confidence === "medium" ? "media" : "baja"} confianza</Text>
        </View>

        <View style={styles.segment}>
          <SegmentButton label="Gasto" active={movementType === "expense"} activeColor={COLORS.expense} onPress={() => setMovementType("expense")} />
          <SegmentButton label="Ingreso" active={movementType === "income"} activeColor={COLORS.income} onPress={() => setMovementType("income")} />
        </View>

        <AccountChipPicker
          label="Cuenta"
          accounts={activeAccounts}
          selectedId={accountId}
          onSelect={setAccountId}
        />

        <CategoryChipPicker
          label="Categoría (opcional)"
          categories={categories}
          selectedId={categoryId}
          onSelect={selectCategoryManually}
        />
        {categorySuggestion ? (
          <SmartSuggestion
            label={categorySuggestion.categoryName}
            detail={categorySuggestion.detail}
            onApply={() => void applyCategorySuggestion(categorySuggestion)}
          />
        ) : null}

        <Text style={styles.selectRowLabel}>Descripción</Text>
        <TextInput value={description} onChangeText={setDescription} style={styles.input} multiline />

        <DatePickerInput label="Fecha" value={date} onChange={setDate} variant="formRow" />

        <View style={styles.actions}>
          <Button label="Descartar" variant="danger" onPress={() => void discard()} loading={isDiscarding} />
          <Button
            label="Guardar"
            onPress={() => void submit(false)}
            loading={createMovement.isPending || (markSuggestion.isPending && !isDiscarding) || checkingDuplicate}
          />
        </View>
      </ScrollView>
    </BottomSheet>
  );
}

function SegmentButton({ label, active, activeColor, onPress }: { label: string; active: boolean; activeColor: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.segmentButton, active && { backgroundColor: activeColor }]}
      onPress={onPress}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AccountChipPicker({ label, accounts, selectedId, onSelect }: {
  label: string;
  accounts: import("../../types/domain").AccountSummary[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {accounts.map((acc) => (
          <TouchableOpacity
            key={acc.id}
            style={[styles.accountChip, selectedId === acc.id && { borderColor: acc.color, backgroundColor: acc.color + "22" }]}
            onPress={() => onSelect(acc.id)}
            activeOpacity={0.75}
          >
            <Text style={[styles.accountChipName, selectedId === acc.id && { color: acc.color }]}>{acc.name}</Text>
            <Text style={styles.accountChipSub}>{acc.currencyCode}</Text>
          </TouchableOpacity>
        ))}
        {accounts.length === 0 && <Text style={styles.emptyChips}>Sin cuentas activas</Text>}
      </ScrollView>
    </View>
  );
}

function CategoryChipPicker({ label, categories, selectedId, onSelect }: {
  label: string;
  categories: CategorySummary[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  return (
    <View style={styles.pickerWrap}>
      <Text style={styles.pickerLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <TouchableOpacity
          style={[styles.categoryChip, selectedId === null && styles.categoryChipActive]}
          onPress={() => onSelect(null)}
          activeOpacity={0.75}
        >
          <Text style={[styles.categoryChipText, selectedId === null && styles.categoryChipTextActive]}>Sin categoría</Text>
        </TouchableOpacity>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={[styles.categoryChip, selectedId === cat.id && styles.categoryChipActive]}
            onPress={() => onSelect(cat.id)}
            activeOpacity={0.75}
          >
            <Text style={[styles.categoryChipText, selectedId === cat.id && styles.categoryChipTextActive]}>{cat.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: SPACING.md, paddingBottom: SPACING.xl },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  logoWrap: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: GLASS.cardActive,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroLogo: { width: 30, height: 30 },
  appSourceLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, flex: 1 },
  amountCard: {
    borderRadius: RADIUS.xl,
    backgroundColor: SURFACE.deepNavy,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    gap: 2,
  },
  amountCardLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs },
  amountInput: {
    color: COLORS.text,
    fontFamily: FONT_FAMILY.heading,
    fontSize: 34,
    paddingVertical: SPACING.xs,
  },
  amountMeta: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  segment: {
    flexDirection: "row",
    backgroundColor: SURFACE.input,
    borderRadius: RADIUS.md,
    padding: SPACING.xs,
    gap: SPACING.xs,
  },
  segmentButton: { flex: 1, minHeight: 42, borderRadius: RADIUS.sm, alignItems: "center", justifyContent: "center" },
  segmentText: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.sm },
  segmentTextActive: { color: COLORS.textInverse },
  pickerWrap: { gap: SPACING.sm },
  pickerLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, textTransform: "uppercase", letterSpacing: 0.5 },
  chipRow: { gap: SPACING.sm, paddingVertical: SPACING.xs },
  accountChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: SURFACE.card,
    gap: 2,
    minWidth: 100,
    elevation: 3,
  },
  accountChipName: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.text },
  accountChipSub: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  emptyChips: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  categoryChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 3,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: SURFACE.card,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primary + "28",
    borderColor: COLORS.primary + "99",
  },
  categoryChipText: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  categoryChipTextActive: { color: COLORS.primary, fontFamily: FONT_FAMILY.bodySemibold },
  selectRowLabel: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs },
  input: {
    minHeight: 74,
    borderRadius: RADIUS.md,
    backgroundColor: SURFACE.input,
    borderWidth: 1,
    borderColor: COLORS.border,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    padding: SPACING.md,
    textAlignVertical: "top",
  },
  actions: { gap: SPACING.sm, paddingTop: SPACING.sm },
  resolvedContainer: { gap: SPACING.md, paddingVertical: SPACING.lg },
  resolvedTitle: { color: COLORS.text, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  resolvedMeta: { color: COLORS.textMuted, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm },
});
