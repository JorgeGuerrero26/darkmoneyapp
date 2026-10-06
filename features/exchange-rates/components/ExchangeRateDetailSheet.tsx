import { Pencil, RefreshCw } from "lucide-react-native";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ResourceDetailSheet } from "../../../components/ui/ResourceDetailSheet";
import type { ExchangeRateRecord } from "../../../services/queries/exchange-rates";

type Props = {
  rate: ExchangeRateRecord | null; onClose: () => void; onEdit: () => void;
  onSync: () => void; onPin: () => void; onDelete: () => void;
  syncing: boolean; pinPending: boolean;
};

export function ExchangeRateDetailSheet({ rate, onClose, onEdit, onSync, onPin, onDelete, syncing, pinPending }: Props) {
  if (!rate) return null;
  const date = new Date(rate.effectiveAt);
  return <ResourceDetailSheet visible onClose={onClose} title="Tipo de cambio"
    name={`${rate.fromCurrencyCode} → ${rate.toCurrencyCode}`}
    value={`${rate.rate.toFixed(4)} ${rate.toCurrencyCode}`} caption={`Por cada 1 ${rate.fromCurrencyCode}`}
    fields={[
      { label: "Moneda de origen", value: rate.fromCurrencyCode },
      { label: "Moneda de destino", value: rate.toCurrencyCode },
      { label: "Actualizado", value: Number.isNaN(date.getTime()) ? "Sin fecha" : format(date, "d MMM yyyy, HH:mm", { locale: es }) },
      { label: "Fuente", value: rate.source === "manual" ? "Manual" : rate.source ?? "Sin fuente" },
      { label: "Fijado", value: rate.isPinned ? "Sí" : "No" },
      { label: "Notas", value: rate.notes || "Sin notas", muted: !rate.notes, valueLines: 0 },
    ]}
    secondary={{ label: "Editar", icon: Pencil, accessibilityLabel: "Editar", onPress: onEdit, disabled: syncing }}
    primary={{ label: syncing ? "Actualizando…" : "Actualizar", icon: RefreshCw, accessibilityLabel: "Actualizar tipo de cambio", onPress: onSync, loading: syncing }}
    actions={[
      { key: "pin", label: rate.isPinned ? "Desfijar" : "Fijar", onPress: onPin, disabled: pinPending },
      { key: "delete", label: "Eliminar", onPress: onDelete, disabled: syncing },
    ]} />;
}
