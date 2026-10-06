import { useMemo, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { MoreVertical, Pencil, Phone, Mail } from "lucide-react-native";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useToggleCounterpartyPinMutation,
  useUpdateCounterpartyMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import type { CounterpartyOverview } from "../../types/domain";
import { ResourceModuleTemplate } from "../../components/ui/ResourceModuleTemplate";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { EntityActionSheet } from "../../components/ui/EntityActionSheet";
import { HeaderActionGroup } from "../../components/ui/HeaderActionGroup";
import { ContactForm } from "../../components/forms/ContactForm";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";

import { useContactAnalytics } from "../../features/contacts/lib/useContactAnalytics";
import { ContactDetailHeader } from "../../features/contacts/components/ContactDetailHeader";
import { ContactDetailFacts } from "../../features/contacts/components/ContactDetailFacts";
import { ContactDetailActivity } from "../../features/contacts/components/ContactDetailActivity";
import { contactActivitySections, type ContactActivityItem } from "../../features/contacts/lib/contactActivitySections";
import { DetailActionBar } from "../../components/ui/DetailActionBar";
import { DetailTabs } from "../../components/ui/DetailTabs";
import { useUiStore } from "../../store/ui-store";

const DETAIL_TABS = [{ id: "details", label: "Detalles" }, { id: "activity", label: "Actividad" }];

function parseContactId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ContactDetailScreen() {
  useUiStore((state) => state.privacyMode);
  const router = useRouter();
  const [detailTab, setDetailTab] = useState("details");
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { handleBack } = useOriginBackNavigation({ defaultRoute: "/(app)/contacts", originRoutes: { contacts: "/(app)/contacts" } });
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast, showErrorToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);

  const [editFormVisible, setEditFormVisible] = useState(false);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveMutation = useUpdateCounterpartyMutation(activeWorkspaceId);
  const togglePinMutation = useToggleCounterpartyPinMutation(activeWorkspaceId);

  const contactId = parseContactId(id);
  const contact: CounterpartyOverview | null = useMemo(() => {
    if (contactId == null) return null;
    return (snapshot?.counterparties ?? []).find((c) => c.id === contactId) ?? null;
  }, [snapshot, contactId]);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const analytics = useContactAnalytics({ contact, snapshot, baseCurrency });

  const activitySections = useMemo(() => contactActivitySections(snapshot, contactId ?? 0), [snapshot, contactId]);
  const phone = contact?.phone?.replace(/[^\d+]/g, "") ?? "";
  const email = contact?.email?.trim() ?? "";
  async function openContactUrl(url: string) {
    try { await Linking.openURL(url); }
    catch (error) { showErrorToast("No se pudo abrir la aplicaci\u00f3n", error); }
  }
  function openActivity(item: ContactActivityItem) {
    if (item.kind === "obligation") router.push(`/obligation/${item.id}`);
    else if (item.kind === "subscription") router.push(`/subscription/${item.id}`);
    else router.push(`/recurring-income/${item.id}`);
  }

  function handleArchive() {
    if (!contact) return;
    archiveMutation.mutate(
      { id: contact.id, input: { isArchived: true } },
      {
        onSuccess: () => {
          showToast("Contacto archivado", "success", contact.name);
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        },
        onError: (err) => showErrorToast("No se pudo archivar el contacto", err),
      },
    );
  }

  function handleRestore() {
    if (!contact) return;
    archiveMutation.mutate(
      { id: contact.id, input: { isArchived: false } },
      {
        onSuccess: () => {
          showToast("Contacto restaurado", "success", contact.name);
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        },
        onError: (err) => showErrorToast("No se pudo restaurar el contacto", err),
      },
    );
  }

  function handleTogglePin() {
    if (!contact) return;
    togglePinMutation.mutate(
      { id: contact.id, isPinned: !contact.isPinned },
      { onError: (err) => showErrorToast(contact.isPinned ? "No se pudo desfijar el contacto" : "No se pudo fijar el contacto", err) },
    );
  }

  return (
    <ResourceModuleTemplate
      topInset={insets.top}
      header={
        <>
        <ScreenHeader
          title="Contacto"
          onBack={handleBack}
          rightAction={
            contact ? (
              /* Un alfiler tachado dice lo mismo que un alfiler: no se sabe si está fijado o
                 si al tocarlo lo fijas. Con nombre, en el menú. */
              <HeaderActionGroup
                actions={[{
                  key: "menu",
                  icon: MoreVertical,
                  onPress: () => setMenuOpen(true),
                  accessibilityLabel: "Más acciones",
                }]}
              />
            ) : null
          }
        />
        {contact ? <View style={styles.tabs}><DetailTabs tabs={DETAIL_TABS} activeTab={detailTab} onChange={setDetailTab} /></View> : null}
        </>
      }
      list={
        isLoading ? (
          <SkeletonList>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </SkeletonList>
        ) : !contact ? (
          <View style={styles.center}>
            <Text style={styles.errorTitle}>Contacto no encontrado</Text>
            <Text style={styles.errorBody}>
              {contactId == null
                ? "El identificador del contacto no es válido."
                : "Es posible que el contacto haya sido eliminado."}
            </Text>
          </View>
        ) : detailTab === "activity" && analytics ? (
          <ContactDetailActivity analytics={analytics} movementCount={contact.movementCount} baseCurrency={baseCurrency} sections={activitySections} onOpen={openActivity} />
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <ContactDetailHeader contact={contact} lastActivityAt={contact.lastActivityAt ?? null} />
            <ContactDetailFacts contact={contact} onPhone={() => void openContactUrl(`tel:${phone}`)} onEmail={() => void openContactUrl(`mailto:${email}`)} />
          </ScrollView>
        )
      }
      fab={contact ? (
        <DetailActionBar bottomInset={insets.bottom} primarySide={phone || email ? "right" : "left"}
          secondary={phone || email ? { label: "Editar", accessibilityLabel: "Editar contacto", icon: Pencil, onPress: () => setEditFormVisible(true) } : undefined}
          primary={phone ? { label: "Llamar", accessibilityLabel: "Llamar al contacto", icon: Phone, onPress: () => void openContactUrl(`tel:${phone}`) }
            : email ? { label: "Enviar correo", accessibilityLabel: "Enviar correo al contacto", icon: Mail, onPress: () => void openContactUrl(`mailto:${email}`) }
            : { label: "Editar", accessibilityLabel: "Editar contacto", icon: Pencil, onPress: () => setEditFormVisible(true) }} />
      ) : null}
      overlays={
        contact ? (
          <>
            <EntityActionSheet
              visible={menuOpen}
              onClose={() => setMenuOpen(false)}
              sheetTitle="Más acciones"
              summaryTitle={contact.name}
              actions={[
                {
                  key: "pin",
                  label: contact.isPinned ? "Quitar de fijados" : "Fijar en la lista",
                  variant: "ghost",
                  onPress: () => { setMenuOpen(false); handleTogglePin(); },
                },
                {
                  key: "archive",
                  label: contact.isArchived ? "Restaurar contacto" : "Archivar contacto",
                  variant: "ghost",
                  disabled: archiveMutation.isPending,
                  onPress: () => { setMenuOpen(false); contact.isArchived ? handleRestore() : handleArchive(); },
                },
                ...(phone ? [{ key: "whatsapp", label: "Abrir WhatsApp", variant: "ghost" as const, onPress: () => { setMenuOpen(false); void openContactUrl(`https://wa.me/${phone.replace(/^\+/, "")}`); } }] : []),
                ...(email ? [{ key: "email", label: "Enviar correo", variant: "ghost" as const, onPress: () => { setMenuOpen(false); void openContactUrl(`mailto:${email}`); } }] : []),
              ]}
            />
            <ContactForm
              visible={editFormVisible}
              onClose={() => setEditFormVisible(false)}
              onSuccess={() => setEditFormVisible(false)}
              editContact={contact}
            />
          </>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: SPACING.xl },
  scroll: { flex: 1 },
  content: { paddingHorizontal: SPACING.xl, gap: SPACING.lg, paddingBottom: SPACING.xxxl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.lg, gap: SPACING.sm },
  errorTitle: { color: COLORS.ink, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md },
  errorBody: { color: COLORS.storm, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, textAlign: "center" },
});

export default function ContactDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <ContactDetailScreen />
    </ErrorBoundary>
  );
}
