import { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { ProFeatureSheet } from "../ui/ProFeatureSheet";
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

  if (r.dataError) return <StatusSheet visible={props.visible} onClose={close} message="No pudimos cargar tus cuentas y categorías" onRetry={r.retryData} />;

  if (r.isPendingEmail && (r.emailProAccess.data !== true || r.emailProAccess.isError)) {
    if (r.emailProAccess.data === false && !r.emailProAccess.isError) return <ProFeatureSheet visible={props.visible} onClose={close} title="Revisa tus pagos con PRO" description={EMAIL_DETECTION_PRO_DESCRIPTION} onViewPro={() => {
      close(); void openDarkMoneyProPlans().catch((error) => showErrorToast("No se pudo abrir los planes PRO", error));
    }} />;
    return <StatusSheet visible={props.visible} onClose={close} message={r.emailProAccess.isError ? "No pudimos verificar tu acceso PRO" : "Verificando tu acceso PRO…"} loading={!r.emailProAccess.isError} onRetry={r.emailProAccess.isError ? () => { void r.emailProAccess.refetch(); } : undefined} />;
  }
  if (!r.suggestion) return <StatusSheet visible={props.visible} onClose={close} loading={!r.suggestionQuery.isError && r.suggestionQuery.isFetching} message={r.suggestionQuery.isError ? "No pudimos cargar la detección" : !r.suggestionQuery.isFetching ? "Esta detección ya no está disponible" : "Cargando los datos…"} onRetry={() => { void r.suggestionQuery.refetch(); }} />;

  const pending = r.suggestion.status === "pending" || r.suggestion.status === "needs_review";
  if (!pending && !props.onResolved) return <BottomSheet visible={props.visible} onClose={close} title="Movimiento detectado" entranceAnimation="springFade" snapHeight={0.45}>
    <View style={styles.status}>
      <Text style={styles.text}>{r.suggestion.status === "discarded" ? "Esta detección fue descartada" : r.suggestion.status === "duplicate" ? "Ya existía el mismo movimiento" : "Este movimiento ya fue guardado"}</Text>
      {r.suggestion.movementId ? <Button label="Ver movimiento" onPress={() => { close(); router.push(`/movement/${r.suggestion!.movementId}?from=${props.origin ?? "notifications"}` as never); }} /> : null}
      <Button label="Cerrar" variant="secondary" onPress={close} />
    </View>
  </BottomSheet>;

  return <>
    {pending && r.initialized ? props.renderPreview?.(r) : null}
    <DetectedMovementReviewSheet visible={props.visible} onClose={close} review={r} list={props.list} position={props.position}
      extras={<DetectedMovementExtras key={r.suggestion.id} review={r} />}
      extraOverlay={r.splitLines ? <SplitCategoriesSheet visible={r.splitSheetOpen} onClose={() => r.setSplitSheetOpen(false)} lines={r.splitLines} onChangeLines={r.setSplitLines} categories={r.categories} totalAmount={parsePositiveAmountInput(r.amount) ?? 0} currencyCode={r.selectedBudgetAccount?.currencyCode ?? r.suggestion.currencyCode} movementLabel={r.description.trim() || "Movimiento detectado"} movementType={r.movementType === "income" ? "income" : "expense"} spendTypes={r.spendTypes} /> : undefined} />
  </>;
}

function StatusSheet({ visible, onClose, message, loading, onRetry }: { visible: boolean; onClose: () => void; message: string; loading?: boolean; onRetry?: () => void }) {
  return <BottomSheet visible={visible} onClose={onClose} title="Movimiento detectado" entranceAnimation="springFade" snapHeight={0.4}>
    <View style={styles.status}>{loading ? <ActivityIndicator color={COLORS.storm} /> : null}<Text style={styles.text}>{message}</Text>{!loading && onRetry ? <Button label="Reintentar" onPress={onRetry} /> : null}</View>
  </BottomSheet>;
}
const styles = StyleSheet.create({ status: { gap: SPACING.md, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg }, text: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.storm } });
