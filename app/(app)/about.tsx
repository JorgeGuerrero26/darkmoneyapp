import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ScreenHeader } from "../../components/layout/ScreenHeader";
import { ErrorBoundary } from "../../components/ui/ErrorBoundary";
import { LearningMaturity } from "../../features/dashboard/components/advanced/LearningMaturity";
import { useOriginBackNavigation } from "../../hooks/useOriginBackNavigation";
import { useAuth } from "../../lib/auth-context";
import { useWorkspace } from "../../lib/workspace-context";
import {
  useDashboardAnalyticsQuery,
  useDashboardMovementsQuery,
} from "../../services/queries/workspace-data";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";

/**
 * Acerca de: dónde vive el relato de cómo la app aprende.
 *
 * La Revisión 06 lo sacó de la pestaña Salud —~1.400 px que medían el producto y no las finanzas
 * del usuario— y lo trajo aquí, "donde la curiosidad se busca a propósito".
 */
function AboutScreen() {
  const insets = useSafeAreaInsets();
  const { handleBack } = useOriginBackNavigation({ originRoutes: { settings: "/(app)/settings" } });
  const { profile } = useAuth();
  const { activeWorkspaceId } = useWorkspace();

  const { data: movements = [] } = useDashboardMovementsQuery(activeWorkspaceId, profile?.id);
  const { data: analytics } = useDashboardAnalyticsQuery(activeWorkspaceId, profile?.id);

  const acceptedFeedbackCount = useMemo(
    () =>
      analytics?.learningFeedback.filter(
        (feedback) =>
          feedback.feedbackKind === "accepted_category_suggestion" ||
          feedback.feedbackKind === "manual_category_change",
      ).length ?? 0,
    [analytics?.learningFeedback],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title="Acerca de" onBack={handleBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + SPACING.xxxl }]}>
        <LearningMaturity movements={movements} acceptedFeedbackCount={acceptedFeedbackCount} />

        {Constants.expoConfig?.version ? (
          <Text style={styles.version}>DarkMoney {Constants.expoConfig.version}</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

export default function AboutScreenRoot() {
  return (
    <ErrorBoundary>
      <AboutScreen />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.canvas },
  content: { padding: SPACING.lg, gap: SPACING.md },
  version: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    textAlign: "center",
    marginTop: SPACING.md,
  },
});
