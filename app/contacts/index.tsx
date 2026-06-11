import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, CheckSquare, Download, Trash2, Users } from "lucide-react-native";
import { format } from "date-fns";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { FAB } from "../../components/ui/FAB";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { MetricSummaryBar } from "../../components/ui/MetricSummaryBar";
import { ResourceContextNote } from "../../components/ui/ResourceContextNote";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { BulkActionBar } from "../../components/ui/BulkActionBar";
import { ResourceSectionList, type ResourceSection } from "../../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { UndoBanner } from "../../components/ui/UndoBanner";
import { ContactCard, type ContactMetrics } from "../../components/domain/ContactCard";
import { ContactForm } from "../../components/forms/ContactForm";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDeleteCounterpartyMutation,
  useToggleCounterpartyPinMutation,
  useUpdateCounterpartyMutation,
} from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { COLORS } from "../../constants/theme";
import type { CounterpartyOverview } from "../../types/domain";
import {
  TYPE_FILTERS,
  type ActiveContactFilter,
  type ContactTypeFilter,
} from "../../features/contacts/lib/contactsLabels";
import { buildContactCSV } from "../../features/contacts/lib/contactsCsv";
import { applyContactFilter } from "../../features/contacts/lib/contactsFilter";
import { buildContactMetricsById } from "../../features/contacts/lib/contactMetrics";
import { buildContactsContextNote } from "../../features/contacts/lib/contactsContextNote";

type ContactListSection = ResourceSection<CounterpartyOverview, "pinned" | "active" | "archived">;

function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveMutation = useUpdateCounterpartyMutation(activeWorkspaceId);
  const deleteMutation = useDeleteCounterpartyMutation(activeWorkspaceId);
  const togglePinMutation = useToggleCounterpartyPinMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CounterpartyOverview | null>(null);
  const [searchText, setSearchText] = useState("");
  const [contactFilters, setContactFilters] = useState<ActiveContactFilter[]>([]);
  const [showArchived, setShowArchived] = useState(false);

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

  useEffect(() => {
    if (selectMode && selectedIds.size === 0) {
      setSelectMode(false);
    }
  }, [selectMode, selectedIds.size]);

  // Undo-delete: contactos ocultos pendientes de eliminación real
  const UNDO_DELETE_MS = 5000;
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingDeleteItems = useRef<Map<number, CounterpartyOverview>>(new Map());

  const finalizeDelete = useCallback((id: number) => {
    const pending = pendingDeleteItems.current.get(id);
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (!pending) return;
    deleteMutation.mutate(pending.id, {
      onError: (err) => showToast(humanizeError(err), "error"),
    });
  }, [deleteMutation, showToast]);

  const startUndoDelete = useCallback((contact: CounterpartyOverview) => {
    pendingDeleteItems.current.set(contact.id, contact);
    setPendingDeleteIds((prev) => new Set(prev).add(contact.id));
    const timer = setTimeout(() => finalizeDelete(contact.id), UNDO_DELETE_MS);
    deleteTimers.current.set(contact.id, timer);
  }, [finalizeDelete]);

  const undoDelete = useCallback((id: number) => {
    const timer = deleteTimers.current.get(id);
    if (timer) clearTimeout(timer);
    deleteTimers.current.delete(id);
    pendingDeleteItems.current.delete(id);
    setPendingDeleteIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => { deleteTimers.current.forEach(clearTimeout); };
  }, []);

  const counterparties = snapshot?.counterparties ?? [];
  const obligations = snapshot?.obligations ?? [];
  const subscriptions = snapshot?.subscriptions ?? [];
  const recurringIncome = snapshot?.recurringIncome ?? [];

  const contactMetricsById = useMemo(
    () => buildContactMetricsById({ counterparties, obligations, subscriptions, recurringIncome }),
    [counterparties, obligations, recurringIncome, subscriptions],
  );

  const filteredContacts = useMemo(() => {
    const filtered = applyContactFilter(counterparties, {
      search: searchText,
      filters: contactFilters,
      showArchived,
    });
    if (pendingDeleteIds.size === 0) return filtered;
    return filtered.filter((contact) => !pendingDeleteIds.has(contact.id));
  }, [contactFilters, counterparties, pendingDeleteIds, searchText, showArchived]);

  const pinnedContacts = filteredContacts.filter((contact) => contact.isPinned && !contact.isArchived);
  const activeContacts = filteredContacts.filter((contact) => !contact.isArchived);
  const unpinnedActiveContacts = filteredContacts.filter((contact) => !contact.isArchived && !contact.isPinned);
  const archivedContacts = filteredContacts.filter((contact) => contact.isArchived);

  const contactSections = useMemo<ContactListSection[]>(() => {
    const sections: ContactListSection[] = [];
    if (pinnedContacts.length > 0) {
      sections.push({
        key: "pinned",
        label: `Fijados (${pinnedContacts.length})`,
        data: pinnedContacts,
        headerVariant: "default",
      });
    }
    if (unpinnedActiveContacts.length > 0) {
      sections.push({
        key: "active",
        label: "Activos",
        data: unpinnedActiveContacts,
        headerVariant: pinnedContacts.length > 0 ? "default" : "hidden",
      });
    }
    if (archivedContacts.length > 0) {
      sections.push({
        key: "archived",
        label: `Archivados (${archivedContacts.length})`,
        data: archivedContacts,
        headerVariant: "divider",
        headerIcon: Archive,
      });
    }
    return sections;
  }, [archivedContacts, pinnedContacts, unpinnedActiveContacts]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = contactFilters.map((filterValue) => ({
      key: `filter-${filterValue}`,
      label: TYPE_FILTERS.find((filter) => filter.value === filterValue)?.label ?? "Filtro",
      onRemove: () => setContactFilters((current) => current.filter((value) => value !== filterValue)),
    }));

    if (showArchived) {
      items.push({
        key: "archived",
        label: "Archivados",
        onRemove: () => setShowArchived(false),
      });
    }

    if (searchText.trim()) {
      items.push({
        key: "search",
        label: `Busqueda: ${searchText.trim()}`,
        onRemove: () => setSearchText(""),
      });
    }

    return items;
  }, [contactFilters, searchText, showArchived]);

  const summary = useMemo(() => {
    const linkedContacts = filteredContacts.filter((contact) => {
      const metrics = contactMetricsById.get(contact.id);
      return (
        contact.movementCount > 0 ||
        contact.receivableCount > 0 ||
        contact.payableCount > 0 ||
        Boolean(metrics && (
          metrics.receivablePendingTotal > 0 ||
          metrics.payablePendingTotal > 0 ||
          metrics.subscriptionCount > 0 ||
          metrics.recurringIncomeCount > 0
        ))
      );
    }).length;
    return {
      total: filteredContacts.length,
      active: activeContacts.length,
      linked: linkedContacts,
    };
  }, [activeContacts.length, contactMetricsById, filteredContacts]);

  const hasFilters = contactFilters.length > 0 || showArchived || Boolean(searchText.trim());

  const hiddenArchivedCount = useMemo(
    () => (showArchived ? 0 : counterparties.filter((contact) => contact.isArchived).length),
    [counterparties, showArchived],
  );

  const contextNote = useMemo(
    () =>
      buildContactsContextNote({
        filteredContacts,
        metricsById: contactMetricsById,
        hasFilters,
        hiddenArchivedCount,
      }),
    [contactMetricsById, filteredContacts, hasFilters, hiddenArchivedCount],
  );

  const { handleBack } = useOriginBackNavigation();

  const canDeleteContact = useCallback((contact: CounterpartyOverview) =>
    contact.movementCount === 0 && contact.receivableCount === 0 && contact.payableCount === 0,
  []);

  const handleArchive = useCallback((id: number) => {
    archiveMutation.mutate(
      { id, input: { isArchived: true } },
      {
        onSuccess: () => showToast("Contacto archivado", "success"),
        onError: (error) => showToast(error.message, "error"),
      },
    );
  }, [archiveMutation, showToast]);

  const handleRestore = useCallback((id: number) => {
    archiveMutation.mutate(
      { id, input: { isArchived: false } },
      {
        onSuccess: () => showToast("Contacto restaurado", "success"),
        onError: (error) => showToast(error.message, "error"),
      },
    );
  }, [archiveMutation, showToast]);

  const handleTogglePin = useCallback((contact: CounterpartyOverview) => {
    togglePinMutation.mutate(
      { id: contact.id, isPinned: !contact.isPinned },
      { onError: (error) => showToast(error.message, "error") },
    );
  }, [showToast, togglePinMutation]);

  const handleDelete = useCallback((contact: CounterpartyOverview) => {
    if (!canDeleteContact(contact)) {
      showToast("Este contacto tiene movimientos o créditos/deudas asociados. Archívalo en su lugar.", "warning");
      return;
    }
    setDeleteTarget(contact);
  }, [canDeleteContact, showToast]);

  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
  }, [queryClient]);

  function clearContactFilters() {
    setContactFilters([]);
    setShowArchived(false);
    setSearchText("");
  }

  async function exportCSV(contacts: CounterpartyOverview[]) {
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
        showToast(humanizeError(err), "error");
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
          "Ninguno se eliminó: todos tienen movimientos o créditos/deudas. Archívalos en su lugar.",
          "error",
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
      onTogglePin={selectMode ? undefined : () => handleTogglePin(item)}
      canDelete={canDeleteContact(item)}
      selected={selectedIds.has(item.id)}
      selectMode={selectMode}
    />
  ), [canDeleteContact, contactMetricsById, handleArchive, handleDelete, handleRestore, handleTogglePin, router, selectMode, selectedIds, toggleSelect]);

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
                  key: "export",
                  icon: Download,
                  onPress: () => exportCSV(filteredContacts),
                  accessibilityLabel: "Exportar CSV",
                }]}
              />
            )
          }
        />
      }
      toolbar={selectMode ? null : (
        <FilterToolbar
          options={TYPE_FILTERS}
          selectedValues={contactFilters}
          onSelectedValuesChange={(values) => {
            setContactFilters(values.filter((value): value is ActiveContactFilter => value !== "all"));
          }}
          allValue={"all" satisfies ContactTypeFilter}
          searchValue={searchText}
          onSearchChange={setSearchText}
          searchPlaceholder="Buscar contactos..."
          actions={[{
            key: "archived",
            icon: Archive,
            active: showArchived,
            onPress: () => setShowArchived((value) => !value),
            accessibilityLabel: showArchived ? "Ocultar archivados" : "Mostrar archivados",
          }]}
        />
      )}
      activeFilters={selectMode ? null : <ActiveFilterBar items={activeFilterItems} onClear={clearContactFilters} />}
      context={
        !selectMode && filteredContacts.length > 0 && contextNote ? (
          <ResourceContextNote>{contextNote}</ResourceContextNote>
        ) : null
      }
      summary={
        !selectMode && filteredContacts.length > 0 ? (
          <MetricSummaryBar
            items={[
              {
                key: "total",
                icon: Users,
                value: String(summary.total),
                label: "contactos",
                color: COLORS.primary,
                strong: true,
                helpTitle: "Contactos visibles",
                helpDescription: "Cantidad total de contactos que coinciden con la búsqueda y filtros actuales.",
              },
              {
                key: "active",
                value: String(summary.active),
                label: "activos",
                helpTitle: "Contactos activos",
                helpDescription: "Contactos disponibles para usarse en créditos, deudas, movimientos u otros módulos.",
              },
              {
                key: "linked",
                value: String(summary.linked),
                label: "vinculados",
                helpTitle: "Contactos vinculados",
                helpDescription: "Contactos que ya tienen relación con registros financieros, como créditos, deudas o movimientos.",
              },
            ]}
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
          keyExtractor={(item) => String(item.id)}
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
            title: hasFilters ? "Sin resultados" : "Sin contactos",
            description: hasFilters
              ? "Prueba quitando filtros o ajustando la búsqueda."
              : "Agrega clientes, proveedores y más.",
            action: !hasFilters ? { label: "Nuevo contacto", onPress: () => setCreateFormVisible(true) } : undefined,
          }}
          refreshing={isLoading}
          onRefresh={onRefresh}
        />
      }
      fab={!selectMode ? <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} /> : null}
      overlays={
        <>
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
            message={pendingDeleteIds.size === 1 ? "Contacto eliminado" : `${pendingDeleteIds.size} contactos eliminados`}
            durationMs={UNDO_DELETE_MS}
            onUndo={() => pendingDeleteIds.forEach((id) => undoDelete(id))}
          />

          <ConfirmDialog
            visible={bulkArchiveConfirm}
            title={`Archivar ${selectedIds.size} contactos`}
            body="Los contactos seleccionados pasarán a estado archivado. Podrás verlos activando el icono de archivados."
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
