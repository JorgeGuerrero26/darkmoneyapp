import { FAB } from "../../components/ui/FAB";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react-native";

import { useAuth } from "../../lib/auth-context";
import { humanizeError } from "../../lib/errors";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useWorkspaceSnapshotQuery,
  useDeleteCounterpartyMutation,
  useUpdateCounterpartyMutation,
} from "../../services/queries/workspace-data";
import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { EmptyState } from "../../components/ui/EmptyState";
import { Card } from "../../components/ui/Card";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { ContactForm } from "../../components/forms/ContactForm";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";
import type { CounterpartyOverview } from "../../types/domain";

const TYPE_EMOJI: Record<string, string> = {
  person: "👤", company: "🏢", merchant: "🏪",
  service: "⚙️", bank: "🏦", other: "◦",
};

const TYPE_LABEL: Record<string, string> = {
  person: "Persona", company: "Empresa", merchant: "Comercio",
  service: "Servicio", bank: "Banco", other: "Otro",
};

const REVEAL_WIDTH = 90;

type SwipeableContactRowProps = {
  contact: CounterpartyOverview;
  onPress: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onRestore: () => void;
  canDelete: boolean;
};

function SwipeableContactRow({ contact, onPress, onArchive, onDelete, onRestore, canDelete }: SwipeableContactRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);

  const actionOpacity = translateX.interpolate({
    inputRange: [-REVEAL_WIDTH, -16, 0],
    outputRange: [1, 0.6, 0],
    extrapolate: "clamp",
  });

  const snapTo = (toValue: number, cb?: () => void) => {
    isOpen.current = toValue !== 0;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      tension: 80,
      friction: 11,
    }).start(cb);
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 10,
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, { dx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const next = Math.max(-REVEAL_WIDTH * 1.4, Math.min(0, base + dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, { dx, vx }) => {
        const base = isOpen.current ? -REVEAL_WIDTH : 0;
        const finalX = base + dx;
        if (finalX < -REVEAL_WIDTH / 2 || vx < -0.4) {
          snapTo(-REVEAL_WIDTH);
        } else {
          snapTo(0);
        }
      },
    })
  ).current;

  function handleActionPress() {
    snapTo(0, () => {
      if (contact.isArchived) {
        onRestore();
      } else if (canDelete) {
        onDelete();
      } else {
        onArchive();
      }
    });
  }

  function handleCardPress() {
    if (isOpen.current) {
      snapTo(0);
      return;
    }
    onPress();
  }

  return (
    <View style={styles.swipeContainer}>
      {/* Action revealed on the right */}
      <Animated.View style={[
        styles.actionBg,
        contact.isArchived
          ? styles.actionBgRestore
          : canDelete
            ? styles.actionBgDelete
            : styles.actionBgArchive,
        { opacity: actionOpacity },
      ]}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleActionPress} activeOpacity={0.8}>
          {contact.isArchived
            ? <ArchiveRestore size={20} color={COLORS.pine} strokeWidth={2} />
            : canDelete
              ? <Trash2 size={20} color={COLORS.danger} strokeWidth={2} />
              : <Archive size={20} color={COLORS.ember} strokeWidth={2} />
          }
          <Text
            style={[
              styles.actionLabel,
              contact.isArchived
                ? styles.actionLabelRestore
                : canDelete
                  ? styles.actionLabelDelete
                  : styles.actionLabelArchive,
            ]}
          >
            {contact.isArchived ? "Restaurar" : canDelete ? "Eliminar" : "Archivar"}
          </Text>
        </TouchableOpacity>
      </Animated.View>

      {/* Swipeable card */}
      <Animated.View
        style={{ transform: [{ translateX }] }}
        {...panResponder.panHandlers}
      >
        <Card onPress={handleCardPress} style={styles.card}>
          <View style={styles.row}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>{TYPE_EMOJI[contact.type] ?? "◦"}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{contact.name}</Text>
              <Text style={styles.type}>{TYPE_LABEL[contact.type] ?? contact.type}</Text>
              {contact.phone?.trim() ? (
                <Text style={styles.subMeta} numberOfLines={1}>
                  {contact.phone.trim()}
                </Text>
              ) : contact.email?.trim() ? (
                <Text style={styles.subMeta} numberOfLines={1}>
                  {contact.email.trim()}
                </Text>
              ) : contact.documentNumber?.trim() ? (
                <Text style={styles.subMeta} numberOfLines={1}>
                  Doc. {contact.documentNumber.trim()}
                </Text>
              ) : null}
            </View>
          </View>
        </Card>
      </Animated.View>
    </View>
  );
}

function ContactsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const { showToast } = useToast();

  const { data: snapshot, isLoading } = useWorkspaceSnapshotQuery(profile, activeWorkspaceId);
  const archiveMutation = useUpdateCounterpartyMutation(activeWorkspaceId);
  const deleteMutation = useDeleteCounterpartyMutation(activeWorkspaceId);

  const [createFormVisible, setCreateFormVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CounterpartyOverview | null>(null);

  const counterparties = snapshot?.counterparties ?? [];
  const active = counterparties.filter((c) => !c.isArchived);
  const archived = counterparties.filter((c) => c.isArchived);

  const canDeleteContact = useCallback((contact: CounterpartyOverview) =>
    contact.movementCount === 0 && contact.receivableCount === 0 && contact.payableCount === 0,
  []);

  const handleArchive = useCallback((id: number) => {
    archiveMutation.mutate(
      { id, input: { isArchived: true } },
      {
        onSuccess: () => showToast("Contacto archivado", "success"),
        onError: (e) => showToast(e.message, "error"),
      },
    );
  }, [archiveMutation, showToast]);

  const handleRestore = useCallback((id: number) => {
    archiveMutation.mutate(
      { id, input: { isArchived: false } },
      {
        onSuccess: () => showToast("Contacto restaurado", "success"),
        onError: (e) => showToast(e.message, "error"),
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

  const contactSections = useMemo(() => {
    const sections: Array<{ key: string; data: CounterpartyOverview[] }> = [];
    if (active.length > 0) sections.push({ key: "active", data: active });
    if (archived.length > 0) sections.push({ key: "archived", data: archived });
    return sections;
  }, [active, archived]);

  const renderContactItem = useCallback(({ item: cp }: { item: CounterpartyOverview }) => (
    <SwipeableContactRow
      contact={cp}
      onPress={() => router.push(`/contacts/${cp.id}`)}
      onArchive={() => handleArchive(cp.id)}
      onDelete={() => handleDelete(cp)}
      onRestore={() => handleRestore(cp.id)}
      canDelete={canDeleteContact(cp)}
    />
  ), [router, handleArchive, handleDelete, handleRestore, canDeleteContact]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Contactos" onBack={() => router.replace("/(app)/more")} />

      <SectionList
        sections={contactSections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderContactItem}
        renderSectionHeader={({ section }) =>
          section.key === "archived" ? (
            <Text style={styles.archivedLabel}>
              Archivados ({archived.length})
            </Text>
          ) : null
        }
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : null
        }
        ListEmptyComponent={
          !isLoading && counterparties.length === 0 ? (
            <EmptyState
              title="Sin contactos"
              description="Agrega clientes, proveedores y más."
              action={{ label: "Nuevo contacto", onPress: () => setCreateFormVisible(true) }}
            />
          ) : null
        }
        ItemSeparatorComponent={() => <View style={{ height: SPACING.sm }} />}
        SectionSeparatorComponent={() => <View style={{ height: SPACING.md }} />}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={20}
        contentContainerStyle={styles.listContent}
      />

      <FAB onPress={() => setCreateFormVisible(true)} bottom={insets.bottom + 16} />

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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.bg },
  listContent: { padding: SPACING.lg, paddingBottom: 100 },

  // Swipeable
  swipeContainer: {
    position: "relative",
    overflow: "hidden",
    borderRadius: RADIUS.xl,
  },
  actionBg: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: REVEAL_WIDTH,
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: RADIUS.xl,
    borderBottomLeftRadius: RADIUS.xl,
  },
  actionBgArchive: {
    backgroundColor: COLORS.ember + "30",
  },
  actionBgDelete: {
    backgroundColor: COLORS.danger + "28",
  },
  actionBgRestore: {
    backgroundColor: COLORS.pine + "30",
  },
  actionBtn: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  actionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
  },
  actionLabelArchive: { color: COLORS.ember },
  actionLabelDelete: { color: COLORS.danger },
  actionLabelRestore: { color: COLORS.pine },

  // Card content
  card: { padding: SPACING.md },
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
  name: { fontSize: FONT_SIZE.md, fontFamily: FONT_FAMILY.bodyMedium, color: COLORS.ink },
  type: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 2 },
  subMeta: { fontSize: FONT_SIZE.xs, color: COLORS.storm, marginTop: 4, opacity: 0.9 },

  // Archived section
  archivedSection: { marginTop: SPACING.md, gap: SPACING.sm },
  archivedLabel: { fontSize: FONT_SIZE.sm, color: COLORS.storm, fontFamily: FONT_FAMILY.bodyMedium },
});

export default function ContactsScreenRoot() {
  return (
    <ErrorBoundary>
      <ContactsScreen />
    </ErrorBoundary>
  );
}
