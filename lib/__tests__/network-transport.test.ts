import { NetInfoStateType } from "@react-native-community/netinfo";

import { resolveNetworkTransport } from "../network-transport";

describe("resolveNetworkTransport", () => {
  it("registra el transporte inicial sin tratarlo como cambio", () => {
    expect(resolveNetworkTransport(null, { type: NetInfoStateType.wifi, isConnected: true })).toEqual({
      current: "wifi",
      changed: false,
    });
  });

  it.each([NetInfoStateType.unknown, NetInfoStateType.none])("ignora el estado transitorio %s", (type) => {
    expect(resolveNetworkTransport("wifi", {
      type,
      isConnected: type === NetInfoStateType.unknown ? null : false,
    })).toEqual({
      current: "wifi",
      changed: false,
    });
  });

  it("no interpreta churn de detalles/IP dentro del mismo WiFi como red nueva", () => {
    expect(resolveNetworkTransport("wifi", { type: NetInfoStateType.wifi, isConnected: true })).toEqual({
      current: "wifi",
      changed: false,
    });
  });

  it("detecta un cambio real entre WiFi y datos móviles", () => {
    expect(resolveNetworkTransport("wifi", { type: NetInfoStateType.cellular, isConnected: true })).toEqual({
      current: "cellular",
      changed: true,
    });
  });
});
