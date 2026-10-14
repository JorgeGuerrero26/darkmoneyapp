import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";

import { overlayBalancesOnAccounts } from "../lib/offline/account-balances";
import { offlineRuntime } from "../lib/offline/instance";
import { useOfflineFlag } from "../lib/offline/react";
import { describePushedNotice } from "../lib/offline/pushed-notice";
import { useUiStore } from "../store/ui-store";
import { scheduleCoalescedTask } from "../lib/query-refresh-coalescer";
import { BUDGET_INPUT_TABLES } from "../services/queries/offline-budgets";
import { applyLocalObligationsToCache } from "../services/queries/offline-obligations";
import { applyLocalBudgetsToCache, applyLocalCatalogsToCache, touchesSnapshotCatalogs } from "../services/queries/offline-snapshot";
import { isCoreSnapshot } from "../services/queries/snapshot-cache";
import { refreshSnapshotDomains } from "../services/queries/workspace-data";

/** Mismo criterio que useForegroundDataRefresh: ráfagas de vuelta a la app no disparan trabajo extra. */
const FOREGROUND_SYNC_MIN_GAP_MS = 15_000;
const INTERVAL_SYNC_MS = 5 * 60_000;

/**
 * Pone los saldos de las cuentas del snapshot en cache al día con la base local.
 *
 * Tras guardar sin red no hay refetch posible, y con red el refetch del servidor todavía no trae
 * lo pendiente. El saldo local suma lo del servidor más lo pendiente, así que es el correcto.
 */
async function applyLocalBalancesToCache(queryClient: QueryClient, workspaceId: number) {
  const balances = await offlineRuntime.accountBalances(workspaceId);
  if (!balances) return;
  queryClient.setQueriesData<unknown>({ queryKey: ["workspace-snapshot", workspaceId] }, (old: unknown) => {
    if (!isCoreSnapshot(old)) return old;
    const baseCurrency = (old.workspaces.find((w) => w.id === workspaceId)?.baseCurrencyCode ?? "PEN").toUpperCase();
    return { ...old, accounts: overlayBalancesOnAccounts(old.accounts, balances, baseCurrency) };
  });
}

/**
 * Conecta el motor offline con la app: lo enciende según el interruptor, le avisa de la red y del
 * primer plano, y refresca la UI cuando cambian los datos locales. Con el interruptor apagado (el
 * estado por defecto) no hace nada más que dejarlo apagado.
 */
export function useOfflineBridge(userId: string | null, workspaceId: number | null, memberWorkspaceIds: number[] = []) {
  const queryClient = useQueryClient();
  const { enabled, loaded } = useOfflineFlag();
  // Clave estable: la lista cambia de identidad en cada render pero casi nunca de contenido.
  const memberKey = [...new Set(memberWorkspaceIds)].sort((a, b) => a - b).join(",");
  const latest = useRef({ workspaceId });
  latest.current = { workspaceId };

  // Reacciones a cambios de datos.
  useEffect(() => {
    offlineRuntime.setHooks({
      onDataChanged: async (tables) => {
        const wsId = latest.current.workspaceId;
        if (tables.length === 0 || tables.includes("movements")) {
          void queryClient.invalidateQueries({ queryKey: ["movements"] });
          void queryClient.invalidateQueries({ queryKey: ["movement"] });
        }
        if (wsId != null) await applyLocalBalancesToCache(queryClient, wsId);
        // Catálogos escritos sin red (o traídos de otro dispositivo): el cache se rehace desde la base local.
        if (wsId != null && (tables.length === 0 || touchesSnapshotCatalogs(tables))) {
          await applyLocalCatalogsToCache(queryClient, wsId).catch(() => false);
        }
        // Obligaciones: las definiciones creadas o editadas sin red se muestran encima de lo del servidor.
        if (wsId != null && (tables.length === 0 || tables.includes("obligations") || tables.includes("counterparties"))) {
          await applyLocalObligationsToCache(queryClient, wsId).catch(() => false);
        }
        // Presupuestos: el avance cambia con presupuestos, gastos, cuentas, categorías y tipos de gasto.
        if (wsId != null && (tables.length === 0 || tables.some((table) => BUDGET_INPUT_TABLES.includes(table)))) {
          await applyLocalBudgetsToCache(queryClient, wsId).catch(() => false);
        }
      },
      // El servidor acaba de aceptar cambios: ahora sí se pueden pedir los números que solo él
      // calcula (presupuestos, historial por categoría, analíticas).
      onPushed: (report, reason) => {
        // "3 cambios enviados" (Revisión 40): al volver el internet o al enviar varios juntos.
        const notice = describePushedNotice(report, reason);
        if (notice) useUiStore.getState().showToast(notice, "success");
        const wsId = latest.current.workspaceId;
        if (wsId == null) return;
        scheduleCoalescedTask(queryClient, `movement-snapshot:${wsId}`, () =>
          refreshSnapshotDomains(queryClient, wsId, [
            "accounts",
            "budgets",
            "categoryMovements",
            "subscriptionMovements",
            "counterpartyMovements",
          ]),
        );
        void queryClient.invalidateQueries({ queryKey: ["dashboard-movements"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard-analytics"] });
        void queryClient.invalidateQueries({ queryKey: ["detection-learning"] });
        void queryClient.invalidateQueries({ queryKey: ["pending-detected-movements"] });
      },
    });
  }, [queryClient]);

  // Tras CUALQUIER escritura exitosa de la app (alta online, pago de una obligación, categoría
  // nueva…) la base local se pone al día en breve: el motor junta varias en un solo ciclo.
  useEffect(() => {
    if (!enabled) return;
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") offlineRuntime.nudge();
    });
  }, [queryClient, enabled]);

  // Encendido / apagado y cambio de usuario o de espacio.
  useEffect(() => {
    if (!loaded) return;
    void offlineRuntime.configure({ enabled, userId, workspaceId, workspaceIds: memberKey ? memberKey.split(",").map(Number) : [] });
  }, [loaded, enabled, userId, workspaceId, memberKey]);

  // Disparadores: red, primer plano y un latido cada 5 minutos con la app abierta.
  useEffect(() => {
    if (!enabled) return;
    let lastForegroundSync = 0;
    let interval: ReturnType<typeof setInterval> | null = null;

    const netSub = NetInfo.addEventListener((state) => {
      // isConnected null = "aún no se sabe": igual que en lib/query-client.ts, se asume con red.
      offlineRuntime.setOnline(state.isConnected ?? true);
    });
    void NetInfo.fetch().then((state) => offlineRuntime.setOnline(state.isConnected ?? true));

    const startInterval = () => {
      if (interval) return;
      interval = setInterval(() => void offlineRuntime.requestSync("interval"), INTERVAL_SYNC_MS);
    };
    const stopInterval = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };
    if (AppState.currentState === "active") startInterval();

    const appSub = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        startInterval();
        const now = Date.now();
        if (now - lastForegroundSync >= FOREGROUND_SYNC_MIN_GAP_MS) {
          lastForegroundSync = now;
          // Si NetInfo arrastra un estado viejo tras el segundo plano, se revalida antes de decidir.
          void NetInfo.refresh().then((state) => {
            offlineRuntime.setOnline(state.isConnected ?? true);
            void offlineRuntime.requestSync("foreground");
          });
        }
      } else {
        stopInterval();
      }
    });

    return () => {
      netSub();
      appSub.remove();
      stopInterval();
    };
  }, [enabled]);
}
