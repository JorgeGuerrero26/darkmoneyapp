import type { ComponentProps } from "react";

import { BottomSheet } from "../../../../components/ui/BottomSheet";

type Props = Omit<ComponentProps<typeof BottomSheet>, "entranceAnimation">;

/** Todas las hojas del dashboard usan la misma entrada breve con fundido y resorte. */
export function DashboardBottomSheet(props: Props) {
  return <BottomSheet {...props} entranceAnimation="springFade" />;
}
