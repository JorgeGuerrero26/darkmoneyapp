import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { getDashboardAiToneKey } from "../lib/ai-cache-keys";
import type { DashboardAiTone } from "../lib/dashboard-ai-content";

/**
 * El TONO con el que la IA del dashboard te habla — "Informe gerencial" o "Asesor personal".
 *
 * Es el registro, no lo que se le pide: la caché guarda una respuesta por tono y por pestaña
 * (`responses[tone]`), y el contrato con la edge function no cambia. Por eso es una
 * **preferencia**, igual que Simple/Avanzado, y se elige una vez en Ajustes en vez de
 * repintarse en las cinco pestañas.
 *
 * Vive aquí y no en el store de UI porque se guarda POR USUARIO: en un teléfono compartido,
 * el tono de cada quien es suyo.
 */
export function useDashboardAiTone(userId?: string | null) {
  const storageKey = useMemo(() => getDashboardAiToneKey(userId), [userId]);
  const [tone, setToneState] = useState<DashboardAiTone>("managerial");
  // Hasta que no se lea lo guardado no se escribe, o el valor por defecto pisaría la elección
  // real del usuario en el primer render.
  const loadedRef = useRef(false);

  useEffect(() => {
    loadedRef.current = false;
    setToneState("managerial");
    if (!storageKey) {
      loadedRef.current = true;
      return;
    }
    let cancelled = false;
    void AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (cancelled) return;
        if (stored === "managerial" || stored === "personal") setToneState(stored);
      })
      .finally(() => {
        if (!cancelled) loadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!loadedRef.current || !storageKey) return;
    void AsyncStorage.setItem(storageKey, tone);
  }, [tone, storageKey]);

  const setTone = useCallback((next: DashboardAiTone) => setToneState(next), []);

  return { tone, setTone };
}
