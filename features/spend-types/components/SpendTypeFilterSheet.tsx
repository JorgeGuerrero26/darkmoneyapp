import { View } from "react-native";
import { BottomSheet } from "../../../components/ui/BottomSheet";
import { PillSelector } from "../../../components/ui/PillSelector";
import { Button } from "../../../components/ui/Button";
import { SPACING } from "../../../constants/theme";
import { SPEND_TYPE_STATUSES, type SpendTypeStatus } from "../lib/spendTypeList";

export function SpendTypeFilterSheet({ visible, onClose, status, onChange }: {
  visible: boolean; onClose: () => void; status: SpendTypeStatus; onChange: (status: SpendTypeStatus) => void;
}) {
  return <BottomSheet visible={visible} onClose={onClose} title="Filtros" snapHeight={0.4} entranceAnimation="springFade">
    <View style={{ gap: SPACING.lg }}>
      <PillSelector options={SPEND_TYPE_STATUSES} value={status} onChange={onChange} />
      <Button label="Aplicar" onPress={onClose} />
    </View>
  </BottomSheet>;
}
