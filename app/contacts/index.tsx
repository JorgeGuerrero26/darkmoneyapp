import { useCallback, useMemo, useState } from "react";
import type { SectionListRenderItem } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, Download, Users } from "lucide-react-native";
import { format } from "date-fns";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { FAB } from "../../components/ui/FAB";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { FilterToolbar } from "../../components/ui/FilterToolbar";
import { ActiveFilterBar, type ActiveFilterItem } from "../../components/ui/ActiveFilterBar";
import { MetricSummaryBar } from "../../components/ui/MetricSummaryBar";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { ResourceSectionList, type ResourceSection } from "../../components/ui/ResourceSectionList";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ContactCard, type ContactMetrics } from "../../components/domain/ContactCard";
import { ContactForm } from "../../components/forms/ContactForm";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { shareCsvAsFile } from "../../lib/share-csv-file";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDeleteCounterpartyMutation,
  useUpdateCounterpartyMutation,
} from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { COLORS } from "../../constants/theme";
import type { CounterpartyOverview, CounterpartyType } from "../../types/domain";

type ContactTypeFilter = CounterpartyType | "all";
type ContactListSection = ResourceSection<CounterpartyOverview, "active" | "archived">;

const TYPE_FILTERS: { label: string; value: ContactTypeFilter }[] = [
  { label: "Todos", value: "all" },
  { label: "Personas", value: "person" },
  { label: "Empresas", value: "company" },
  { label: "Comercios", value: "merchant" },
  { label: "Servicios", value: "service" },
  { label: "Bancos", value: "bank" },
  { label: "Otros", value: "other" },
];

const TYPE_LABELS: Record<CounterpartyType, string> = {
  person: "Persona",
  company: "Empresa",
  merchant: "Comercio",
  service: "Servicio",
  bank: "Banco",
  other: "Otro",
};

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function buildContactCSV(contacts: CounterpartyOverview[], metricsById: Map<number, ContactMetrics>) {
  const BOM = "\uFEFF";
  const headers = [
    "Nombre",
    "Tipo",
    "Telefono",
    "Email",
    "Documento",
    "Archivado",
    "Movimientos",
    "Por cobrar",
    "Por pagar",
    "Suscripciones",
    "Ingresos fijos",
    "Notas",
  ];
  const rows = contacts.map((contact) => {
    const metrics = metricsById.get(contact.id);
    return [
      contact.name,
      TYPE_LABELS[contact.type] ?? contact.type,
      contact.phone ?? "",
      contact.email ?? "",
      contact.documentNumber ?? "",
      contact.isArchived ? "Si" : "No",
      metrics?.movementCount ?? contact.movementCount,
      metrics?.receivablePendingTotal ?? 0,
      metrics?.payablePendingTotal ?? 0,
      metrics?.subscriptionCount ?? 0,
      metrics?.recurringIncomeCount ?? 0,
      contact.notes ?? "",
    ].map(csvEscape).join(",");
  });
  return BOM + [headers.join(","), ...rows].join("\n");
}

function getContactMetricSeed(contact: CounterpartyOverview): ContactMetrics {
  return {
    movementCount: contact.movementCount,
    receivablePendingTotal: 0,
    payablePendingTotal: 0,
    subscriptionCount: 0,
    recurringIncomeCount: 0,
  };
}

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

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CounterpartyOverview | null>(null);
  const [searchText, setSearchText] = useState("");
  const [typeFilters, setTypeFilters] = useState<ContactTypeFilter[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const counterparties = snapshot?.counterparties ?? [];
  const obligations = snapshot?.obligations ?? [];
  const subscriptions = snapshot?.subscriptions ?? [];
  const recurringIncome = snapshot?.recurringIncome ?? [];

  const contactMetricsById = useMemo(() => {
    const map = new Map<number, ContactMetrics>();
    const contactById = new Map(counterparties.map((contact) => [contact.id, contact]));

    function ensureMetrics(contactId: number) {
      const current = map.get(contactId);
      if (current) return current;
      const contact = contactById.get(contactId);
      const next = contact ? getContactMetricSeed(contact) : {
        movementCount: 0,
        receivablePendingTotal: 0,
        payablePendingTotal: 0,
        subscriptionCount: 0,
        recurringIncomeCount: 0,
      };
      map.set(contactId, next);
      return next;
    }

    for (const obligation of obligations) {
      if (obligation.counterpartyId == null || obligation.status === "cancelled") continue;
      const metrics = ensureMetrics(obligation.counterpartyId);
      if (obligation.direction === "receivable") {
        metrics.receivablePendingTotal += obligation.pendingAmount;
      } else {
        metrics.payablePendingTotal += obligation.pendingAmount;
      }
    }

    for (const subscription of subscriptions) {
      if (subscription.vendorPartyId == null) continue;
      ensureMetrics(subscription.vendorPartyId).subscriptionCount += 1;
    }

    for (const income of recurringIncome) {
      if (income.payerPartyId == null) continue;
      ensureMetrics(income.payerPartyId).recurringIncomeCount += 1;
    }

    return map;
  }, [counterparties, obligations, recurringIncome, subscriptions]);

  const filteredContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return counterparties.filter((contact) => {
      if (!showArchived && contact.isArchived) return false;
      if (typeFilters.length > 0 && !typeFilters.includes(contact.type)) return false;
      if (query) {
        const haystack = [
          contact.name,
          contact.type,
          contact.phone,
          contact.email,
          contact.documentNumber,
          contact.notes,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [counterparties, searchText, showArchived, typeFilters]);

  const activeContacts = filteredContacts.filter((contact) => !contact.isArchived);
  const archivedContacts = filteredContacts.filter((contact) => contact.isArchived);

  const contactSections = useMemo<ContactListSection[]>(() => {
    const sections: ContactListSection[] = [];
    if (activeContacts.length > 0) {
      sections.push({ key: "active", label: "Activos", data: activeContacts, headerVariant: "hidden" });
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
  }, [activeContacts, archivedContacts]);

  const activeFilterItems = useMemo<ActiveFilterItem[]>(() => {
    const items: ActiveFilterItem[] = typeFilters.map((type) => ({
      key: `type-${type}`,
      label: TYPE_FILTERS.find((filter) => filter.value === type)?.label ?? "Tipo",
      onRemove: () => setTypeFilters((current) => current.filter((value) => value !== type)),
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
  }, [searchText, showArchived, typeFilters]);

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

  const hasFilters = typeFilters.length > 0 || showArchived || Boolean(searchText.trim());
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
    setTypeFilters([]);
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

  const renderContactItem: SectionListRenderItem<CounterpartyOverview, ContactListSection> = useCallback(({ item }) => (
    <ContactCard
      contact={item}
      metrics={contactMetricsById.get(item.id)}
      onPress={() => router.push(`/contacts/${item.id}`)}
      onArchive={() => handleArchive(item.id)}
      onDelete={() => handleDelete(item)}
      onRestore={() => handleRestore(item.id)}
      canDelete={canDeleteContact(item)}
    />
  ), [canDeleteContact, contactMetricsById, handleArchive, handleDelete, handleRestore, router]);

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <ScreenHeader
          title="Contactos"
          onBack={handleBack}
          rightAction={
            <HeaderActionGroup
              actions={[{
                key: "export",
                icon: Download,
                onPress: () => exportCSV(filteredContacts),
                accessibilityLabel: "Exportar CSV",
              }]}
            />
          }
        />
      }
      toolbar={
        <FilterToolbar
          options={TYPE_FILTERS}
          selectedValues={typeFilters}
          onSelectedValuesChange={(values) => {
            setTypeFilters(values.filter((value): value is CounterpartyType => value !== "all"));
          }}
          allValue="all"
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
      }
      activeFilters={<ActiveFilterBar items={activeFilterItems} onClear={clearContactFilters} />}
      summary={
        filteredContacts.length > 0 ? (
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
      fab={<FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />}
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
            onConfirm={async () => {
              if (!deleteTarget) return;
              try {
                await deleteMutation.mutateAsync(deleteTarget.id);
                showToast("Contacto eliminado", "success");
                setDeleteTarget(null);
              } catch (error: unknown) {
                showToast(humanizeError(error), "error");
              }
            }}
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
