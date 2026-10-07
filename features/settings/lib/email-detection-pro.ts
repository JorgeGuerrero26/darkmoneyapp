import { Linking } from "react-native";

export const EMAIL_DETECTION_PRO_DESCRIPTION = "Recibe sugerencias de tus comprobantes bancarios, revísalas y guárdalas sin escribir todo desde cero. La recepción se pausa cuando tu acceso PRO termina y se retoma al renovarlo.";

export async function openDarkMoneyProPlans(): Promise<void> {
  await Linking.openURL("https://darkmoney.company/pricing");
}
