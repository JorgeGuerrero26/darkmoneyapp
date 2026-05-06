import {
  EntityActionSheet,
  type EntityActionSheetAction,
  type EntityActionSheetNotice,
  type EntityActionSheetQuickAction,
  type EntityActionSheetStatusBadge,
  type EntityActionSheetTone,
} from "../ui/EntityActionSheet";

type SheetTone = EntityActionSheetTone;
type SheetAction = EntityActionSheetAction;
type QuickAction = EntityActionSheetQuickAction;
type StatusBadge = EntityActionSheetStatusBadge;
type Notice = EntityActionSheetNotice;

type Props = {
  visible: boolean;
  onClose: () => void;
  eventTitle?: string | null;
  dateLabel?: string | null;
  amountLabel?: string | null;
  description?: string | null;
  notes?: string | null;
  statusBadge?: StatusBadge | null;
  notices?: Notice[];
  quickActions?: QuickAction[];
  actions?: SheetAction[];
};

export function ObligationEventActionSheet({
  visible,
  onClose,
  eventTitle,
  dateLabel,
  amountLabel,
  description,
  notes,
  statusBadge,
  notices,
  quickActions,
  actions,
}: Props) {
  return (
    <EntityActionSheet
      visible={visible}
      onClose={onClose}
      sheetTitle="Evento"
      summaryTitle={eventTitle?.trim() || "Evento"}
      meta={[dateLabel, amountLabel]}
      statusBadge={statusBadge}
      copyBlocks={[
        { key: "description", label: "Descripción", value: description },
        { key: "notes", label: "Notas", value: notes },
      ]}
      notices={notices}
      quickActions={quickActions}
      actions={actions}
    />
  );
}

export type { Notice, QuickAction, SheetAction, SheetTone, StatusBadge };
