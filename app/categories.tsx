import { FAB } from "../components/ui/FAB";
import {
  BarChart3,
  Download,
  Power,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const SCREEN_HEIGHT = Dimensions.get("window").height;
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { useAuth } from "../lib/auth-context";
import { useWorkspace } from "../lib/workspace-context";
import { buildCategoriesCsv } from "../lib/categories-csv";
import { shareCsvAsFile } from "../lib/share-csv-file";
import {
  useCategoriesOverviewQuery,
  useDeleteCategoryMutation,
  useToggleCategoryMutation,
  useWorkspaceSnapshotQuery,
} from "../services/queries/workspace-data";
import type { CategoryKind, CategoryOverview } from "../types/domain";
import { EmptyState } from "../components/ui/EmptyState";
import { Card } from "../components/ui/Card";
import { SkeletonCard } from "../components/ui/Skeleton";
import { ScreenHeader } from "../components/layout/ScreenHeader";
import { CategoryForm } from "../components/forms/CategoryForm";
import { CategoryAnalyticsModal } from "../components/domain/CategoryAnalyticsModal";
import { CategoryGlyph } from "../components/domain/CategoryGlyph";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, GLASS, RADIUS, SPACING } from "../constants/theme";

const KIND_LABELS: Record<string, string> = {
  income: "Ingreso",
  expense: "Gasto",
  both: "Mixta",
};

const KIND_COLORS: Record<string, string> = {
  expense: COLORS.expense,
  income: COLORS.income,
  both: COLORS.primary,
};

/** Ancho de cada celda del panel (Activar/Desactivar | Eliminar en fila). */
const CATEGORY_ACTION_CELL_W = 80;

type KindFilter = "all" | CategoryKind;

/** Misma lógica que el servidor: sin movimientos, sin suscripciones y sin subcategorías. */
function categoryCanDelete(cat: CategoryOverview, allCategories: CategoryOverview[]): boolean {
  if (cat.isSystem) return false;
  if (cat.movementCount > 0 || cat.subscriptionCount > 0) return false;
  return !allCategories.some((c) => c.parentId === cat.id);
}

type SwipeableCategoryRowProps = {
  cat: CategoryOverview;
  color: string;
  kindLabel: string;
  onPressCard: () => void;
  onToggle: () => void;
  onAnalytics: () => void;
  onDelete: () => void;
  canDelete: boolean;
  toggleDisabled?: boolean;
};

function SwipeableCategoryRow({
  cat,
  color,
  kindLabel,
  onPressCard,
  onToggle,
  onAnalytics,
  onDelete,
  canDelete,
  toggleDisabled,
}: SwipeableCategoryRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  /** Panel abierto = tarjeta desplazada a la izquierda (translateX negativo). */
  const panelOpenRef = useRef(false);
  const panelW = canDelete ? CATEGORY_ACTION_CELL_W * 2 : CATEGORY_ACTION_CELL_W;

  const panelOpacity = useMemo(
    () =>
      translateX.interpolate({
        inputRange: [-panelW, -12, 0],
        outputRange: [1, 0.4, 0],
        extrapolate: "clamp",
      }),
    [panelW, translateX],
  );

  const snapTo = (toValue: number, cb?: () => void) => {
    panelOpenRef.current = toValue < 0;
    Animated.spring(translateX, {
      toValue: toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(cb);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        /**
         * Solo capturar el gesto si el movimiento es claramente horizontal.
         * Con el panel cerrado: solo si el usuario desliza hacia la **izquierda** (dx negativo),
         * así un swipe a la derecha no abre acciones (evita sensación invertida / scroll).
         */
        onMoveShouldSetPanResponder: (_, { dx, dy }) => {
          const mostlyHorizontal = Math.abs(dx) > Math.abs(dy) * 1.65 && Math.abs(dx) > 14;
          if (!mostlyHorizontal) return false;
          if (panelOpenRef.current) return true;
          return dx < -12;
        },
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, { dx }) => {
          const base = panelOpenRef.current ? -panelW : 0;
          const raw = base + dx;
          const clamped = Math.max(-panelW * 1.2, Math.min(0, raw));
          translateX.setValue(clamped);
        },
        onPanResponderRelease: (_, { dx, vx }) => {
          const base = panelOpenRef.current ? -panelW : 0;
          const finalX = base + dx;
          if (finalX < -panelW / 2 || vx < -0.3) {
            snapTo(-panelW);
          } else {
            snapTo(0);
          }
        },
      }),
    [panelW],
  );

  function handleCardPress() {
    if (panelOpenRef.current) {
      snapTo(0);
      return;
    }
    onPressCard();
  }

  const canSwipeActions = !cat.isSystem && !toggleDisabled;

  return (
    <View style={catSwipeStyles.container}>
      {canSwipeActions ? (
        <Animated.View
          style={[catSwipeStyles.actionsPanel, { width: panelW, opacity: panelOpacity }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={[catSwipeStyles.actionCell, catSwipeStyles.actionToggle, canDelete && catSwipeStyles.actionCellBorder]}
            onPress={() => snapTo(0, onToggle)}
            activeOpacity={0.85}
            accessibilityLabel={cat.isActive ? "Desactivar categoría" : "Activar categoría"}
          >
            <Power size={18} color={cat.isActive ? COLORS.warning : COLORS.income} strokeWidth={2} />
            <Text
              style={[
                catSwipeStyles.actionLabel,
                { color: cat.isActive ? COLORS.warning : COLORS.income },
              ]}
              numberOfLines={2}
            >
              {cat.isActive ? "Desactivar" : "Activar"}
            </Text>
          </TouchableOpacity>
          {canDelete ? (
            <TouchableOpacity
              style={[catSwipeStyles.actionCell, catSwipeStyles.actionDelete]}
              onPress={() => snapTo(0, onDelete)}
              activeOpacity={0.85}
              accessibilityLabel="Eliminar categoría"
            >
              <Trash2 size={18} color={COLORS.danger} strokeWidth={2} />
              <Text style={[catSwipeStyles.actionLabel, { color: COLORS.danger }]} numberOfLines={2}>
                Eliminar
              </Text>
            </TouchableOpacity>
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View style={{ transform: [{ translateX }] }}>
        <Card style={[styles.card, !cat.isActive && styles.cardInactive]}>
          <View style={styles.cardRow}>
            <View
              style={styles.cardSwipeZone}
              {...(canSwipeActions ? panResponder.panHandlers : {})}
            >
              <TouchableOpacity
                style={styles.cardMainPress}
                activeOpacity={0.92}
                onPress={handleCardPress}
                accessibilityRole="button"
                accessibilityLabel={cat.isSystem ? "Ver categoría" : "Editar categoría"}
              >
                <View style={[styles.colorDot, { backgroundColor: color }]} />
                {cat.icon ? <CategoryGlyph icon={cat.icon} color={color} size={20} /> : null}
                <View style={styles.cardInfo}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.name, !cat.isActive && styles.nameMuted]} numberOfLines={2}>
                      {cat.name}
                    </Text>
                    {cat.isSystem ? (
                      <View style={styles.baseBadge}>
                        <Text style={styles.baseBadgeText}>Base</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.kind}>
                    {kindLabel}
                    {cat.parentName ? ` · ${cat.parentName}` : ""}
                  </Text>
                  <Text style={styles.stats}>
                    {cat.movementCount} mov. · {cat.subscriptionCount} suscr. · orden {cat.sortOrder}
                  </Text>
                  <Text style={styles.lastAct}>Última act.: {formatIsoLocal(cat.lastActivityAt)}</Text>
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity style={styles.iconActionBtn} onPress={onAnalytics} accessibilityLabel="Ver análisis">
                <BarChart3 size={16} color={COLORS.storm} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </Animated.View>
    </View>
  );
}

const catSwipeStyles = StyleSheet.create({
  container: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  actionsPanel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "stretch",
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  actionCell: {
    width: CATEGORY_ACTION_CELL_W,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
    paddingVertical: SPACING.xs,
  },
  actionCellBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: GLASS.cardBorder,
  },
  actionToggle: {
    backgroundColor: COLORS.pine + "24",
  },
  actionDelete: {
    backgroundColor: COLORS.danger + "22",
  },
  actionLabel: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.bodySemibold,
    textAlign: "center",
  },
});

function formatIsoLocal(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, "d MMM yyyy", { locale: es });
}

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const { data: overviewList = [], isLoading } = useCategoriesOverviewQuery(profile, activeWorkspaceId);
  const toggleMutation = useToggleCategoryMutation(activeWorkspaceId);
  const deleteMutation = useDeleteCategoryMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryOverview | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryOverview | null>(null);
  const [analyticsTarget, setAnalyticsTarget] = useState<CategoryOverview | null>(null);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const filterOverlayOpacity = useRef(new Animated.Value(0)).current;
  const filterSheetY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  useEffect(() => {
    if (filterSheetOpen) {
      Animated.parallel([
        Animated.timing(filterOverlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(filterSheetY, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(filterOverlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(filterSheetY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: true }),
      ]).start();
    }
  }, [filterSheetOpen, filterOverlayOpacity, filterSheetY]);

  /** Filtros que viven en la hoja (como frecuencia en Suscripciones). */
  const extraFiltersCount = showInactive ? 1 : 0;

  const categoryPostedMovements = snapshot?.categoryPostedMovements ?? [];

  const filtered = useMemo(() => {
    let list = overviewList;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.parentName ?? "").toLowerCase().includes(q),
      );
    }
    if (kindFilter !== "all") list = list.filter((c) => c.kind === kindFilter);
    if (!showInactive) list = list.filter((c) => c.isActive);
    return list;
  }, [overviewList, search, kindFilter, showInactive]);

  const userCategories = filtered.filter((c) => !c.isSystem);
  const systemCategories = filtered.filter((c) => c.isSystem);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
    void queryClient.invalidateQueries({ queryKey: ["categories-overview", activeWorkspaceId] });
  }, [queryClient, activeWorkspaceId]);

  async function handleExportCsv() {
    if (filtered.length === 0) {
      showToast("No hay filas para exportar", "warning");
      return;
    }
    try {
      const csv = buildCategoriesCsv(filtered);
      await shareCsvAsFile(csv, `categorias-${activeWorkspace?.name?.replace(/\s+/g, "_") ?? "workspace"}.csv`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Error al exportar", "error");
    }
  }

  function clearSheetFilters() {
    setShowInactive(false);
  }

  function handleToggleActive(cat: CategoryOverview) {
    if (cat.isSystem) return;
    const newActive = !cat.isActive;
    toggleMutation.mutate(
      { id: cat.id, isActive: newActive },
      {
        onSuccess: () => showToast(newActive ? "Categoría activada" : "Categoría desactivada", "success"),
        onError: (e) => showToast(e.message, "error"),
      },
    );
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => {
        setDeleteTarget(null);
        showToast("Categoría eliminada", "success");
      },
      onError: (e) => showToast(e.message, "error"),
    });
  }

  const kindChips: { key: KindFilter; label: string }[] = [
    { key: "all", label: "Todas" },
    { key: "expense", label: "Gasto" },
    { key: "income", label: "Ingreso" },
    { key: "both", label: "Mixta" },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title="Categorías"
        onBack={() => router.replace("/(app)/more")}
        rightAction={
          <View style={styles.headerRightRow}>
            <TouchableOpacity
              style={styles.filterBtn}
              onPress={() => void handleExportCsv()}
              accessibilityLabel="Descargar CSV"
            >
              <Download size={14} color={COLORS.storm} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterBtn, extraFiltersCount > 0 && styles.filterBtnActive]}
              onPress={() => setFilterSheetOpen(true)}
            >
              <SlidersHorizontal size={14} color={extraFiltersCount > 0 ? COLORS.primary : COLORS.storm} />
              <Text style={[styles.filterBtnText, extraFiltersCount > 0 && styles.filterBtnTextActive]}>
                {extraFiltersCount > 0 ? `Filtros (${extraFiltersCount})` : "Filtros"}
              </Text>
            </TouchableOpacity>
          </View>
        }
      />

      <View style={styles.searchWrap}>
        <Search size={15} color={COLORS.storm} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar categorías…"
          placeholderTextColor={COLORS.storm}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <X size={15} color={COLORS.storm} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.segmentedWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentedRow}>
          {kindChips.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={[styles.pill, kindFilter === c.key && styles.pillActive]}
              onPress={() => setKindFilter(c.key)}
            >
              <Text style={[styles.pillText, kindFilter === c.key && styles.pillTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {showInactive ? (
        <View style={styles.activeFiltersBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeFiltersPills}>
            <TouchableOpacity style={styles.activeFilterChip} onPress={() => setShowInactive(false)}>
              <Text style={styles.activeFilterChipText}>Inactivas visibles ×</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearSheetFilters}>
              <Text style={styles.clearAll}>Limpiar</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}

      <Text style={styles.hintGestures}>
        Toca la categoría para editar · Desliza a la izquierda para activar/desactivar y eliminar (si aplica)
      </Text>

      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="none"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <Animated.View style={[styles.filterOverlay, { opacity: filterOverlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterSheetOpen(false)} />
          <Animated.View
            style={[
              styles.filterSheet,
              { paddingBottom: insets.bottom + SPACING.lg, transform: [{ translateY: filterSheetY }] },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.filterSheetHandle} />
            <Text style={styles.filterSheetTitle}>Filtros</Text>

            <Text style={styles.filterSectionLabel}>Categorías inactivas</Text>
            <View style={styles.sheetSwitchRow}>
              <View style={styles.sheetSwitchText}>
                <Text style={styles.sheetSwitchLabel}>Incluir inactivas</Text>
                <Text style={styles.sheetSwitchDesc}>Muestra también las desactivadas en la lista</Text>
              </View>
              <Switch
                value={showInactive}
                onValueChange={setShowInactive}
                trackColor={{ false: COLORS.border, true: COLORS.primary }}
                thumbColor="#FFFFFF"
              />
            </View>

            <TouchableOpacity style={styles.applyBtn} onPress={() => setFilterSheetOpen(false)}>
              <Text style={styles.applyBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor={COLORS.primary} />
        }
      >
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : overviewList.length === 0 ? (
          <EmptyState
            title="Sin categorías"
            description="Crea tu primera categoría con el botón +"
            action={{ label: "Nueva categoría", onPress: () => setCreateFormVisible(true) }}
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="Sin resultados" description="Prueba otros filtros o activa «Ver inactivas»." />
        ) : null}

        {userCategories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Personalizadas ({userCategories.length})</Text>
            {userCategories.map((cat) => {
              const color = cat.color ?? KIND_COLORS[cat.kind] ?? COLORS.primary;
              const canDel = categoryCanDelete(cat, overviewList);
              return (
                <SwipeableCategoryRow
                  key={cat.id}
                  cat={cat}
                  color={color}
                  kindLabel={KIND_LABELS[cat.kind] ?? cat.kind}
                  onPressCard={() => setEditCategory(cat)}
                  onToggle={() => handleToggleActive(cat)}
                  onAnalytics={() => setAnalyticsTarget(cat)}
                  onDelete={() => setDeleteTarget(cat)}
                  canDelete={canDel}
                  toggleDisabled={toggleMutation.isPending}
                />
              );
            })}
          </View>
        ) : null}

        {systemCategories.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Del sistema ({systemCategories.length})</Text>
            {systemCategories.map((cat) => {
              const color = cat.color ?? KIND_COLORS[cat.kind] ?? COLORS.primary;
              return (
                <SwipeableCategoryRow
                  key={cat.id}
                  cat={cat}
                  color={color}
                  kindLabel={KIND_LABELS[cat.kind] ?? cat.kind}
                  onPressCard={() => setAnalyticsTarget(cat)}
                  onToggle={() => {}}
                  onAnalytics={() => setAnalyticsTarget(cat)}
                  onDelete={() => {}}
                  canDelete={false}
                />
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />

      <CategoryForm
        visible={createFormVisible}
        onClose={() => setCreateFormVisible(false)}
        onSuccess={() => setCreateFormVisible(false)}
      />
      <CategoryForm
        visible={Boolean(editCategory)}
        onClose={() => setEditCategory(null)}
        onSuccess={() => setEditCategory(null)}
        editCategory={editCategory ?? undefined}
      />

      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title="Eliminar categoría"
        body={
          deleteTarget
            ? `¿Eliminar «${deleteTarget.name}»? No debe tener movimientos, suscripciones ni subcategorías.`
            : undefined
        }
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <CategoryAnalyticsModal
        visible={Boolean(analyticsTarget)}
        onClose={() => setAnalyticsTarget(null)}
        category={analyticsTarget}
        movements={categoryPostedMovements}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },

  headerRightRow: { flexDirection: "row", gap: SPACING.xs, alignItems: "center" },
  filterBtn: {
    height: 34,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 5,
  },
  filterBtnActive: { backgroundColor: COLORS.primary + "18" },
  filterBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
  filterBtnTextActive: { color: COLORS.primary },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
    fontFamily: FONT_FAMILY.body,
    paddingVertical: SPACING.md,
  },

  segmentedWrap: { height: 44, justifyContent: "center", marginBottom: SPACING.xs },
  segmentedRow: { paddingHorizontal: SPACING.lg, gap: SPACING.xs, alignItems: "center" },
  pill: {
    height: 32,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: GLASS.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
  },
  pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  pillText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
    includeFontPadding: false,
  },
  pillTextActive: { color: "#FFFFFF", fontFamily: FONT_FAMILY.bodySemibold },

  activeFiltersBar: { paddingVertical: SPACING.xs },
  activeFiltersPills: { paddingHorizontal: SPACING.lg, gap: SPACING.xs, alignItems: "center" },
  activeFilterChip: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary + "18",
  },
  activeFilterChipText: { fontSize: FONT_SIZE.xs, color: COLORS.primary, fontFamily: FONT_FAMILY.bodyMedium },
  clearAll: { fontSize: FONT_SIZE.xs, color: COLORS.storm, fontFamily: FONT_FAMILY.body, paddingHorizontal: SPACING.xs },

  filterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  filterSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(8,12,18,0.97)",
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
    padding: SPACING.lg,
    gap: SPACING.md,
    maxHeight: "70%",
  },
  filterSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignSelf: "center",
    marginBottom: SPACING.xs,
  },
  filterSheetTitle: {
    fontSize: FONT_SIZE.md,
    fontFamily: FONT_FAMILY.heading,
    color: COLORS.ink,
    textAlign: "center",
  },
  filterSectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodyMedium,
    color: COLORS.storm,
    letterSpacing: 0.2,
  },
  sheetSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GLASS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: GLASS.cardBorder,
    gap: SPACING.md,
  },
  sheetSwitchText: { flex: 1, gap: 4 },
  sheetSwitchLabel: { fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  sheetSwitchDesc: { fontSize: FONT_SIZE.xs, color: COLORS.storm },
  applyBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  applyBtnText: { color: "#FFF", fontSize: FONT_SIZE.sm, fontFamily: FONT_FAMILY.bodySemibold },

  hintGestures: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    lineHeight: 16,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  content: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 100 },
  section: { gap: SPACING.sm },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingVertical: SPACING.xs,
  },
  card: { padding: SPACING.md },
  cardInactive: { opacity: 0.55 },
  cardRow: { flexDirection: "row", alignItems: "flex-start", gap: SPACING.sm },
  cardSwipeZone: { flex: 1, minWidth: 0 },
  cardMainPress: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.sm,
    minWidth: 0,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6 },
  cardInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flexWrap: "wrap" },
  name: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink, flex: 1 },
  nameMuted: { color: COLORS.storm },
  baseBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.infoMuted,
    borderWidth: 1,
    borderColor: COLORS.info + "44",
  },
  baseBadgeText: { fontSize: 10, color: COLORS.info, fontFamily: FONT_FAMILY.bodySemibold },
  kind: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },
  stats: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 4 },
  lastAct: { fontSize: FONT_SIZE.xs, color: COLORS.textDisabled, marginTop: 2 },
  cardActions: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.xs, maxWidth: 120, justifyContent: "flex-end" },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActionText: { fontSize: FONT_SIZE.sm, color: COLORS.storm },
});
