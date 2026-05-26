import { Text, TouchableOpacity, View } from "react-native";
import type { useRouter } from "expo-router";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS } from "../../../../constants/theme";
import { dashboardSimpleStyles as subStyles } from "./styles";

type LeaderItem = {
  id: number;
  title: string;
  direction: string;
  status: string;
  counterparty: string;
  pendingAmount: number;
  currencyCode: string;
};

type LeadersProps = {
  obligations: LeaderItem[];
  router: ReturnType<typeof useRouter>;
};

function ReceivableLeaders({ obligations, router }: LeadersProps) {
  const items = obligations
    .filter((o) => o.direction === "receivable" && o.status === "active")
    .sort((a, b) => b.pendingAmount - a.pendingAmount)
    .slice(0, 3);
  if (items.length === 0) return null;

  return (
    <View style={[subStyles.leadersCard, { borderColor: COLORS.pine + "33" }]}>
      <Text style={[subStyles.leadersTitle, { color: COLORS.pine }]}>Por cobrar</Text>
      {items.map((o, i) => (
        <TouchableOpacity
          key={o.id}
          style={[subStyles.leadersRow, i < items.length - 1 && subStyles.leadersSep]}
          onPress={() => router.push(`/obligation/${o.id}`)}
          activeOpacity={0.75}
        >
          <Text style={subStyles.leadersName} numberOfLines={1}>
            {o.counterparty}
          </Text>
          <Text style={[subStyles.leadersAmt, { color: COLORS.pine }]}>
            {formatCurrency(o.pendingAmount, o.currencyCode)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function PayableLeaders({ obligations, router }: LeadersProps) {
  const items = obligations
    .filter((o) => o.direction === "payable" && o.status === "active")
    .sort((a, b) => b.pendingAmount - a.pendingAmount)
    .slice(0, 3);
  if (items.length === 0) return null;

  return (
    <View style={[subStyles.leadersCard, { borderColor: COLORS.rosewood + "33" }]}>
      <Text style={[subStyles.leadersTitle, { color: COLORS.rosewood }]}>Por pagar</Text>
      {items.map((o, i) => (
        <TouchableOpacity
          key={o.id}
          style={[subStyles.leadersRow, i < items.length - 1 && subStyles.leadersSep]}
          onPress={() => router.push(`/obligation/${o.id}`)}
          activeOpacity={0.75}
        >
          <Text style={subStyles.leadersName} numberOfLines={1}>
            {o.counterparty}
          </Text>
          <Text style={[subStyles.leadersAmt, { color: COLORS.rosewood }]}>
            {formatCurrency(o.pendingAmount, o.currencyCode)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function LeadersRow({ obligations, router }: LeadersProps) {
  const hasReceivable = obligations.some((o) => o.direction === "receivable" && o.status === "active");
  const hasPayable = obligations.some((o) => o.direction === "payable" && o.status === "active");
  if (!hasReceivable && !hasPayable) return null;

  return (
    <View style={subStyles.leadersRowContainer}>
      <ReceivableLeaders obligations={obligations} router={router} />
      <PayableLeaders obligations={obligations} router={router} />
    </View>
  );
}
