import { Plus } from "lucide-react-native";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useUpdateCounterpartyMutation,
} from "../../services/queries/workspace-data";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { Card } from "../../components/ui/Card";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ContactForm } from "../../components/forms/ContactForm";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACING } from "../../constants/theme";

const TYPE_EMOJI: Record<string, string> = {
  person: "👤", company: "🏢", merchant: "🏪",
  service: "⚙️", bank: "🏦", other: "◦",
};

const TYPE_LABEL: Record<string, string> = {
  person: "Persona", company: "Empresa", merchant: "Comercio",
  service: "Servicio", bank: "Banco", other: "Otro",
};

export default function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveMutation = useUpdateCounterpartyMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);

  const counterparties = snapshot?.counterparties ?? [];
  const active = counterparties.filter((c) => !c.isArchived);
  const archived = counterparties.filter((c) => c.isArchived);

  function handleArchive(id: number, name: string) {
    Alert.alert("Archivar contacto", `¿Archivar a "${name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Archivar",
        onPress: () => archiveMutation.mutate(
          { id, input: { isArchived: true } },
          { onSuccess: () => showToast("Contacto archivado", "success"), onError: (e) => showToast(e.message, "error") },
        ),
      },
    ]);
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Contactos" />

      <ScrollView contentContainerStyle={styles.content}>
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : counterparties.length === 0 ? (
          <EmptyState
            title="Sin contactos"
            description="Agrega clientes, proveedores y más."
            action={{ label: "Nuevo contacto", onPress: () => setCreateFormVisible(true) }}
          />
        ) : null}

        {active.map((cp) => (
          <Card key={cp.id} onPress={() => router.push(`/contacts/${cp.id}`)}>
            <View style={styles.row}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{TYPE_EMOJI[cp.type] ?? "◦"}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{cp.name}</Text>
                <Text style={styles.type}>{TYPE_LABEL[cp.type] ?? cp.type}</Text>
              </View>
              <TouchableOpacity
                style={styles.archiveBtn}
                onPress={() => handleArchive(cp.id, cp.name)}
              >
                <Text style={styles.archiveBtnText}>Archivar</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ))}

        {archived.length > 0 ? (
          <View style={styles.archivedSection}>
            <Text style={styles.archivedLabel}>Archivados ({archived.length})</Text>
            {archived.map((cp) => (
              <Card key={cp.id} style={styles.archivedCard}>
                <View style={styles.row}>
                  <Text style={styles.archivedName}>{cp.name}</Text>
                  <TouchableOpacity
                    onPress={() => archiveMutation.mutate(
                      { id: cp.id, input: { isArchived: false } },
                      { onSuccess: () => showToast("Contacto restaurado", "success") },
                    )}
                  >
                    <Text style={styles.restoreText}>Restaurar</Text>
                  </TouchableOpacity>
                </View>
              </Card>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        activeOpacity={0.85}
        onPress={() => setCreateFormVisible(true)}
        accessibilityLabel="Nuevo contacto"
      >
        <Plus size={22} color="#FFF" />
      </TouchableOpacity>

      <ContactForm
        visible={createFormVisible}
        onClose={() => setCreateFormVisible(false)}
        onSuccess={() => setCreateFormVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  content: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: 100 },
  row: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgInput,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18 },
  info: { flex: 1 },
  name: { fontSize: FONT_SIZE.md, fontWeight: FONT_WEIGHT.medium, color: COLORS.text },
  type: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted, marginTop: 2 },
  archiveBtn: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  archiveBtnText: { fontSize: FONT_SIZE.xs, color: COLORS.textMuted },
  archivedSection: { marginTop: SPACING.md, gap: SPACING.sm },
  archivedLabel: { fontSize: FONT_SIZE.sm, color: COLORS.textMuted, fontWeight: FONT_WEIGHT.medium },
  archivedCard: { opacity: 0.5, padding: SPACING.md },
  archivedName: { flex: 1, fontSize: FONT_SIZE.md, color: COLORS.textMuted },
  restoreText: { fontSize: FONT_SIZE.xs, color: COLORS.primary },
  fab: {
    position: "absolute",
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
});
