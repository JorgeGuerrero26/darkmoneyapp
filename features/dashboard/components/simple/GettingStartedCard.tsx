import { Text, TouchableOpacity, View } from "react-native";
import { PlusCircle, WalletCards } from "lucide-react-native";

import { Card } from "../../../../components/ui/Card";
import { COLORS } from "../../../../constants/theme";
import { dashboardSimpleStyles as subStyles } from "./styles";

type GettingStartedCardProps = {
  hasAccounts: boolean;
  onCreateMovement: () => void;
  onOpenAccounts: () => void;
};

export function GettingStartedCard({
  hasAccounts,
  onCreateMovement,
  onOpenAccounts,
}: GettingStartedCardProps) {
  const Icon = hasAccounts ? PlusCircle : WalletCards;
  const actionLabel = hasAccounts ? "Registrar movimiento" : "Crear cuenta";
  const body = hasAccounts
    ? "Aún no hay movimientos. Registra el primero y el resumen empezará a mostrar datos reales."
    : "Aún no hay cuentas activas. Crea una cuenta para empezar a ordenar tu dinero.";

  return (
    <Card style={subStyles.simpleStartCard}>
      <View style={subStyles.simpleStartHeader}>
        <View style={subStyles.simpleStartIcon}>
          <Icon size={20} color={COLORS.pine} />
        </View>
        <View style={subStyles.simpleStartCopy}>
          <Text style={subStyles.simpleStartTitle}>Tu tablero está limpio</Text>
          <Text style={subStyles.simpleStartBody}>{body}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={subStyles.simpleStartAction}
        onPress={hasAccounts ? onCreateMovement : onOpenAccounts}
        activeOpacity={0.82}
        accessibilityRole="button"
      >
        <Icon size={17} color={COLORS.textInverse} />
        <Text style={subStyles.simpleStartActionText}>{actionLabel}</Text>
      </TouchableOpacity>
    </Card>
  );
}
