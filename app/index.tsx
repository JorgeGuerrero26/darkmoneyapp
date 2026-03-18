import { Redirect } from "expo-router";

// Expo Router needs an index route. The NavigationGuard in _layout.tsx
// handles the actual routing logic. This just provides a safe fallback.
export default function Index() {
  return <Redirect href="/(app)/dashboard" />;
}
