import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../../../constants/theme";
import { logError } from "../../../../lib/error-logger";

type Props = {
  children: ReactNode;
  /** Etiqueta de la sección que se está renderizando (ej: "Patrones", "Salud"). */
  sectionLabel: string;
};

type State = { hasError: boolean; message: string };

/**
 * ErrorBoundary inline para una sola sección/tab del dashboard.
 * A diferencia del global, no ocupa la pantalla completa: muestra una Card de
 * error con CTA para reintentar y deja el resto del dashboard funcionando.
 *
 * Pasos las excepciones a logError para que queden registradas en Supabase
 * con la etiqueta de la sección que falló.
 */
export class DashboardSectionBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const message = error instanceof Error ? error.message : String(error);
    logError("dashboard_section_boundary", message, {
      section: this.props.sectionLabel,
      stack: error instanceof Error ? error.stack : undefined,
      componentStack: info.componentStack ?? undefined,
    });
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Card>
        <View style={styles.row}>
          <AlertTriangle size={20} color={COLORS.gold} strokeWidth={1.5} />
          <View style={styles.copy}>
            <Text style={styles.title}>No pudimos cargar “{this.props.sectionLabel}”</Text>
            <Text style={styles.message} numberOfLines={3}>
              {this.state.message}
            </Text>
          </View>
        </View>
        <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.82}>
          <Text style={styles.btnText}>Reintentar</Text>
        </TouchableOpacity>
      </Card>
    );
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
  },
  copy: { flex: 1, gap: 4 },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  message: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
  },
  btn: {
    marginTop: SPACING.md,
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: RADIUS.full,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.15)",
  },
  btnText: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
});
