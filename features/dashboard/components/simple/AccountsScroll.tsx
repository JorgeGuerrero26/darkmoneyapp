import { Text, TouchableOpacity, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { getAccountIcon } from "../../../../lib/account-icons";
import { accountTypeLabel } from "../../../accounts/lib/account-types";
import { SectionTitle } from "./SectionTitle";
import { dashboardSimpleStyles as subStyles } from "./styles";

type AccountItem = {
  id: number;
  name: string;
  type: string;
  icon: string;
  currentBalance: number;
  currencyCode: string;
  color: string;
};

type AccountsScrollProps = {
  accounts: AccountItem[];
  onPress: (id: number) => void;
  onViewAll: () => void;
};

export function AccountsScroll({ accounts, onPress, onViewAll }: AccountsScrollProps) {
  if (accounts.length === 0) return null;
  return (
    <View>
      <View style={subStyles.ledgerSectionHeading}>
        <SectionTitle>Cuentas</SectionTitle>
        <TouchableOpacity onPress={onViewAll} accessibilityRole="button" accessibilityLabel="Ver todas las cuentas">
          <Text style={subStyles.ledgerSectionAction}>Ver todas</Text>
        </TouchableOpacity>
      </View>
      <View style={subStyles.accountsRow}>
        {accounts.slice(0, 3).map((a, index) => {
          const Icon = getAccountIcon(a.icon, a.type);
          return (
            <TouchableOpacity
              key={a.id}
              style={[subStyles.accountChip, index > 0 && subStyles.ledgerRowBorder]}
              onPress={() => onPress(a.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${a.name}, ${formatCurrency(a.currentBalance, a.currencyCode)}`}
            >
              <View style={[subStyles.accountChipIcon, { backgroundColor: a.color + "33" }]}>
                <Icon size={14} color={a.color} />
              </View>
              <View style={subStyles.accountChipCopy}>
                <Text style={subStyles.accountChipName} numberOfLines={1}>{a.name}</Text>
                <Text style={subStyles.accountChipType} numberOfLines={1}>{accountTypeLabel(a.type)}</Text>
              </View>
              <Text style={[subStyles.accountChipBalance, a.currentBalance < 0 && { color: COLORS.expense }]}>
                {formatCurrency(a.currentBalance, a.currencyCode)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
