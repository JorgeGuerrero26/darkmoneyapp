import { useLocalSearchParams } from "expo-router";

import { ObligationInviteFlow } from "../../../components/domain/ObligationInviteFlow";

export default function ShareObligationInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const raw = Array.isArray(token) ? token[0] : token;
  if (!raw || typeof raw !== "string") {
    return null;
  }
  return <ObligationInviteFlow token={decodeURIComponent(raw)} />;
}
