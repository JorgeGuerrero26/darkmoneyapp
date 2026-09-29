import { useState } from "react";
import { endOfMonth, format, getDaysInMonth } from "date-fns";
import { es } from "date-fns/locale";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { FutureFlowItem } from "../../lib/dashboard-builders";
import { SummaryDetailSheet } from "./SummaryDetailSheet";

type Props = {
  currency: string;
  balance: number;
  accounts: Array<{ id: number; name: string; amount: number }>;
  committedNet: number;
  variableNet: number;
  projectedIncome: number;
  projectedExpense: number;
  estimatedBalance: number;
  status: string;
  remainingDays: number;
  commitments: FutureFlowItem[];
  /** El mes típico y los meses con que se midió: el mismo dato que resta la proyección. */
  typicalSpend: { typical: number; monthsUsed: number; months: { monthKey: string; total: number }[] };
  asOfDate: Date;
  onClose: () => void;
  onOpenCommitment: (item: FutureFlowItem) => void;
};

export function MonthEndSheet({ currency, balance, accounts, committedNet, variableNet, projectedIncome, projectedExpense, estimatedBalance, status, remainingDays, commitments, typicalSpend, asOfDate, onClose, onOpenCommitment }: Props) {
  const [view, setView] = useState<"summary" | "commitments" | "rhythm">("summary");
  const closingDate = format(endOfMonth(asOfDate), "d MMM", { locale: es });
  const delta = estimatedBalance - balance;
  const signed = (amount: number) => `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatCurrency(Math.abs(amount), currency)}`;

  /*
   * Los días que quedan, contando hoy: la misma cuenta con la que el motor prorratea el mes típico.
   * (`remainingDays` no cuenta hoy, y por eso decía "2 días" cuando el cálculo usaba 3.)
   */
  const daysInMonth = getDaysInMonth(asOfDate);
  const daysLeft = daysInMonth - asOfDate.getDate() + 1;
  const title = view === "summary" ? "Fin de mes" : view === "commitments" ? "Compromisos pendientes" : "Gasto típico del resto del mes";
  const subtitle = view === "summary" ? `Cierre estimado al ${closingDate}` : view === "commitments" ? `Hasta el ${closingDate}` : `Del ${format(asOfDate, "d MMM", { locale: es })} al ${closingDate}`;
  const actionLabel = view === "summary" ? "Ver compromisos pendientes" : "Volver a Fin de mes";
  const onAction = view === "summary" ? () => setView("commitments") : () => setView("summary");

  return (
    <SummaryDetailSheet title={title} subtitle={subtitle} onClose={onClose} actionLabel={actionLabel} onAction={onAction}>
      {view === "summary" ? (
        <>
          <Text style={styles.estimate}>{formatCurrency(estimatedBalance, currency)}</Text>
          <View style={styles.deltaLine}>
            <Text style={styles.delta}><Text style={{ color: delta >= 0 ? COLORS.income : COLORS.expense }}>{signed(delta)}</Text> sobre lo que tienes hoy</Text>
            <View style={styles.statusPill}><Text style={styles.statusText}>{status}</Text></View>
          </View>

          <Text style={styles.kicker}>CÓMO SE LLEGA</Text>
          <View style={styles.formula}>
            <View style={styles.formulaLine}>
              <Text style={styles.formulaTitle}>Hoy en tus cuentas</Text>
              <Text style={styles.formulaAmount}>{formatCurrency(balance, currency)}</Text>
            </View>
            {accounts.length ? accounts.map((account) => (
              <View key={account.id} style={styles.accountLine}>
                <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
                <Text style={styles.accountAmount}>{formatCurrency(account.amount, currency)}</Text>
              </View>
            )) : <Text style={styles.empty}>No hay cuentas incluidas en este saldo.</Text>}

            <TouchableOpacity style={styles.formulaAction} onPress={() => setView("commitments")} activeOpacity={0.82} accessibilityRole="button">
              <View style={styles.formulaCopy}>
                <Text style={styles.formulaTitle}>Compromisos pendientes</Text>
                <Text style={styles.formulaSubtitle}>Suscripciones, cuotas y fijos</Text>
              </View>
              <Text style={[styles.formulaAmount, { color: committedNet >= 0 ? COLORS.income : COLORS.expense }]}>{signed(committedNet)}</Text>
              <ChevronRight size={15} color={COLORS.textDisabled} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.formulaAction} onPress={() => setView("rhythm")} activeOpacity={0.82} accessibilityRole="button">
              <View style={styles.formulaCopy}>
                <Text style={styles.formulaTitle}>Gasto típico</Text>
                <Text style={styles.formulaSubtitle}>Lo que suele salir en {daysLeft} día{daysLeft === 1 ? "" : "s"}</Text>
              </View>
              <Text style={[styles.formulaAmount, { color: variableNet >= 0 ? COLORS.income : COLORS.expense }]}>{signed(variableNet)}</Text>
              <ChevronRight size={15} color={COLORS.textDisabled} />
            </TouchableOpacity>
            <View style={styles.resultLine}>
              <Text style={styles.formulaTitle}>Cierre estimado</Text>
              <Text style={styles.formulaAmount}>{formatCurrency(estimatedBalance, currency)}</Text>
            </View>
          </View>
          <Text style={styles.note}>Es una estimación: si gastas distinto a tu mes típico, el cierre también cambia.</Text>
          {commitments.some((item) => item.amount === null) ? <Text style={styles.warning}>Hay importes sin tipo de cambio; el cierre es parcial.</Text> : null}
        </>
      ) : view === "commitments" ? (
        <>
          <Text style={[styles.detailNet, { color: committedNet >= 0 ? COLORS.income : COLORS.expense }]}>{signed(committedNet)}</Text>
          <Text style={styles.detailIntro}>Cobros y pagos previstos antes de que termine el mes.</Text>
          {commitments.length ? commitments.map((item, index) => (
            <TouchableOpacity key={`${item.source}-${item.id}-${index}`} style={styles.listRow} onPress={() => onOpenCommitment(item)} activeOpacity={0.82} accessibilityRole="button">
              <Text style={styles.day}>{format(item.date, "EEE d", { locale: es })}</Text>
              <View style={styles.listCopy}>
                <Text style={styles.listTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.listMeta}>{item.source === "subscription" ? "Suscripción" : item.source === "obligation" ? "Crédito o deuda" : item.source === "card" ? "Pago de tarjeta" : item.source === "planned" ? "Planificado" : "Ingreso fijo"}</Text>
              </View>
              <Text style={[styles.listAmount, { color: item.direction === "inflow" ? COLORS.income : COLORS.expense }]}>{item.amount === null ? "Sin tasa" : `${item.direction === "inflow" ? "+" : "−"}${formatCurrency(item.amount, currency)}`}</Text>
              <ChevronRight size={15} color={COLORS.textDisabled} />
            </TouchableOpacity>
          )) : <Text style={styles.empty}>No hay compromisos pendientes este mes.</Text>}
        </>
      ) : (
        <>
          {/*
            Antes esta vista listaba lo gastado en el mes, pero el número de arriba es lo que se
            ESPERA gastar en los días que quedan. Mismo título, dos cosas distintas. Ahora explica
            de dónde sale el número que resta.
          */}
          <Text style={[styles.detailNet, { color: variableNet >= 0 ? COLORS.income : COLORS.expense }]}>{signed(variableNet)}</Text>
          <Text style={styles.detailIntro}>
            Tu mes típico es de {formatCurrency(typicalSpend.typical, currency)}. Quedan {daysLeft} de {daysInMonth} días, así que se esperan {formatCurrency(Math.abs(variableNet), currency)} más antes de que cierre el mes.
          </Text>
          <Text style={styles.kicker}>CÓMO SE MIDE EL MES TÍPICO</Text>
          <Text style={styles.detailIntro}>
            Es la mediana de tus últimos {typicalSpend.monthsUsed} {typicalSpend.monthsUsed === 1 ? "mes" : "meses"}: el mes de en medio, no el promedio, para que un mes con compras grandes no se repita en todos los que vienen. No cuenta suscripciones, cuotas ni lo cargado a tarjetas, que ya salen en sus propias líneas.
          </Text>
          {typicalSpend.months.length ? [...typicalSpend.months].reverse().map((month) => (
            <View key={month.monthKey} style={styles.accountLine}>
              <Text style={styles.accountName}>{format(new Date(`${month.monthKey}-15T12:00:00`), "MMMM yyyy", { locale: es })}</Text>
              <Text style={styles.accountAmount}>{formatCurrency(month.total, currency)}</Text>
            </View>
          )) : <Text style={styles.empty}>Todavía no hay meses completos para medirlo.</Text>}
          {typicalSpend.monthsUsed > 0 && typicalSpend.monthsUsed < 3 ? (
            <Text style={styles.warning}>Con menos de tres meses la mediana no puede descartar un mes raro: tómalo con cautela.</Text>
          ) : null}
        </>
      )}
    </SummaryDetailSheet>
  );
}

const styles = StyleSheet.create({
  estimate: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display, color: COLORS.ink, letterSpacing: -1 },
  deltaLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: SPACING.md, marginTop: SPACING.sm },
  delta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  statusPill: { backgroundColor: SURFACE.input, borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  statusText: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, color: COLORS.fog },
  kicker: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.xs, letterSpacing: 1.1, color: COLORS.storm, marginTop: SPACING.xxxl, marginBottom: SPACING.sm },
  formula: { backgroundColor: SURFACE.input, borderRadius: RADIUS.xl, paddingHorizontal: SPACING.md, paddingTop: SPACING.sm },
  formulaLine: { minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm },
  formulaTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
  formulaAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
  accountLine: { minHeight: 26, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.md, paddingLeft: SPACING.md },
  accountName: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  accountAmount: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  formulaAction: { minHeight: 74, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderTopWidth: 1, borderTopColor: SURFACE.separator },
  formulaCopy: { flex: 1, gap: SPACING.xs },
  formulaSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  resultLine: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.textDisabled },
  note: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.md, lineHeight: 20 },
  warning: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.warning, marginTop: SPACING.sm },
  detailNet: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.display },
  detailIntro: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, lineHeight: 20, color: COLORS.storm, marginTop: SPACING.sm, marginBottom: SPACING.lg },
  listRow: { minHeight: 76, flexDirection: "row", alignItems: "center", gap: SPACING.sm, borderBottomWidth: 1, borderBottomColor: SURFACE.separator },
  day: { width: 48, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm },
  listCopy: { flex: 1 },
  listTitle: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.md, color: COLORS.ink },
  listMeta: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, marginTop: SPACING.xs },
  listAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.sm },
  empty: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, paddingVertical: SPACING.lg },
});
