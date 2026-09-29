const React = require("react");
const { act, create } = require("react-test-renderer");
import { Text, TouchableOpacity } from "react-native";
import { PatternsTab } from "../features/dashboard/components/advanced/PatternsTab";
import { weeklySpendPattern } from "../features/dashboard/lib/patterns-view";
import type { DashboardMovementRow } from "../features/dashboard/lib/dashboard-row";

jest.mock("lucide-react-native", () => ({ ArrowRight: () => null, Sparkles: () => null }));

function textValue(value: unknown): string {
  return Array.isArray(value) ? value.map(textValue).join("") : typeof value === "string" || typeof value === "number" ? String(value) : "";
}

const expense: DashboardMovementRow = {
  id: 1, movementType: "expense", status: "posted", occurredAt: "2026-09-28T10:00:00",
  sourceAmount: 44.5, destinationAmount: 0, sourceAccountId: 1, destinationAccountId: null,
  categoryId: 1, spendTypeId: null, counterpartyId: null, description: "Cena",
};

it("puts the actionable pattern first and opens the exact anomaly list", () => {
  const onReviewAnomalies = jest.fn();
  const onOpenRemainingCategories = jest.fn();
  let root: any;
  act(() => {
    root = create(React.createElement(PatternsTab, {
      anomalies: [{ key: "1", movementId: 1, title: "Cena", amount: 44.5, baselineAmount: 4.4,
        occurredAt: expense.occurredAt, body: "", meta: "", level: "strong", score: 90, reasons: [] }],
      rises: [{ categoryId: 1, name: "Salud", previous: 14, current: 328.9, delta: 314.9, movementIds: [1] }],
      habits: [{ label: "Cena", title: "Cena", accountName: null, type: "Gasto", categoryId: 1,
        category: "Salud", total: 44.5, count: 2, average: 22.25, movementIds: [1],
        lastAt: expense.occurredAt, lastLabel: "28 sep", confidence: 90, variantCount: 1, reason: "" }],
      categoryTotals: new Map([[1, 60], [2, 50], [3, 40], [4, 30], [5, 20], [6, 10]]), categoryNames: new Map([[1, "Salud"]]),
      accountNames: new Map([[1, "Cuenta Principal"]]), movements: [expense], currency: "PEN",
      weeklySpend: weeklySpendPattern([expense], (row) => row.sourceAmount, new Date("2026-09-29T12:00:00")),
      onReviewAnomalies, onOpenAnomaly: jest.fn(), onOpenAi: jest.fn(), onOpenRise: jest.fn(),
      onOpenCategory: jest.fn(), onOpenRemainingCategories, onOpenDay: jest.fn(), onOpenHabit: jest.fn(),
    }));
  });

  const texts = root.root.findAllByType(Text).map((node: any) => textValue(node.props.children));
  const headings = ["Fuera de costumbre", "Informe con IA", "Lo que subió", "En qué se va", "Tu día más caro: lunes", "Lo que se repite"];
  expect(headings.map((label) => texts.indexOf(label))).toEqual([...headings.map((label) => texts.indexOf(label))].sort((a, b) => a - b));
  expect(headings.every((label) => texts.includes(label))).toBe(true);

  const review = root.root.findAllByType(TouchableOpacity).find((node: any) =>
    node.findAllByType(Text).some((textNode: any) => textValue(textNode.props.children) === "Revisar los 1"));
  expect(review).toBeDefined();
  act(() => review.props.onPress());
  expect(onReviewAnomalies).toHaveBeenCalledWith([1]);
  const remaining = root.root.findAllByType(TouchableOpacity).find((node: any) =>
    node.findAllByType(Text).some((textNode: any) => textValue(textNode.props.children) === "1 categoría más"));
  expect(remaining).toBeDefined();
  act(() => remaining.props.onPress());
  expect(onOpenRemainingCategories).toHaveBeenCalledWith([6]);
  act(() => root.unmount());
});
