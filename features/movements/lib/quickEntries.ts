import type { MovementType } from "../../../types/domain";
import type { SpendingHabit } from "./spendingHabits";

type Template = {
  id: number;
  name: string;
  movementType: MovementType;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  sourceAmount: number | null;
  destinationAmount: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  description: string;
  notes: string | null;
};

export type QuickEntry = {
  key: string;
  label: string;
  amount: number;
  movementType: MovementType;
  sourceAccountId: number | null;
  destinationAccountId: number | null;
  categoryId: number | null;
  counterpartyId: number | null;
  notes: string | null;
  /** `pinned` lo elegiste tú y sale siempre; `habit` lo dedujo la app y sale cuando encaja. */
  origin: "pinned" | "habit";
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
}

function templateAmount(template: Template): number {
  const amount = template.movementType === "income"
    ? template.destinationAmount
    : template.sourceAmount;
  return Number.isFinite(Number(amount)) ? Number(amount) : 0;
}

/**
 * Los atajos de la fila: los que fijaste tú y los que dedujo la app, en ese orden.
 *
 * **Lo explícito va primero y sale siempre.** Un atajo que fijaste es una decisión tuya; la app
 * no tiene por qué esconderlo porque la hora no cuadre. Lo deducido, en cambio, solo aparece
 * cuando encaja con el momento — si no, es una lista de todo lo que gastas, no una sugerencia.
 *
 * **Y no se repiten.** Si fijaste "Moto S/ 2.00" y la app además lo detecta como hábito, se ve
 * una vez: la tuya, que es la que puedes renombrar y borrar.
 */
export function buildQuickEntries(
  templates: Template[],
  habits: SpendingHabit[],
): QuickEntry[] {
  const pinned: QuickEntry[] = [];
  const taken = new Set<string>();

  for (const template of templates) {
    const amount = templateAmount(template);
    // Sin monto no hay un toque: la plantilla abriría el formulario, que es otra cosa.
    if (amount <= 0) continue;
    const label = (template.name || template.description || "").trim();
    if (!label) continue;

    taken.add(`${normalize(template.description || label)}|${amount.toFixed(2)}`);
    pinned.push({
      key: `t${template.id}`,
      label,
      amount,
      movementType: template.movementType,
      sourceAccountId: template.sourceAccountId,
      destinationAccountId: template.destinationAccountId,
      categoryId: template.categoryId,
      counterpartyId: template.counterpartyId,
      notes: template.notes,
      origin: "pinned",
    });
  }

  const detected: QuickEntry[] = habits
    .filter((habit) => !taken.has(`${normalize(habit.label)}|${habit.amount.toFixed(2)}`))
    .map((habit) => ({
      key: habit.key,
      label: habit.label,
      amount: habit.amount,
      movementType: "expense" as const,
      sourceAccountId: habit.accountId,
      destinationAccountId: null,
      categoryId: habit.categoryId,
      counterpartyId: null,
      notes: null,
      origin: "habit" as const,
    }));

  return [...pinned, ...detected];
}
