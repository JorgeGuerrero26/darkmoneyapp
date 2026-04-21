export type FinancialGraphNodeKind = "account" | "category" | "counterparty" | "flow";

export type FinancialGraphFlowKind = "income" | "expense" | "transfer";

export type FinancialGraphRankNode = {
  id: string;
  kind: FinancialGraphNodeKind;
  entityId: number | null;
  flowKind?: FinancialGraphFlowKind;
  label: string;
  score: number;
  amount: number;
  movementCount: number;
  reason: string;
};

type BuildFinancialGraphRankInput<TMovement> = {
  movements: TMovement[];
  getAmount: (movement: TMovement) => number;
  getAccountIds: (movement: TMovement) => Array<number | null | undefined>;
  getCategoryId: (movement: TMovement) => number | null;
  getCounterpartyId: (movement: TMovement) => number | null;
  getFlowKind: (movement: TMovement) => FinancialGraphFlowKind;
  accountNames?: ReadonlyMap<number, string>;
  categoryNames?: ReadonlyMap<number, string>;
  counterpartyNames?: ReadonlyMap<number, string>;
  limit?: number;
};

type RawNode = {
  id: string;
  kind: FinancialGraphNodeKind;
  entityId: number | null;
  flowKind?: FinancialGraphFlowKind;
  label: string;
};

type NodeStats = RawNode & {
  amount: number;
  movementCount: number;
};

const DAMPING = 0.85;
const ITERATIONS = 18;

function nodeKey(kind: FinancialGraphNodeKind, value: number | string | null) {
  return `${kind}:${value ?? "none"}`;
}

function flowLabel(kind: FinancialGraphFlowKind) {
  if (kind === "income") return "Ingresos";
  if (kind === "expense") return "Gastos";
  return "Transferencias";
}

function reasonForNode(node: FinancialGraphRankNode) {
  if (node.kind === "account") {
    return "Esta cuenta conecta varios movimientos importantes. Es como mirar la caja donde más se mueve el dinero.";
  }
  if (node.kind === "category") {
    return node.entityId == null
      ? "Muchos movimientos pasan sin categoría. Eso puede ocultar de qué producto o hábito sale el dinero."
      : "Esta categoría concentra conexiones y monto. Si la entiendes, entiendes una parte grande de tu gasto o ingreso.";
  }
  if (node.kind === "counterparty") {
    return "Esta persona o negocio aparece conectado a movimientos relevantes. Conviene saber si es normal o si creció.";
  }
  return "Este tipo de movimiento domina la lectura reciente. Sirve para saber si hoy pesan más entradas, salidas o traspasos.";
}

function addEdge(adjacency: Map<string, Map<string, number>>, left: string, right: string, weight: number) {
  if (left === right) return;
  const leftEdges = adjacency.get(left) ?? new Map<string, number>();
  leftEdges.set(right, (leftEdges.get(right) ?? 0) + weight);
  adjacency.set(left, leftEdges);

  const rightEdges = adjacency.get(right) ?? new Map<string, number>();
  rightEdges.set(left, (rightEdges.get(left) ?? 0) + weight);
  adjacency.set(right, rightEdges);
}

export function buildFinancialGraphRank<TMovement>({
  movements,
  getAmount,
  getAccountIds,
  getCategoryId,
  getCounterpartyId,
  getFlowKind,
  accountNames,
  categoryNames,
  counterpartyNames,
  limit = 4,
}: BuildFinancialGraphRankInput<TMovement>): FinancialGraphRankNode[] {
  const nodeStats = new Map<string, NodeStats>();
  const adjacency = new Map<string, Map<string, number>>();

  function upsertNode(raw: RawNode, amount: number) {
    const current = nodeStats.get(raw.id);
    if (current) {
      current.amount += amount;
      current.movementCount += 1;
      return current;
    }
    const created: NodeStats = { ...raw, amount, movementCount: 1 };
    nodeStats.set(raw.id, created);
    if (!adjacency.has(raw.id)) adjacency.set(raw.id, new Map());
    return created;
  }

  for (const movement of movements) {
    const amount = Math.abs(getAmount(movement));
    if (amount <= 0.009) continue;

    const rawNodes: RawNode[] = [];
    const flowKind = getFlowKind(movement);
    rawNodes.push({
      id: nodeKey("flow", flowKind),
      kind: "flow",
      entityId: null,
      flowKind,
      label: flowLabel(flowKind),
    });

    for (const accountId of Array.from(new Set(getAccountIds(movement).filter((id): id is number => id != null)))) {
      rawNodes.push({
        id: nodeKey("account", accountId),
        kind: "account",
        entityId: accountId,
        label: accountNames?.get(accountId) ?? `Cuenta ${accountId}`,
      });
    }

    const categoryId = getCategoryId(movement);
    rawNodes.push({
      id: nodeKey("category", categoryId),
      kind: "category",
      entityId: categoryId,
      label: categoryId == null ? "Sin categoría" : categoryNames?.get(categoryId) ?? `Categoría ${categoryId}`,
    });

    const counterpartyId = getCounterpartyId(movement);
    if (counterpartyId != null) {
      rawNodes.push({
        id: nodeKey("counterparty", counterpartyId),
        kind: "counterparty",
        entityId: counterpartyId,
        label: counterpartyNames?.get(counterpartyId) ?? `Contacto ${counterpartyId}`,
      });
    }

    const uniqueNodes = Array.from(new Map(rawNodes.map((node) => [node.id, node])).values());
    for (const node of uniqueNodes) upsertNode(node, amount);

    const edgeWeight = 1 + Math.log1p(amount);
    for (let i = 0; i < uniqueNodes.length; i += 1) {
      for (let j = i + 1; j < uniqueNodes.length; j += 1) {
        addEdge(adjacency, uniqueNodes[i].id, uniqueNodes[j].id, edgeWeight);
      }
    }
  }

  const nodes = Array.from(nodeStats.values());
  const nodeCount = nodes.length;
  if (nodeCount === 0) return [];

  let ranks = new Map(nodes.map((node) => [node.id, 1 / nodeCount]));
  for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
    const next = new Map(nodes.map((node) => [node.id, (1 - DAMPING) / nodeCount]));

    for (const node of nodes) {
      const edges = adjacency.get(node.id);
      if (!edges || edges.size === 0) continue;
      const totalWeight = Array.from(edges.values()).reduce((sum, weight) => sum + weight, 0);
      if (totalWeight <= 0) continue;
      const currentRank = ranks.get(node.id) ?? 0;
      for (const [neighborId, weight] of edges.entries()) {
        next.set(neighborId, (next.get(neighborId) ?? 0) + DAMPING * currentRank * (weight / totalWeight));
      }
    }

    ranks = next;
  }

  const maxRank = Math.max(...nodes.map((node) => ranks.get(node.id) ?? 0), 0.000001);
  const maxAmount = Math.max(...nodes.map((node) => node.amount), 1);
  const maxCount = Math.max(...nodes.map((node) => node.movementCount), 1);

  const ranked = nodes
    .map((node): FinancialGraphRankNode => {
      const rankPart = ((ranks.get(node.id) ?? 0) / maxRank) * 72;
      const amountPart = (node.amount / maxAmount) * 18;
      const countPart = (node.movementCount / maxCount) * 10;
      const score = Math.max(1, Math.min(100, Math.round(rankPart + amountPart + countPart)));
      const item: FinancialGraphRankNode = {
        id: node.id,
        kind: node.kind,
        entityId: node.entityId,
        flowKind: node.flowKind,
        label: node.label,
        score,
        amount: node.amount,
        movementCount: node.movementCount,
        reason: "",
      };
      return { ...item, reason: reasonForNode(item) };
    })
    .sort((a, b) => b.score - a.score || b.amount - a.amount || b.movementCount - a.movementCount);

  const result: FinancialGraphRankNode[] = [];
  let flowIncluded = false;
  for (const node of ranked) {
    if (node.kind === "flow") {
      if (flowIncluded) continue;
      flowIncluded = true;
    }
    result.push(node);
    if (result.length >= limit) break;
  }

  return result;
}
