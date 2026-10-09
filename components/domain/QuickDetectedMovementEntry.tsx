import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "../ui/Button";
import { ProFeatureActions, ProFeatureContent } from "../ui/ProFeatureSheet";
import { useToast } from "../../hooks/useToast";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { useDetectedMovementReview, type DetectedMovementReview } from "../../features/detected-movements/hooks/useDetectedMovementReview";
import { DetectedMovementReviewSheet } from "../../features/detected-movements/components/DetectedMovementReviewSheet";
import { DetectedMovementExtras } from "../../features/detected-movements/components/DetectedMovementExtras";
import { SplitCategoriesSheet } from "../../features/movements/components/form/SplitCategoriesSheet";
import { parsePositiveAmountInput } from "../../lib/amount-parsing";
import type { DetectionDraft } from "../../features/detected-movements/lib/review-draft";
import { EMAIL_DETECTION_PRO_DESCRIPTION, openDarkMoneyProPlans } from "../../features/settings/lib/email-detection-pro";

type Props = {
  visible: boolean;
  suggestionId: number | null;
  notificationId?: number | null;
  onClose: () => void;
  onResolved?: (id: number, status: "registered" | "discarded" | "duplicate") => void;
  initialDraft?: DetectionDraft;
  onDraftChange?: (id: number, draft: DetectionDraft) => void;
  previewEnabled?: boolean;
  renderPreview?: (review: DetectedMovementReview) => ReactNode;
  list?: ReactNode;
  position?: string;
  origin?: "dashboard" | "notifications";
};

/** Un único controlador de registro para el dashboard y Notificaciones. */
export function QuickDetectedMovementEntry(props: Props) {
  const r = useDetectedMovementReview(props);
  const router = useRouter();
  const { showErrorToast } = useToast();
  const draftKey = JSON.stringify(r.draft);
  useEffect(() => {
    if (r.initialized && r.suggestion) props.onDraftChange?.(r.suggestion.id, JSON.parse(draftKey) as DetectionDraft);
  }, [draftKey, r.initialized, r.suggestion?.id, props.onDraftChange]);
  const close = () => { if (!r.busy) props.onClose(); };

  const pending = r.suggestion?.status === "pending" || r.suggestion?.status === "needs_review";
  let status: { title: string; content: ReactNode; height: number; footer?: ReactNode } | undefined;
  if (r.suggestion && !pending) {
    status = { title: r.suggestion.status === "discarded" ? "Detección omitida" : "Movimiento detectado", height: 0.45, content: <View style={styles.status}>
      <Text style={styles.text}>{r.suggestion.status === "discarded" ? "Omitiste esta detección. No se creó un movimiento y ya no aparece entre los pendientes del dashboard." : r.suggestion.status === "duplicate" ? "Ya existía el mismo movimiento" : "Este movimiento ya fue guardado"}</Text>
      {r.suggestion.movementId ? <Button label="Ver movimiento" onPress={() => { close(); router.push(`/movement/${r.suggestion!.movementId}?from=${props.origin ?? "notifications"}` as never); }} /> : null}
      <Button label="Cerrar" variant="secondary" onPress={close} />
    </View> };
  } else if (r.dataError) {
    status = { title: "Movimiento detectado", height: 0.4, content: <StatusContent message="No pudimos cargar tus cuentas y categorías" onRetry={r.retryData} /> };
  } else if (r.isPendingEmail && (r.emailProAccess.data !== true || r.emailProAccess.isError)) {
    const proRequired = r.emailProAccess.data === false && !r.emailProAccess.isError;
    status = proRequired ? { title: "Disponible con PRO", height: 0.48,
      content: <ProFeatureContent title="Revisa tus pagos con PRO" description={EMAIL_DETECTION_PRO_DESCRIPTION} />,
      footer: <ProFeatureActions onClose={close} onViewPro={() => { close(); void openDarkMoneyProPlans().catch((error) => showErrorToast("No se pudo abrir los planes PRO", error)); }} />,
    } : { title: "Movimiento detectado", height: 0.4, content: <StatusContent message={r.emailProAccess.isError ? "No pudimos verificar tu acceso PRO" : "Verificando tu acceso PRO…"} loading={!r.emailProAccess.isError} onRetry={r.emailProAccess.isError ? () => { void r.emailProAccess.refetch(); } : undefined} /> };
  } else if (!r.suggestion) {
    status = { title: "Movimiento detectado", height: 0.4, content: <StatusContent loading={!r.suggestionQuery.isError && r.suggestionQuery.isFetching} message={r.suggestionQuery.isError ? "No pudimos cargar la detección" : !r.suggestionQuery.isFetching ? "Esta detección ya no está disponible" : "Cargando los datos…"} onRetry={() => { void r.suggestionQuery.refetch(); }} /> };
  }

  return <>
    {pending && r.initialized && !status ? props.renderPreview?.(r) : null}
    {/* Un único Modal: cambiar el estado no desmonta una ventana nativa presentada en iOS. */}
    <DetectedMovementReviewSheet visible={props.visible} onClose={close} review={r} list={props.list} position={props.position} status={status}
      extras={r.suggestion ? <DetectedMovementExtras key={r.suggestion.id} review={r} /> : undefined}
      overlay={r.splitLines ? <SplitCategoriesSheet visible={r.splitSheetOpen} onClose={() => r.setSplitSheetOpen(false)} lines={r.splitLines} onChangeLines={r.setSplitLines} categories={r.categories} totalAmount={parsePositiveAmountInput(r.amount) ?? 0} currencyCode={r.selectedBudgetAccount?.currencyCode ?? r.suggestion?.currencyCode ?? "PEN"} movementLabel={r.description.trim() || "Movimiento detectado"} movementType={r.movementType === "income" ? "income" : "expense"} spendTypes={r.spendTypes} /> : undefined} />
  </>;
}

function StatusContent({ message, loading, onRetry }: { message: string; loading?: boolean; onRetry?: () => void }) {
  return <View style={styles.status}>{loading ? <ActivityIndicator color={COLORS.storm} /> : null}<Text style={styles.text}>{message}</Text>{!loading && onRetry ? <Button label="Reintentar" onPress={onRetry} /> : null}</View>;
}
const styles = StyleSheet.create({ status: { gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }, text: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm } });
