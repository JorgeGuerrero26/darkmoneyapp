import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { useAuth } from "../../lib/auth-context";
import { setPendingDetectedSuggestionNativeId } from "../../lib/pending-detected-suggestion";
import { withTimeout } from "../../lib/promise-utils";
import { useWorkspace } from "../../lib/workspace-context";
import { findDetectedSuggestionIdByNativeId } from "../../services/queries/notification-detection";

/**
 * Único punto de entrada del deep link darkmoney://detected-suggestion/<nativeId>
 * (tap en el cuerpo de la notificación nativa). En cold start la sesión y el
 * workspace todavía no están listos: hay que ESPERAR (mostrando un loader) en vez
 * de redirigir de inmediato a /notifications sin datos — eso producía la pantalla
 * de notificaciones vacía y un back que mostraba solo el fondo de la app.
 */
const RESOLVE_TIMEOUT_MS = 15_000;

export default function DetectedSuggestionRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isLoading: authLoading, session } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const router = useRouter();
  const navigatedRef = useRef(false);
  const mountedAtRef = useRef(Date.now());

  useEffect(() => {
    if (navigatedRef.current) return;
    if (authLoading) return;
    if (!session) {
      // Sin sesión: NavigationGuard redirige a login. Encolar el nativeId para
      // retomar la sugerencia tras el login (mismo patrón que las invitaciones).
      if (id) void setPendingDetectedSuggestionNativeId(decodeURIComponent(id));
      return;
    }

    let cancelled = false;

    function goToNotifications(suggestionId: number | null) {
      if (cancelled || navigatedRef.current) return;
      navigatedRef.current = true;
      // replace: esta pantalla-puente nunca debe quedar en el stack (back mostraría
      // una vista vacía).
      router.replace(
        suggestionId ? `/notifications?suggestionId=${suggestionId}` : "/notifications",
      );
    }

    if (!id) {
      goToNotifications(null);
      return;
    }

    if (!activeWorkspaceId) {
      // Workspace aún cargando: esperar a que el bootstrap lo resuelva. Si nunca llega
      // (sin workspaces, error de red), caer a /notifications tras el timeout.
      const elapsed = Date.now() - mountedAtRef.current;
      const timer = setTimeout(
        () => goToNotifications(null),
        Math.max(0, RESOLVE_TIMEOUT_MS - elapsed),
      );
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    // Timeout corto: en cold start la red puede tardar en despertar y esta query
    // sin límite dejaba al usuario mirando el loader. Peor caso: aterriza en
    // /notifications sin el form abierto, pero aterriza.
    void withTimeout(
      findDetectedSuggestionIdByNativeId(activeWorkspaceId, decodeURIComponent(id)),
      8_000,
      "detected-suggestion.resolve",
    )
      .catch(() => null)
      .then((suggestionId) => goToNotifications(suggestionId));

    return () => {
      cancelled = true;
    };
  }, [id, authLoading, session, activeWorkspaceId, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.label}>Abriendo movimiento detectado…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    backgroundColor: "transparent",
  },
  label: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
  },
});
