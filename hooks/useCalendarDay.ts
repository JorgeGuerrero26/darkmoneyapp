import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { dayKeyIn } from "../lib/calendar-day";

/**
 * El día de hoy ("YYYY-MM-DD") en la zona del perfil, y que cambia solo al cambiar el día.
 *
 * iOS puede tener la app viva en segundo plano durante días: todo lo que se calcule "una vez"
 * se queda en el día en que arrancó. Se revisa al volver a la app y cada minuto; si el día no
 * cambió, React descarta el setState y no hay render.
 */
export function useCalendarDay(timeZone: string): string {
  const [day, setDay] = useState(() => dayKeyIn(new Date(), timeZone));

  useEffect(() => {
    const update = () => setDay(dayKeyIn(new Date(), timeZone));
    update();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    const interval = setInterval(update, 60_000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [timeZone]);

  return day;
}
