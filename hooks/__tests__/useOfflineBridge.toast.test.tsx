import React from "react";
const { act, create } = require("react-test-renderer");

jest.mock("../../components/DarkMoneyToast", () => ({ useDarkMoneyToast: () => ({ show: mockShow }) }));
jest.mock("../../lib/offline/instance", () => ({ offlineRuntime: { setHooks: jest.fn() } }));
jest.mock("../../lib/offline/react", () => ({ useOfflineFlag: () => ({ enabled: false, loaded: false }) }));
jest.mock("@react-native-community/netinfo", () => ({ addEventListener: () => () => {}, fetch: async () => ({ isConnected: true }) }));
jest.mock("@tanstack/react-query", () => ({ ...jest.requireActual("@tanstack/react-query"), useQueryClient: () => ({}) }));

import { useOfflineBridge } from "../useOfflineBridge";
import { offlineRuntime } from "../../lib/offline/instance";
const mockShow = jest.fn();

it("muestra los cambios enviados en el mismo aviso que usa el resto de la app", () => {
  function Bridge() { useOfflineBridge(null, null); return null; }
  let renderer: ReturnType<typeof create>;
  act(() => { renderer = create(<Bridge />); });
  const hooks = (offlineRuntime.setHooks as jest.Mock).mock.calls[0][0];
  act(() => { hooks.onPushed({ applied: 3, rejected: 0 }, "network"); });
  expect(mockShow).toHaveBeenCalledWith({ type: "success", title: "3 cambios enviados" });
  act(() => { renderer!.unmount(); });
});
