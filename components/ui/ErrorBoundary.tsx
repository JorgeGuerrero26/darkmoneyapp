import { Component, type ReactNode } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Props = {
  children: ReactNode;
  fallbackTitle?: string;
};

type State = { hasError: boolean; message: string };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : String(error);
    return { hasError: true, message };
  }

  reset = () => this.setState({ hasError: false, message: "" });

  render() {
    if (!this.state.hasError) return this.props.children;

    const title = this.props.fallbackTitle ?? "Algo salió mal";

    return (
      <View style={styles.container}>
        <AlertTriangle size={32} color={COLORS.gold} strokeWidth={1.5} />
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message} numberOfLines={3}>{this.state.message}</Text>
        <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.8}>
          <Text style={styles.btnText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    gap: SPACING.md,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.lg,
    color: COLORS.ink,
    textAlign: "center",
  },
  message: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    textAlign: "center",
  },
  btn: {
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.xl,
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
