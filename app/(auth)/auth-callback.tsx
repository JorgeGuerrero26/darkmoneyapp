import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { Button } from "../../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from "../../constants/theme";
import { finishGoogleSignIn, type OAuthCallbackParams } from "../../lib/google-sign-in";
import { humanizeError } from "../../lib/errors";

/**
 * Vuelta desde Google: `darkmoney://auth-callback?code=…`. Termina el inicio de sesión (lib/google-sign-in.ts); con la sesión
 * puesta, el guardián de navegación de `app/_layout.tsx` lleva a la app. Vive en el grupo (auth) para que ese guardián no la
 * saque a «iniciar sesión» antes de terminar.
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<OAuthCallbackParams>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    finishGoogleSignIn(params).catch((err) => setError(humanizeError(err)));
  }, [params]);

  return (
    <View style={styles.screen}>
      {error ? (
        <>
          <Text style={styles.title}>No se pudo entrar con Google</Text>
          <Text style={styles.body}>{error}</Text>
          <Button label="Volver a iniciar sesión" onPress={() => router.replace("/(auth)/login")} />
        </>
      ) : (
        <>
          <ActivityIndicator color={COLORS.pine} />
          <Text style={styles.body}>Entrando con Google…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md, padding: SPACING.xl },
  title: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg, color: COLORS.ink, textAlign: "center" },
  body: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, textAlign: "center" },
});
