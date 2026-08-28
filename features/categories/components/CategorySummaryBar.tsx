
import { MetricSummaryBar } from "../../../components/ui/MetricSummaryBar";

type Props = {
  totalCount: number;
  activeCount: number;
  systemCount: number;
};

export function CategorySummaryBar({ totalCount, activeCount, systemCount }: Props) {
  const propias = totalCount - systemCount;
  const partes = [
    `${totalCount} categoría${totalCount === 1 ? "" : "s"}`,
    activeCount === totalCount ? "todas activas" : `${activeCount} activa${activeCount === 1 ? "" : "s"}`,
  ];
  if (systemCount > 0) partes.push(`${propias} tuya${propias === 1 ? "" : "s"}`);

  // Sin cifra: un conteo de categorías no merece 32px ni es dinero.
  return <MetricSummaryBar support={partes.join(" · ")} />;
}
