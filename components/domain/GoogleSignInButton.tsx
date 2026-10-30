import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "../ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";
import { isGoogleSignInEnabled, startGoogleSignIn } from "../../lib/google-sign-in";
import { humanizeError } from "../../lib/errors";

/**
 * «Continuar con Google» con su separador. Abre Google en el navegador del teléfono; la vuelta a la app la termina la ruta
 * `app/(auth)/auth-callback.tsx` (ver lib/google-sign-in.ts). Aquí solo se avisa si no se pudo abrir.
 */
export function GoogleSignInButton({ disabled }: { disabled?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo aparece si Google está activado en Supabase (ver isGoogleSignInEnabled).
  useEffect(() => {
    let cancelled = false;
    void isGoogleSignInEnabled().then((value) => { if (!cancelled) setEnabled(value); });
    return () => { cancelled = true; };
  }, []);

  async function handlePress() {
    if (opening) return;
    setError(null);
    setOpening(true);
    try {
      await startGoogleSignIn();
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setOpening(false);
    }
  }

  if (!enabled) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>o</Text>
        <View style={styles.dividerLine} />
      </View>
      <Button
        label="Continuar con Google"
        variant="secondary"
        loading={opening}
        loadingLabel="Abriendo Google…"
        disabled={disabled || opening}
        onPress={() => void handlePress()}
        accessibilityLabel="Continuar con Google"
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACING.sm },
  divider: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  dividerLine: { flex: 1, height: 0.5, backgroundColor: SURFACE.separator },
  dividerText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: COLORS.storm },
  error: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.danger },
});
