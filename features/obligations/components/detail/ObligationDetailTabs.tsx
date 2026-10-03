import { DetailTabs } from "../../../../components/ui/DetailTabs";

export type ObligationDetailTab = "details" | "activity" | "requests";

type Props = {
  activeTab: ObligationDetailTab;
  showRequests: boolean;
  requestCount: number;
  onChange: (tab: ObligationDetailTab) => void;
};

export function ObligationDetailTabs({ activeTab, showRequests, requestCount, onChange }: Props) {
  const tabs: Array<{ id: ObligationDetailTab; label: string }> = [
    { id: "details", label: "Detalles" },
    { id: "activity", label: "Actividad" },
    ...(showRequests ? [{ id: "requests" as const, label: requestCount ? `Solicitudes (${requestCount})` : "Solicitudes" }] : []),
  ];
  return <DetailTabs tabs={tabs} activeTab={activeTab} onChange={onChange} />;
}
