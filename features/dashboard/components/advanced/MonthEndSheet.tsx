import { useState } from "react";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { formatCurrency } from "../../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../../constants/theme";
import type { FutureFlowItem } from "../../lib/dashboard-builders";
import { SummaryDetailSheet } from "./SummaryDetailSheet";

export type MonthRhythmMovement = {
  id: number;
  title: string;
  date: Date;
  direction: "inflow" | "outflow";
  amount: number;
};

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
  rhythmMovements: MonthRhythmMovement[];
  asOfDate: Date;
  onClose: () => void;
  onOpenCommitment: (item: FutureFlowItem) => void;
  onOpenMovement: (id: number) => void;
  onOpenAllMovements: () => void;
};

export function MonthEndSheet({ currency, balance, accounts, committedNet, variableNet, projectedIncome, projectedExpense, estimatedBalance, status, remainingDays, commitments, rhythmMovements, asOfDate, onClose, onOpenCommitment, onOpenMovement, onOpenAllMovements }: Props) {
  const [view, setView] = useState<"summary" | "commitments" | "rhythm">("summary");
  const closingDate = format(endOfMonth(asOfDate), "d MMM", { locale: es });
  const monthStart = format(startOfMonth(asOfDate), "d MMM", { locale: es });
  const delta = estimatedBalance - balance;
  const signed = (amount: number) => `${amount > 0 ? "+" : amount < 0 ? "−" : ""}${formatCurrency(Math.abs(amount), currency)}`;

  const title = view === "summary" ? "Fin de mes" : view === "commitments" ? "Compromisos pendientes" : "Tu ritmo habitual";
  const subtitle = view === "summary" ? `Cierre estimado al ${closingDate}` : view === "commitments" ? `Hasta el ${closingDate}` : `Movimientos del ${monthStart} a hoy`;
  const actionLabel = view === "summary" ? "Ver compromisos pendientes" : view === "commitments" ? "Volver a Fin de mes" : "Ver todos los movimientos";
  const onAction = view === "summary" ? () => setView("commitments") : view === "commitments" ? () => setView("summary") : onOpenAllMovements;

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
                <Text style={styles.formulaTitle}>Tu ritmo habitual</Text>
                <Text style={styles.formulaSubtitle}>Proyección para {remainingDays} día{remainingDays === 1 ? "" : "s"}</Text>
              </View>
              <Text style={[styles.formulaAmount, { color: variableNet >= 0 ? COLORS.income : COLORS.expense }]}>{signed(variableNet)}</Text>
              <ChevronRight size={15} color={COLORS.textDisabled} />
            </TouchableOpacity>
            <View style={styles.resultLine}>
              <Text style={styles.formulaTitle}>Cierre estimado</Text>
              <Text style={styles.formulaAmount}>{formatCurrency(estimatedBalance, currency)}</Text>
            </View>
          </View>
          <Text style={styles.note}>Es una estimación: si tu ritmo cambia, el cierre también.</Text>
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
                <Text style={styles.listMeta}>{item.source === "subscription" ? "Suscripción" : item.source === "obligation" ? "Crédito o deuda" : "Ingreso fijo"}</Text>
              </View>
              <Text style={[styles.listAmount, { color: item.direction === "inflow" ? COLORS.income : COLORS.expense }]}>{item.amount === null ? "Sin tasa" : `${item.direction === "inflow" ? "+" : "−"}${formatCurrency(item.amount, currency)}`}</Text>
              <ChevronRight size={15} color={COLORS.textDisabled} />
            </TouchableOpacity>
          )) : <Text style={styles.empty}>No hay compromisos pendientes este mes.</Text>}
        </>
      ) : (
        <>
          <Text style={[styles.detailNet, { color: variableNet >= 0 ? COLORS.income : COLORS.expense }]}>{signed(variableNet)}</Text>
          <Text style={styles.detailIntro}>Entran {formatCurrency(projectedIncome, currency)} · salen {formatCurrency(projectedExpense, currency)} en {remainingDays} día{remainingDays === 1 ? "" : "s"} restante{remainingDays === 1 ? "" : "s"}. La proyección parte del promedio de este mes y ajusta los gastos por día de la semana cuando hay suficiente historial. Un movimiento puntual puede alterar el promedio.</Text>
          <Text style={styles.kicker}>MOVIMIENTOS QUE FORMAN EL PROMEDIO</Text>
          {rhythmMovements.slice(0, 30).map((movement) => (
            <TouchableOpacity key={movement.id} style={styles.listRow} onPress={() => onOpenMovement(movement.id)} activeOpacity={0.82} accessibilityRole="button">
              <Text style={styles.day}>{format(movement.date, "d MMM", { locale: es })}</Text>
              <View style={styles.listCopy}><Text style={styles.listTitle} numberOfLines={1}>{movement.title}</Text></View>
              <Text style={[styles.listAmount, { color: movement.direction === "inflow" ? COLORS.income : COLORS.expense }]}>{movement.direction === "inflow" ? "+" : "−"}{formatCurrency(movement.amount, currency)}</Text>
              <ChevronRight size={15} color={COLORS.textDisabled} />
            </TouchableOpacity>
          ))}
          {rhythmMovements.length > 30 ? <Text style={styles.note}>Se muestran 30 de {rhythmMovements.length} movimientos. Puedes verlos todos abajo.</Text> : null}
          {!rhythmMovements.length ? <Text style={styles.empty}>Sin movimientos para estimar el ritmo.</Text> : null}
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
