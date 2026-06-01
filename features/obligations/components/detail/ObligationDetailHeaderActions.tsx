import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";

export type ObligationDetailHeaderActionsStyles = {
  headerActions: StyleProp<ViewStyle>;
  requestBadgeWrap: StyleProp<ViewStyle>;
  requestBadge: StyleProp<ViewStyle>;
  requestBadgeText: StyleProp<TextStyle>;
  shareBtn: StyleProp<ViewStyle>;
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
  onPressUnlink: () => void;
};

export function ObligationDetailHeaderActions({
  styles,
  hasObligation,
  isSharedViewer,
  pendingRequestCount,
  onPressShare,
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
          <TouchableOpacity style={styles.shareBtn} onPress={onPressShare}>
            <Text style={styles.shareBtnText}>Compartir</Text>
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
