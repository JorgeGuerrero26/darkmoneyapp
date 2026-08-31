import { Download, MoreVertical } from "lucide-react-native";
import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

import { COLORS } from "../../../../constants/theme";

export type ObligationDetailHeaderActionsStyles = {
  headerActions: StyleProp<ViewStyle>;
  requestBadgeWrap: StyleProp<ViewStyle>;
  requestBadge: StyleProp<ViewStyle>;
  requestBadgeText: StyleProp<TextStyle>;
  shareBtn: StyleProp<ViewStyle>;
  headerIconBtn: StyleProp<ViewStyle>;
  shareBtnText: StyleProp<TextStyle>;
  unlinkHeaderBtn: StyleProp<ViewStyle>;
  unlinkHeaderBtnText: StyleProp<TextStyle>;
};

type Props = {
  styles: ObligationDetailHeaderActionsStyles;
  hasObligation: boolean;
  isSharedViewer: boolean;
  pendingRequestCount: number;
  onPressShare: () => void;
  onPressReport: () => void;
  onPressMenu: () => void;
  onPressUnlink: () => void;
};

export function ObligationDetailHeaderActions({
  styles,
  hasObligation,
  isSharedViewer,
  pendingRequestCount,
  onPressShare,
  onPressReport,
  onPressMenu,
  onPressUnlink,
}: Props) {
  return (
    <View style={styles.headerActions}>
      {hasObligation && !isSharedViewer ? (
        <>
          {pendingRequestCount > 0 ? (
            <View style={styles.requestBadgeWrap}>
              <View style={styles.requestBadge}>
                <Text style={styles.requestBadgeText}>{pendingRequestCount}</Text>
              </View>
            </View>
          ) : null}
          {/* El reporte es la acción que se usa de verdad desde aquí; lo demás —editar los datos
              administrativos, compartir, corregir el monto— vive en el menú, que es donde va lo
              que no se hace todos los días. */}
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onPressReport}
            accessibilityRole="button"
            accessibilityLabel="Generar reporte"
          >
            <Download size={16} color={COLORS.fog} strokeWidth={2} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerIconBtn}
            onPress={onPressMenu}
            accessibilityRole="button"
            accessibilityLabel="Más acciones"
          >
            <MoreVertical size={16} color={COLORS.fog} strokeWidth={2} />
          </TouchableOpacity>
        </>
      ) : null}
      {hasObligation && isSharedViewer ? (
        <TouchableOpacity
          style={[styles.shareBtn, styles.unlinkHeaderBtn]}
          onPress={onPressUnlink}
        >
          <Text style={[styles.shareBtnText, styles.unlinkHeaderBtnText]}>Desvincular</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
