import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, CheckSquare, Download, MoreVertical, Trash2, Users } from "lucide-react-native";
import { format } from "date-fns";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { FAB } from "../../components/ui/FAB";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { MetricSummaryBar } from "../../components/ui/MetricSummaryBar";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { ResourceSectionList } from "../../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { ContactCard } from "../../components/domain/ContactCard";
import { ContactForm } from "../../components/forms/ContactForm";
import { useAuth } from "../../lib/auth-context";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDeleteCounterpartyMutation,
  useUpdateCounterpartyMutation,
} from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import type { CounterpartyOverview } from "../../types/domain";
import {
  TYPE_FILTERS,
  CONTACT_STATUS_LABELS,
  type ContactStatusFilter,
  type ActiveContactFilter,
  type ContactTypeFilter,
} from "../../features/contacts/lib/contactsLabels";
import { buildContactCSV } from "../../features/contacts/lib/contactsCsv";
import { applyContactFilter } from "../../features/contacts/lib/contactsFilter";
import { buildContactMetricsById, contactHasOpenBalance } from "../../features/contacts/lib/contactMetrics";
import { buildContactSections, type ContactListSection } from "../../features/contacts/lib/buildContactSections";
import { ContactFilterSheet } from "../../features/contacts/components/ContactFilterSheet";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { IOS_FLOATING_TAB_BAR_SPACE } from "../../constants/floating-tab-bar";

function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showErrorToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveMutation = useUpdateCounterpartyMutation(activeWorkspaceId);
  const deleteMutation = useDeleteCounterpartyMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CounterpartyOverview | null>(null);
  const [searchText, setSearchText] = useState("");
  const [contactFilters, setContactFilters] = useState<ActiveContactFilter[]>([]);
  const [statusFilter, setStatusFilter] = useState<ContactStatusFilter>("active");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkArchiveConfirm, setBulkArchiveConfirm] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // Undo-delete: contactos ocultos pendientes de eliminación real
  const UNDO_DELETE_MS = 5000;
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeleteRuns = useRef<Map<number, () => void>>(new Map());
  const pendingDeleteItems = useRef<Map<number, CounterpartyOverview>>(new Map());

  const finalizeDelete = useCallback((id: number) => {
    const pending = pendingDeleteItems.current.get(id);
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteRuns.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!pending) return;
    deleteMutation.mutate(pending.id, {
      onError: (err) => showErrorToast("No se pudo eliminar el contacto", err),
    });
  }, [deleteMutation, showToast]);

  const startUndoDelete = useCallback((contact: CounterpartyOverview) => {
    pendingDeleteItems.current.set(contact.id, contact);
    setPendingDeleteIds((prev) => new Set(prev).add(contact.id));
    const run = () => finalizeDelete(contact.id);
    const timer = setTimeout(() => {
      // Al disparar, la accion deja de estar pendiente: si no, salir de la pantalla
      // la ejecutaria por segunda vez.
      pendingDeleteRuns.current.delete(contact.id);
      run();
    }, UNDO_DELETE_MS);
    deleteTimers.current.set(contact.id, timer);
    pendingDeleteRuns.current.set(contact.id, run);
  }, [finalizeDelete]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteRuns.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => { deleteTimers.current.forEach(clearTimeout);
    deleteTimers.current.clear();
    /* Salir de la pantalla CONFIRMA lo pendiente, no lo cancela: el usuario ya pidio
       borrar y el aviso solo ofrecia deshacerlo. Cancelarlo aqui hacia que la fila
       reapareciera sin que nadie dijera nada. */
    const pendingRuns = [...pendingDeleteRuns.current.values()];
    pendingDeleteRuns.current.clear();
    pendingRuns.forEach((run) => run()); };
  }, []);

  const counterparties = snapshot?.counterparties ?? [];
  const obligations = snapshot?.obligations ?? [];
  const subscriptions = snapshot?.subscriptions ?? [];
  const recurringIncome = snapshot?.recurringIncome ?? [];
  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const exchangeRates = snapshot?.exchangeRates ?? [];

  const contactMetricsById = useMemo(
    () => buildContactMetricsById({ counterparties, obligations, subscriptions, recurringIncome, baseCurrency, exchangeRates }),
    [counterparties, obligations, recurringIncome, subscriptions, baseCurrency, exchangeRates],
  );

  const filteredContacts = useMemo(() => {
    const filtered = applyContactFilter(counterparties, {
      search: searchText,
      filters: contactFilters,
      status: statusFilter,
    });
    if (pendingDeleteIds.size === 0) return filtered;
    return filtered.filter((contact) => !pendingDeleteIds.has(contact.id));
  }, [contactFilters, counterparties, pendingDeleteIds, searchText, statusFilter]);

  const contactSections = useMemo<ContactListSection[]>(
    () => buildContactSections(filteredContacts),
    [filteredContacts],
  );

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = contactFilters.map((filterValue) => ({
      key: `filter-${filterValue}`,
      label: TYPE_FILTERS.find((filter) => filter.value === filterValue)?.label ?? "Filtro",
      onRemove: () => setContactFilters((current) => current.filter((value) => value !== filterValue)),
    }));

    if (statusFilter !== "active") {
      items.push({
        key: "archived",
        label: statusFilter === "all" ? "Incluye archivados" : CONTACT_STATUS_LABELS[statusFilter],
        onRemove: () => setStatusFilter("active"),
      });
    }

    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Búsqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }

    return items;
  }, [contactFilters, searchText, statusFilter]);

  const summary = useMemo(() => {
    const linkedContacts = filteredContacts.filter((contact) => {
      const metrics = contactMetricsById.get(contact.id);
      return (
        contact.movementCount > 0 ||
        contact.receivableCount > 0 ||
        contact.payableCount > 0 ||
        Boolean(metrics && (
          contactHasOpenBalance(metrics) ||
          metrics.subscriptionCount > 0 ||
          metrics.recurringIncomeCount > 0
        ))
      );
    }).length;
    return {
      total: filteredContacts.length,
      withBalance: filteredContacts.filter((contact) => contactHasOpenBalance(contactMetricsById.get(contact.id))).length,
      linked: linkedContacts,
    };
  }, [contactMetricsById, filteredContacts]);

  const hasFilters = contactFilters.length > 0 || statusFilter !== "active" || Boolean(searchText.trim());
  const extraFiltersCount = Number(statusFilter !== "active") + Number(contactFilters.includes("pinned"));

  const { handleBack } = useOriginBackNavigation();

  const canDeleteContact = useCallback((contact: CounterpartyOverview) =>
    contact.movementCount === 0 && contact.receivableCount === 0 && contact.payableCount === 0,
  []);

  const handleArchive = useCallback((id: number) => {
    archiveMutation.mutate(
      { id, input: { isArchived: true } },
      {
        onSuccess: () => showToast("Contacto archivado", "success"),
        onError: (error) => showErrorToast("No se pudo archivar el contacto", error),
      },
    );
  }, [archiveMutation, showToast]);

  const handleRestore = useCallback((id: number) => {
    archiveMutation.mutate(
      { id, input: { isArchived: false } },
      {
        onSuccess: () => showToast("Contacto restaurado", "success"),
        onError: (error) => showErrorToast("No se pudo restaurar el contacto", error),
      },
    );
  }, [archiveMutation, showToast]);

  const handleDelete = useCallback((contact: CounterpartyOverview) => {
    if (!canDeleteContact(contact)) {
      showToast("Este contacto tiene movimientos o créditos/deudas asociados. Archívalo en su lugar.", "warning");
      return;
    }
    setDeleteTarget(contact);
  }, [canDeleteContact, showToast]);

  const onRefresh = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  function clearContactFilters() {
    setContactFilters([]);
    setStatusFilter("active");
    setSearchText("");
  }

  async function exportCSV(contacts: CounterpartyOverview[]) {
    if (snapshot?.obligations === undefined) {
      showToast("Espera a que se carguen los saldos completos antes de exportar.", "error");
      return;
    }
    const csv = buildContactCSV(contacts, contactMetricsById);
    const fileName = `contactos_${format(new Date(), "yyyyMMdd")}.csv`;
    try {
      await shareCsvAsFile(csv, fileName);
    } catch {
      showToast("No se pudo exportar", "error");
    }
  }

  const selectedContacts = useMemo(
    () => filteredContacts.filter((contact) => selectedIds.has(contact.id)),
    [filteredContacts, selectedIds],
  );

  async function executeBulkArchive() {
    let archivedCount = 0;
    for (const contact of selectedContacts) {
      if (contact.isArchived) continue;
      try {
        await archiveMutation.mutateAsync({ id: contact.id, input: { isArchived: true } });
        archivedCount += 1;
      } catch (err: unknown) {
        showErrorToast(`No se pudo archivar «${contact.name}»`, err);
      }
    }
    setBulkArchiveConfirm(false);
    exitSelectMode();
    if (archivedCount > 0) {
      showToast(
        archivedCount === 1 ? "1 contacto archivado" : `${archivedCount} contactos archivados`,
        "success",
      );
    }
  }

  function executeBulkDelete() {
    const deletable = selectedContacts.filter(canDeleteContact);
    const skipped = selectedContacts.length - deletable.length;
    setBulkDeleteConfirm(false);
    exitSelectMode();
    if (deletable.length === 0) {
      if (skipped > 0) {
        showToast(
          "Ningún contacto se eliminó",
          "error",
          "Tienen movimientos o créditos/deudas. Archívalos en su lugar",
        );
      }
      return;
    }
    deletable.forEach(startUndoDelete);
    if (skipped > 0) {
      showToast(`${skipped} con relaciones no se pueden eliminar`, "warning");
    }
  }

  const renderContactItem: SectionListRenderItem<CounterpartyOverview, ContactListSection> = useCallback(({ item }) => (
    <ContactCard
      contact={item}
      metrics={contactMetricsById.get(item.id)}
      onPress={() => {
        if (selectMode) {
          toggleSelect(item.id);
          return;
        }
        router.push(`/contacts/${item.id}`);
      }}
      onLongPress={() => {
        if (!selectMode) setSelectMode(true);
        toggleSelect(item.id);
      }}
      onArchive={() => handleArchive(item.id)}
      onDelete={() => handleDelete(item)}
      onRestore={() => handleRestore(item.id)}
      canDelete={canDeleteContact(item)}
      selected={selectedIds.has(item.id)}
      selectMode={selectMode}
    />
  ), [canDeleteContact, contactMetricsById, handleArchive, handleDelete, handleRestore, router, selectMode, selectedIds, toggleSelect]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title={selectMode ? `${selectedIds.size} seleccionado${selectedIds.size === 1 ? "" : "s"}` : "Contactos"}
          onBack={selectMode ? exitSelectMode : handleBack}
          rightAction={
            selectMode ? null : (
              <HeaderActionGroup
                actions={[{
                  key: "menu",
                  icon: MoreVertical,
                  onPress: () => setMenuOpen(true),
                  accessibilityLabel: "Más acciones",
                }]}
              />
            )
          }
        />
      }
      toolbar={selectMode ? null : (
        <FilterToolbar
          options={TYPE_FILTERS.filter((option) => option.value !== "pinned")}
          selectedValues={contactFilters.filter((value) => value !== "pinned")}
          onSelectedValuesChange={(values) => {
            setContactFilters((current) => [
              ...current.filter((value) => value === "pinned"),
              ...values.filter((value): value is ActiveContactFilter => value !== "all" && value !== "pinned"),
            ]);
          }}
          allValue={"all" satisfies ContactTypeFilter}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar contactos..."
          extraAction={{
            label: extraFiltersCount > 0 ? `${extraFiltersCount} filtros` : "Filtros",
            active: extraFiltersCount > 0,
            onPress: () => setFilterSheetOpen(true),
          }}
        />
      )}
      activeFilters={selectMode ? null : <ActiveFilterBar items={activeFilterItems} onClear={clearContactFilters} />}
      summary={
        !selectMode && filteredContacts.length > 0 ? (
          <MetricSummaryBar
            support={[
              `${summary.total} contacto${summary.total === 1 ? "" : "s"}`,
              summary.withBalance > 0
                ? `${summary.withBalance} con saldo pendiente`
                : summary.linked > 0 ? `${summary.linked} con actividad` : null,
            ].filter(Boolean).join(" · ")}
          />
        ) : null
      }
      bulkActions={
        selectMode && selectedIds.size > 0 ? (
          <BulkActionBar
            selectedCount={selectedIds.size}
            onClear={exitSelectMode}
            actions={[
              {
                key: "select-all",
                label: `Sel. todos (${filteredContacts.length})`,
                icon: CheckSquare,
                onPress: () => setSelectedIds(new Set(filteredContacts.map((c) => c.id))),
              },
              {
                key: "csv",
                label: "CSV",
                icon: Download,
                tone: "primary",
                onPress: () => exportCSV(selectedContacts),
              },
              {
                key: "archive",
                label: `Archivar (${selectedIds.size})`,
                icon: Archive,
                tone: "neutral",
                onPress: () => setBulkArchiveConfirm(true),
              },
              {
                key: "delete",
                label: `Eliminar (${selectedIds.size})`,
                icon: Trash2,
                tone: "danger",
                onPress: () => setBulkDeleteConfirm(true),
              },
            ]}
          />
        ) : null
      }
      list={
        <ResourceSectionList
          sections={contactSections}
          keyExtractor={(item) => `${item.workspaceId}:contact:${item.id}`}
          contentContainerStyle={{ paddingHorizontal: 0 }}
          renderItem={renderContactItem}
          loading={{
            isLoading,
            skeleton: (
              <SkeletonList>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </SkeletonList>
            ),
          }}
          empty={{
            icon: Users,
            title: hasFilters ? "Sin resultados" : "Sin contactos",
            description: hasFilters
              ? "Prueba quitando filtros o ajustando la búsqueda."
              : "Agrega clientes, proveedores y más.",
            action: hasFilters
              ? { label: "Limpiar filtros", onPress: clearContactFilters }
              : { label: "Nuevo contacto", onPress: () => setCreateFormVisible(true) },
          }}
          onRefresh={onRefresh}
        />
      }
      fab={!selectMode ? <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16 + IOS_FLOATING_TAB_BAR_SPACE} /> : null}
      overlays={
        <>
          <EntityActionSheet
            visible={menuOpen}
            onClose={() => setMenuOpen(false)}
            sheetTitle="Más acciones"
            summaryTitle="Contactos"
            actions={[
              {
                key: "export",
                label: "Exportar a CSV",
                variant: "secondary",
                disabled: filteredContacts.length === 0,
                onPress: () => { setMenuOpen(false); void exportCSV(filteredContacts); },
              },
              {
                key: "select",
                label: "Seleccionar varios",
                variant: "ghost",
                disabled: filteredContacts.length === 0,
                onPress: () => { setMenuOpen(false); setSelectMode(true); },
              },
            ]}
          />
          <ContactFilterSheet
            visible={filterSheetOpen}
            status={statusFilter}
            pinnedOnly={contactFilters.includes("pinned")}
            onStatusChange={setStatusFilter}
            onPinnedOnlyChange={(pinned) => setContactFilters((current) => pinned
              ? [...current.filter((value) => value !== "pinned"), "pinned"]
              : current.filter((value) => value !== "pinned"))}
            onClear={clearContactFilters}
            onClose={() => setFilterSheetOpen(false)}
          />
          <ContactForm
            visible={createFormVisible}
            onClose={() => setCreateFormVisible(false)}
            onSuccess={() => setCreateFormVisible(false)}
          />

          <ConfirmDialog
            visible={Boolean(deleteTarget)}
            title="¿Eliminar contacto?"
            body={
              deleteTarget
                ? `Se eliminará "${deleteTarget.name}" permanentemente.`
                : undefined
            }
            confirmLabel="Sí, eliminar"
            cancelLabel="Cancelar"
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => {
              if (!deleteTarget) return;
              startUndoDelete(deleteTarget);
              setDeleteTarget(null);
            }}
          />

          <UndoBanner
            visible={pendingDeleteIds.size > 0}
            message={(() => {
              if (pendingDeleteIds.size !== 1) return `Se eliminaron ${pendingDeleteIds.size} contactos`;
              const [onlyId] = pendingDeleteIds;
              const name = pendingDeleteItems.current.get(onlyId)?.name;
              return name ? `Se eliminó «${name}»` : "Contacto eliminado";
            })()}
            durationMs={UNDO_DELETE_MS}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
          />

          <ConfirmDialog
            visible={bulkArchiveConfirm}
            title={`Archivar ${selectedIds.size} contactos`}
            body="Los contactos seleccionados pasarán a estado archivado. Podrás verlos desde Filtros → Archivados."
            confirmLabel="Archivar"
            cancelLabel="Cancelar"
            onCancel={() => setBulkArchiveConfirm(false)}
            onConfirm={() => void executeBulkArchive()}
          />

          <ConfirmDialog
            visible={bulkDeleteConfirm}
            title={`¿Eliminar ${selectedIds.size} contactos?`}
            body="Solo se eliminarán los que no tengan movimientos ni créditos/deudas. Los demás permanecerán."
            confirmLabel="Eliminar"
            cancelLabel="Cancelar"
            onCancel={() => setBulkDeleteConfirm(false)}
            onConfirm={() => void executeBulkDelete()}
          />
        </>
      }
    />
  );
}

export default function ContactsScreenRoot() {
  return (
    <ErrorBoundary>
      <ContactsScreen />
    </ErrorBoundary>
  );
}
