import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";

import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useUpdateCounterpartyMutation,
  useWorkspaceSnapshotQuery,
} from "../../services/queries/workspace-data";
import { useToast } from "../../hooks/useToast";
import type { CounterpartyOverview } from "../../types/domain";
import { Card } from "../../components/ui/Card";
import { SkeletonCard, SkeletonList } from "../../components/ui/Skeleton";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ContactForm } from "../../components/forms/ContactForm";
import { COLORS, FONT_FAMILY, FONT_SIZE, FONT_WEIGHT, SPACING } from "../../constants/theme";

import { useContactAnalytics } from "../../features/contacts/lib/useContactAnalytics";
import { ContactDetailHeader } from "../../features/contacts/components/ContactDetailHeader";
import { ContactDetailQuickActions } from "../../features/contacts/components/ContactDetailQuickActions";
import { ContactDetailRelationCard } from "../../features/contacts/components/ContactDetailRelationCard";
import { ContactDetailFinancials } from "../../features/contacts/components/ContactDetailFinancials";
import { ContactDetailProgrammed } from "../../features/contacts/components/ContactDetailProgrammed";

function parseContactId(raw: string | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { handleBack } = useOriginBackNavigation();
  const { profile } = useAuth();
  const { activeWorkspaceId, activeWorkspace } = useWorkspace();
  const { showToast } = useToast();

  const [editFormVisible, setEditFormVisible] = useState(false);

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveMutation = useUpdateCounterpartyMutation(activeWorkspaceId);

  const contactId = parseContactId(id);
  const contact: CounterpartyOverview | null = useMemo(() => {
    if (contactId == null) return null;
    return (snapshot?.counterparties ?? []).find((c) => c.id === contactId) ?? null;
  }, [snapshot, contactId]);

  const baseCurrency = activeWorkspace?.baseCurrencyCode ?? "PEN";
  const analytics = useContactAnalytics({ contact, snapshot, baseCurrency });

  const noContactData =
    contact != null &&
    !contact.phone?.trim() &&
    !contact.email?.trim() &&
    !contact.documentNumber?.trim();

  function handleArchive() {
    if (!contact) return;
    archiveMutation.mutate(
      { id: contact.id, input: { isArchived: true } },
      {
        onSuccess: () => {
          showToast("Contacto archivado", "success");
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        },
        onError: (err) => showToast(humanizeError(err), "error"),
      },
    );
  }

  function handleRestore() {
    if (!contact) return;
    archiveMutation.mutate(
      { id: contact.id, input: { isArchived: false } },
      {
        onSuccess: () => {
          showToast("Contacto restaurado", "success");
          void queryClient.invalidateQueries({ queryKey: ["workspace-snapshot"] });
        },
        onError: (err) => showToast(humanizeError(err), "error"),
      },
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={contact?.name ?? "Contacto"}
        subtitle={activeWorkspace?.name}
        onBack={handleBack}
      />

      {isLoading ? (
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
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ContactDetailHeader contact={contact} lastActivityAt={analytics?.lastActivityAt ?? null} />

          <ContactDetailQuickActions
            contact={contact}
            onEdit={() => setEditFormVisible(true)}
            onArchive={handleArchive}
            onRestore={handleRestore}
          />

          {analytics ? (
            <ContactDetailRelationCard
              contact={contact}
              analytics={analytics}
              baseCurrency={baseCurrency}
            />
          ) : null}

          <Card>
            <Text style={styles.sectionTitle}>Datos de contacto</Text>
            <ContactDataList contact={contact} onEdit={() => setEditFormVisible(true)} hasNoData={noContactData} />
          </Card>

          {analytics ? (
            <ContactDetailFinancials
              contact={contact}
              analytics={analytics}
              baseCurrency={baseCurrency}
            />
          ) : null}

          {analytics ? (
            <ContactDetailProgrammed analytics={analytics} baseCurrency={baseCurrency} />
          ) : null}

          {contact.notes ? (
            <Card>
              <Text style={styles.sectionTitle}>Notas</Text>
              <Text style={styles.notes}>{contact.notes}</Text>
            </Card>
          ) : null}
        </ScrollView>
      )}

      {contact ? (
        <ContactForm
          visible={editFormVisible}
          onClose={() => setEditFormVisible(false)}
          onSuccess={() => setEditFormVisible(false)}
          editContact={contact}
        />
      ) : null}
    </View>
  );
}

function ContactDataList({
  contact,
  onEdit,
  hasNoData,
}: {
  contact: CounterpartyOverview;
  onEdit: () => void;
  hasNoData: boolean;
}) {
  if (hasNoData) {
    return (
      <View style={styles.emptyData}>
        <Text style={styles.emptyDataHint}>Sin teléfono, correo ni documento registrados.</Text>
        <Text style={styles.emptyDataCta} onPress={onEdit}>
          Agregar datos de contacto
        </Text>
      </View>
    );
  }

  const rows: { label: string; value: string }[] = [];
  if (contact.phone?.trim()) rows.push({ label: "Teléfono", value: contact.phone.trim() });
  if (contact.email?.trim()) rows.push({ label: "Correo", value: contact.email.trim() });
  if (contact.documentNumber?.trim()) {
    rows.push({ label: "DNI / RUC", value: contact.documentNumber.trim() });
  }

  return (
    <>
      {rows.map((row, index) => (
        <View key={row.label}>
          {index > 0 ? <View style={rowStyles.divider} /> : null}
          <View style={rowStyles.row}>
            <Text style={rowStyles.label}>{row.label}</Text>
            <Text style={rowStyles.value}>{row.value}</Text>
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.lg, gap: SPACING.sm },
  errorTitle: { color: COLORS.text, fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.semibold },
  errorBody: { color: COLORS.textMuted, fontSize: FONT_SIZE.sm, textAlign: "center" },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.xs,
  },
  notes: { fontSize: FONT_SIZE.sm, color: COLORS.text, lineHeight: 20 },
  emptyData: { gap: SPACING.sm },
  emptyDataHint: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontStyle: "italic" },
  emptyDataCta: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.primary,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
});

const rowStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: SPACING.md },
  label: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, flex: 1 },
  value: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: FONT_WEIGHT.medium,
    flex: 2,
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: SPACING.sm },
});

export default function ContactDetailScreenRoot() {
  return (
    <ErrorBoundary>
      <ContactDetailScreen />
    </ErrorBoundary>
  );
}
