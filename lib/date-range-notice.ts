import { format } from "date-fns";
import { es } from "date-fns/locale";

import { parseDisplayDate } from "./date";

type DateRangeNoticeOptions = {
  subject: string;
  from?: string | null;
  to?: string | null;
  allMessage?: string;
};

function formatRangeDate(dateStr: string, includeYear: boolean) {
  const date = parseDisplayDate(dateStr);
  return format(date, includeYear ? "d 'de' MMMM 'de' yyyy" : "d 'de' MMMM", {
    locale: es,
  });
}

export function buildDateRangeNotice({
  subject,
  from,
  to,
  allMessage,
}: DateRangeNoticeOptions) {
  const cleanFrom = from?.trim() || null;
  const cleanTo = to?.trim() || null;

  if (!cleanFrom && !cleanTo) {
    return allMessage ?? `Mostrando todos los ${subject} disponibles.`;
  }

  if (cleanFrom && cleanTo) {
    const fromDate = parseDisplayDate(cleanFrom);
    const toDate = parseDisplayDate(cleanTo);
    const currentYear = format(new Date(), "yyyy");
    const sameYear = format(fromDate, "yyyy") === format(toDate, "yyyy");
    const includeYear =
      !sameYear ||
      format(fromDate, "yyyy") !== currentYear ||
      format(toDate, "yyyy") !== currentYear;

    return `Mostrando ${subject} del ${formatRangeDate(cleanFrom, includeYear)} al ${formatRangeDate(cleanTo, includeYear)}.`;
  }

  if (cleanFrom) {
    const includeYear = format(parseDisplayDate(cleanFrom), "yyyy") !== format(new Date(), "yyyy");
    return `Mostrando ${subject} desde el ${formatRangeDate(cleanFrom, includeYear)}.`;
  }

  const includeYear = format(parseDisplayDate(cleanTo!), "yyyy") !== format(new Date(), "yyyy");
  return `Mostrando ${subject} hasta el ${formatRangeDate(cleanTo!, includeYear)}.`;
}
