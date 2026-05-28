import { memo } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card } from "../../../../components/ui/Card";
import { parseDisplayDate } from "../../../../lib/date";
import type { MovementRecord } from "../../../../types/domain";
import { MovementDetailRow, MovementDetailDivider } from "./MovementDetailRow";

type Props = {
  movement: MovementRecord;
};

export const MovementDetailFields = memo(function MovementDetailFields({ movement }: Props) {
  const dateLabel = format(parseDisplayDate(movement.occurredAt), "d 'de' MMMM yyyy", { locale: es });

  return (
    <Card>
      <MovementDetailRow label="Descripción" value={movement.description || "-"} />
      <MovementDetailDivider />
      <MovementDetailRow label="Fecha" value={dateLabel} />
      {movement.categoryId ? (
        <>
          <MovementDetailDivider />
          <MovementDetailRow label="Categoria" value={movement.category || `ID ${movement.categoryId}`} />
        </>
      ) : null}
      {movement.counterpartyId ? (
        <>
          <MovementDetailDivider />
          <MovementDetailRow label="Contacto" value={movement.counterparty || `ID ${movement.counterpartyId}`} />
        </>
      ) : null}
      {movement.notes ? (
        <>
          <MovementDetailDivider />
          <MovementDetailRow label="Notas" value={movement.notes} />
        </>
      ) : null}
    </Card>
  );
});
