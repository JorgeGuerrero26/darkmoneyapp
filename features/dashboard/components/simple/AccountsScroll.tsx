import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { getAccountIcon } from "../../../../lib/account-icons";
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
};

export function AccountsScroll({ accounts, onPress }: AccountsScrollProps) {
  if (accounts.length === 0) return null;
  return (
    <View>
      <SectionTitle>Cuentas</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={subStyles.accountsRow}>
          {accounts.map((a) => {
            const Icon = getAccountIcon(a.icon, a.type);
            return (
              <TouchableOpacity
                key={a.id}
                style={subStyles.accountChip}
                onPress={() => onPress(a.id)}
                activeOpacity={0.75}
              >
                <View style={[subStyles.accountChipIcon, { backgroundColor: a.color + "33" }]}>
                  <Icon size={14} color={a.color} />
                </View>
                <Text style={subStyles.accountChipName} numberOfLines={1}>
                  {a.name}
                </Text>
                <Text style={[subStyles.accountChipBalance, a.currentBalance < 0 && { color: COLORS.expense }]}>
                  {formatCurrency(a.currentBalance, a.currencyCode)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
