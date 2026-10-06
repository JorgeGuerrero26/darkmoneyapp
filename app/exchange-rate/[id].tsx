import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MoreVertical, Pencil, RefreshCw } from "lucide-react-native";
import { ExchangeRateForm } from "../../components/forms/ExchangeRateForm";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { BottomSheet } from "../../components/ui/BottomSheet";
import { Button } from "../../components/ui/Button";
import { DetailActionBar } from "../../components/ui/DetailActionBar";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { ExchangeRateDetailContent } from "../../features/exchange-rates/components/ExchangeRateDetailContent";
import { getExchangeRateCurrencyOptions } from "../../features/exchange-rates/lib/exchangeRateFilters";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useToast } from "../../hooks/useToast";
import { useDeleteExchangeRateMutation, useExchangeRatesQuery, useSyncExchangeRatePairMutation, useToggleExchangeRatePinMutation, useUpdateExchangeRateMutation } from "../../services/queries/exchange-rates";

function ExchangeRateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const rateId = Number(id);
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/exchange-rates?from=more", originRoutes: { "exchange-rates": "/(app)/exchange-rates?from=more" } });
  const insets = useSafeAreaInsets();
  const { showToast, showErrorToast } = useToast();
  const ratesQuery = useExchangeRatesQuery();
  const rates = ratesQuery.data ?? [];
  const rate = Number.isInteger(rateId) && rateId > 0 ? rates.find((item) => item.id === rateId) : undefined;
  const currencyOptions = useMemo(() => getExchangeRateCurrencyOptions(rates), [rates]);
  const sync = useSyncExchangeRatePairMutation();
  const update = useUpdateExchangeRateMutation();
  const pin = useToggleExchangeRatePinMutation();
  const remove = useDeleteExchangeRateMutation();
  const mutationGuard = useRef(false);
  const mounted = useRef(true);
  const deleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDeleteRun = useRef<(() => void) | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const busy = sync.isPending || update.isPending || pin.isPending || remove.isPending || deletePending;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (deleteTimer.current) clearTimeout(deleteTimer.current);
      // Salir confirma el borrado pendiente, igual que la lista; no lo ejecuta dos veces.
      const run = pendingDeleteRun.current;
      pendingDeleteRun.current = null;
      run?.();
    };
  }, []);

  async function syncPair() {
    if (!rate || mutationGuard.current) return;
    mutationGuard.current = true;
    try {
      await sync.mutateAsync({ fromCurrencyCode: rate.fromCurrencyCode, toCurrencyCode: rate.toCurrencyCode });
      showToast("Tipo de cambio actualizado", "success");
    } catch (error) { showErrorToast("No se pudo actualizar el tipo de cambio", error); }
    finally { mutationGuard.current = false; }
  }

  async function togglePinned() {
    if (!rate || mutationGuard.current) return;
    mutationGuard.current = true;
    try {
      await pin.mutateAsync({ id: rate.id, isPinned: !rate.isPinned });
    } catch (error) { showErrorToast("No se pudo cambiar el fijado", error); }
    finally { mutationGuard.current = false; }
  }

  async function saveRate(from: string, to: string, value: number, notes: string) {
    if (!rate || mutationGuard.current) return;
    mutationGuard.current = true;
    try {
      await update.mutateAsync({ id: rate.id, fromCurrencyCode: from, toCurrencyCode: to, rate: value, notes });
      setEditing(false);
      showToast("Tipo de cambio actualizado", "success");
    } catch (error) { showErrorToast("No se pudo guardar el tipo de cambio", error); }
    finally { mutationGuard.current = false; }
  }

  function startDelete() {
    if (!rate || mutationGuard.current) return;
    mutationGuard.current = true;
    setDeletePending(true);
    const target = rate;
    const run = () => {
      pendingDeleteRun.current = null;
      deleteTimer.current = null;
      void remove.mutateAsync(target.id).then(() => {
        showToast("Tipo de cambio eliminado", "success", `${target.fromCurrencyCode} → ${target.toCurrencyCode}`);
        if (mounted.current) handleBack();
      }).catch((error) => {
        showErrorToast("No se pudo eliminar el tipo de cambio", error);
      }).finally(() => {
        mutationGuard.current = false;
        if (mounted.current) setDeletePending(false);
      });
    };
    pendingDeleteRun.current = run;
    deleteTimer.current = setTimeout(run, 5000);
  }

  function undoDelete() {
    if (!pendingDeleteRun.current) return;
    if (deleteTimer.current) clearTimeout(deleteTimer.current);
    deleteTimer.current = null;
    pendingDeleteRun.current = null;
    mutationGuard.current = false;
    setDeletePending(false);
  }

  return <ResourceModuleTemplate topInset={insets.top}
    header={<ScreenHeader title="Tipo de cambio" onBack={handleBack} rightAction={rate ? <HeaderActionGroup actions={[{
      key: "menu", icon: MoreVertical, accessibilityLabel: "Más acciones", onPress: () => setMenuOpen(true), disabled: busy,
    }]} /> : null} />}
    list={ratesQuery.isLoading ? <SkeletonList><SkeletonCard /><SkeletonCard /></SkeletonList>
      : !rate ? <View style={styles.center}>
        <Text style={styles.message}>{ratesQuery.isError ? "No se pudo cargar el tipo de cambio" : "Tipo de cambio no encontrado"}</Text>
        {ratesQuery.isError ? <Button label="Reintentar" onPress={() => void ratesQuery.refetch()} /> : null}
      </View> : <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <ExchangeRateDetailContent rate={rate} />
      </ScrollView>}
    fab={rate ? <DetailActionBar bottomInset={insets.bottom}
      primary={{ label: "Editar", accessibilityLabel: "Editar tipo de cambio", icon: Pencil, onPress: () => setEditing(true), disabled: busy }}
      secondary={{ label: sync.isPending ? "Actualizando…" : "Actualizar", accessibilityLabel: "Actualizar tipo de cambio", icon: RefreshCw, onPress: () => void syncPair(), loading: sync.isPending, disabled: busy }} /> : null}
    overlays={<>
      {rate ? <>
        <EntityActionSheet visible={menuOpen} onClose={() => setMenuOpen(false)} sheetTitle="Más acciones" summaryTitle={`${rate.fromCurrencyCode} → ${rate.toCurrencyCode}`}
          actions={[
            { key: "pin", label: rate.isPinned ? "Desfijar" : "Fijar", variant: "ghost", disabled: busy, onPress: () => { setMenuOpen(false); void togglePinned(); } },
            { key: "delete", label: "Eliminar", variant: "danger", disabled: busy, onPress: () => { setMenuOpen(false); startDelete(); } },
          ]} />
        <BottomSheet visible={editing} onClose={() => { if (!update.isPending) setEditing(false); }} title={`Editar ${rate.fromCurrencyCode} → ${rate.toCurrencyCode}`} snapHeight={0.75} entranceAnimation="springFade">
          {editing ? <ExchangeRateForm key={rate.id} initialFrom={rate.fromCurrencyCode} initialTo={rate.toCurrencyCode}
            initialRate={String(rate.rate)} initialNotes={rate.notes ?? ""} currencyOptions={currencyOptions}
            onSave={(from, to, value, notes) => void saveRate(from, to, value, notes)}
            onCancel={() => { if (!update.isPending) setEditing(false); }} loading={update.isPending} /> : null}
        </BottomSheet>
      </> : null}
      <UndoBanner visible={deletePending && !remove.isPending} message="Tipo de cambio pendiente de eliminar"
        detail={rate ? `${rate.fromCurrencyCode} → ${rate.toCurrencyCode}` : undefined}
        onUndo={undoDelete} durationMs={5000} bottomOffset={insets.bottom + 80} />
    </>} />;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.xxxl, gap: SPACING.md },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl, gap: SPACING.lg },
  message: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, textAlign: "center" },
});

export default function ExchangeRateDetailScreenRoot() {
  return <ErrorBoundary><ExchangeRateDetailScreen /></ErrorBoundary>;
}
