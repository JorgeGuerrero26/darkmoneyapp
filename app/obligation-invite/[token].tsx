import { Redirect, useLocalSearchParams, type Href } from "expo-router";

/** Compatibilidad: rutas antiguas → misma pantalla que la web (`/share/obligations/:token`). */
export default function LegacyObligationInviteRedirect() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const raw = Array.isArray(token) ? token[0] : token;
  if (!raw || typeof raw !== "string") {
    return <Redirect href="/(auth)/login" />;
  }
  const href = `/share/obligations/${encodeURIComponent(raw)}` as Href;
  return <Redirect href={href} />;
}
