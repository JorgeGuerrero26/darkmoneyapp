import { differenceInCalendarDays, format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowRight } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { BudgetOverview } from "../../../../types/domain";
import type { SimpleAgendaItem } from "../../lib/simple-view";

type AccountRow = { id: number; name: string; amount: number | null; nativeAmount: number; nativeCurrency: string };
type CategoryRow = { id: number | null; name: string; amount: number };
type Receivables = { count: number; peopleCount: number; firstDate: Date | null; total: number | null };

type Props = {
  now: Date;
  currency: string;
  currencyOptions: string[];
  onCurrencyChange: (currency: string) => void;
  accountTotal: number | null;
  accounts: AccountRow[];
  period: "week" | "month";
  onPeriodChange: (period: "week" | "month") => void;
  income: number;
  expense: number;
  budgets: BudgetOverview[];
  agenda: SimpleAgendaItem[];
  receivables: Receivables;
  categories: CategoryRow[];
  onOpenAccount: (id: number) => void;
  onOpenAccounts: () => void;
  onOpenBudgets: () => void;
  onOpenAgenda: (item: SimpleAgendaItem) => void;
  onOpenReceivables: () => void;
  onOpenAdvanced: () => void;
};

function AmountRow({ title, amount, currency, onPress, tone }: { title: string; amount: number; currency: string; onPress?: () => void; tone?: "in" | "out" }) {
  const content = <><Text style={styles.rowTitle} numberOfLines={1}>{title}</Text><Text style={[styles.rowAmount, tone === "in" && styles.income, (tone === "out" || amount < 0) && styles.expense]}>{tone === "in" ? "+" : tone === "out" || amount < 0 ? "−" : ""}{formatCurrency(Math.abs(amount), currency)}</Text></>;
  return onPress ? <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">{content}</Pressable> : <View style={styles.row}>{content}</View>;
}

export function SimpleDashboard({ now, currency, currencyOptions, onCurrencyChange, accountTotal, accounts, period, onPeriodChange, income, expense, budgets, agenda, receivables, categories, onOpenAccount, onOpenAccounts, onOpenBudgets, onOpenAgenda, onOpenReceivables, onOpenAdvanced }: Props) {
  const monthName = format(now, "LLLL", { locale: es });
  const periodName = period === "month" ? "este mes" : "esta semana";
  const net = income - expense;
  const title = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  return <View style={styles.page}>
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.label}>Tienes en tus cuentas</Text>
        {currencyOptions.length > 1 ? <View style={styles.selector}>{currencyOptions.map((option) => <Pressable key={option} style={[styles.option, option === currency && styles.optionActive]} onPress={() => onCurrencyChange(option)} accessibilityRole="button" accessibilityState={{ selected: option === currency }}><Text style={[styles.optionText, option === currency && styles.optionTextActive]}>{option}</Text></Pressable>)}</View> : null}
      </View>
      <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit>{accountTotal == null ? "Saldo no disponible" : formatCurrency(accountTotal, currency)}</Text>
      <View style={styles.rows}>
        {accounts.map((account) => <AmountRow key={account.id} title={account.name} amount={account.amount ?? account.nativeAmount} currency={account.amount == null ? account.nativeCurrency : currency} onPress={() => onOpenAccount(account.id)} />)}
        {accounts.length === 0 ? <Text style={styles.meta}>Agrega una cuenta para ver tu saldo aquí.</Text> : null}
      </View>
      {accounts.length > 3 ? <Pressable onPress={onOpenAccounts} accessibilityRole="button"><Text style={styles.link}>Ver todas las cuentas</Text></Pressable> : null}
    </View>

    <View style={styles.section}>
      <View style={styles.headingRow}><Text style={styles.title}>{period === "month" ? title : "Esta semana"}</Text><View style={styles.selector}>{(["week", "month"] as const).map((option) => <Pressable key={option} style={[styles.option, period === option && styles.optionActive]} onPress={() => onPeriodChange(option)} accessibilityRole="button" accessibilityState={{ selected: period === option }}><Text style={[styles.optionText, period === option && styles.optionTextActive]}>{option === "week" ? "Semana" : "Mes"}</Text></Pressable>)}</View></View>
      <View style={styles.monthCards}><View style={styles.monthCard}><Text style={styles.meta}>Entró</Text><Text style={styles.monthAmount}>{formatCurrency(income, currency)}</Text></View><View style={styles.monthCard}><Text style={styles.meta}>Salió</Text><Text style={styles.monthAmount}>{formatCurrency(expense, currency)}</Text></View></View>
      <Text style={styles.netSentence}>{net >= 0 ? "Te quedaron " : "Te faltaron "}<Text style={net >= 0 ? styles.income : styles.expense}>{net >= 0 ? "+" : ""}{formatCurrency(Math.abs(net), currency)}</Text> {periodName}</Text>
    </View>

    {budgets.length > 0 ? <View style={styles.section}>
      <Pressable style={styles.headingRow} onPress={onOpenBudgets} accessibilityRole="button"><Text style={styles.title}>Te estás pasando</Text><Text style={styles.meta}>Presupuestos</Text></Pressable>
      <View style={styles.rows}>{budgets.map((budget) => {
        const over = budget.spentAmount > budget.limitAmount;
        const difference = Math.abs(budget.limitAmount - budget.spentAmount);
        const barWidth = `${Math.min(100, Math.max(0, budget.usedPercent))}%` as `${number}%`;
        return <Pressable key={budget.id} style={styles.budgetRow} onPress={onOpenBudgets} accessibilityRole="button">
          <View style={styles.headingRow}><Text style={styles.rowTitle} numberOfLines={1}>{budget.name}</Text><Text style={[styles.rowAmount, over ? styles.expense : styles.warning]}>{over ? `${formatCurrency(difference, budget.currencyCode)} de más` : `Quedan ${formatCurrency(difference, budget.currencyCode)}`}</Text></View>
          <View style={styles.track}><View style={[styles.bar, over ? styles.barExpense : styles.barWarning, { width: barWidth }]} /></View>
          <Text style={styles.meta}>{formatCurrency(budget.spentAmount, budget.currencyCode)} de {formatCurrency(budget.limitAmount, budget.currencyCode)}</Text>
        </Pressable>;
      })}</View>
    </View> : null}

    {(agenda.length > 0 || receivables.count > 0) ? <View style={styles.section}>
      <Text style={styles.title}>Lo que viene</Text>
      <View style={styles.rows}>{agenda.map((item) => <Pressable key={item.key} style={styles.agendaRow} onPress={() => onOpenAgenda(item)} accessibilityRole="button"><View style={styles.rowCopy}><Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.meta}>{format(item.date, "d MMM", { locale: es })} · {differenceInCalendarDays(item.date, now) === 0 ? "hoy" : `en ${differenceInCalendarDays(item.date, now)} días`}</Text></View><Text style={[styles.rowAmount, item.flow === "in" ? styles.income : styles.expense]}>{item.flow === "in" ? "+" : "−"}{formatCurrency(item.amount, item.currency)}</Text></Pressable>)}
        {receivables.count > 0 ? <Pressable style={styles.agendaRow} onPress={onOpenReceivables} accessibilityRole="button"><View style={styles.rowCopy}><Text style={styles.rowTitle}>Te deben</Text><Text style={styles.meta}>{receivables.peopleCount || receivables.count} {receivables.peopleCount === 1 ? "persona" : "personas"}{receivables.firstDate ? ` · primer cobro ${format(receivables.firstDate, "d MMM", { locale: es })}` : ""}</Text></View><Text style={styles.rowAmount}>{receivables.total == null ? "Ver cobros" : formatCurrency(receivables.total, currency)}</Text><ArrowRight size={15} color={COLORS.storm} /></Pressable> : null}
      </View>
    </View> : null}

    {categories.length > 0 ? <View style={styles.section}>
      <Text style={styles.title}>En qué se fue este mes</Text>
      <View style={styles.rows}>{categories.map((category) => <AmountRow key={category.id ?? "none"} title={category.name} amount={category.amount} currency={currency} />)}</View>
      <Pressable style={styles.advancedLink} onPress={onOpenAdvanced} accessibilityRole="button"><Text style={styles.link}>Ver todo en modo avanzado</Text><ArrowRight size={16} color={COLORS.storm} /></Pressable>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  page: { gap: SPACING.xxxl },
  section: { gap: SPACING.md },
  headingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.md },
  label: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  title: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.xl, color: COLORS.ink },
  hero: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, marginBottom: SPACING.sm },
  rows: { gap: 0 },
  row: { minHeight: 55, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  rowTitle: { flex: 1, fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  rowCopy: { flex: 1, gap: SPACING.xs },
  meta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  link: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.fog },
  income: { color: COLORS.income },
  expense: { color: COLORS.expense },
  warning: { color: COLORS.warning },
  selector: { flexDirection: "row", padding: 3, borderRadius: RADIUS.md, backgroundColor: SURFACE.subtle },
  option: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  optionActive: { backgroundColor: SURFACE.input },
  optionText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  optionTextActive: { fontFamily: FONT_FAMILY.bodySemibold, color: COLORS.ink },
  monthCards: { flexDirection: "row", gap: SPACING.md },
  monthCard: { flex: 1, minWidth: 0, padding: SPACING.md, gap: SPACING.xs, borderRadius: RADIUS.xl, backgroundColor: SURFACE.subtle },
  monthAmount: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  netSentence: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: COLORS.fog },
  budgetRow: { paddingVertical: SPACING.md, gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  track: { height: 5, borderRadius: RADIUS.full, backgroundColor: SURFACE.input, overflow: "hidden" },
  bar: { height: 5, borderRadius: RADIUS.full },
  barExpense: { backgroundColor: COLORS.expense },
  barWarning: { backgroundColor: COLORS.warning },
  agendaRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  advancedLink: { minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
