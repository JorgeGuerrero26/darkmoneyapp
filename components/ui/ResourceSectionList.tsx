import {
  ActivityIndicator,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionListRenderItem,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../constants/theme";
import { IOS_FLOATING_TAB_BAR_SPACE } from "../../constants/floating-tab-bar";
import { EmptyState } from "./EmptyState";
import { StaggeredItem } from "./StaggeredItem";

export type ResourceSection<T, K extends string = string> = {
  key: K;
  label: string;
  hint?: string;
  data: T[];
  headerVariant?: "default" | "divider" | "hidden";
  headerIcon?: LucideIcon;
  /** Valor alineado a la derecha del titulo. En movimientos, el neto del dia. */
  trailing?: string;
  trailingColor?: string;
};

type EmptyConfig = {
  icon?: LucideIcon;
  variant?: "empty" | "no-results";
  title: string;
  description: string;
  action?: { label: string; onPress: () => void };
};

type LoadingConfig = {
  isLoading: boolean;
  skeleton?: React.ReactNode;
  secondaryLoading?: boolean;
  secondaryMessage?: string;
  fetchingMore?: boolean;
  footerMessage?: string;
  endReached?: boolean;
};

type Props<T, S extends ResourceSection<T> = ResourceSection<T>> = {
  sections: S[];
  renderItem: SectionListRenderItem<T, S>;
  keyExtractor: (item: T, index: number) => string;
  loading: LoadingConfig;
  empty: EmptyConfig | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
  listHeaderComponent?: React.ReactNode;
  listFooterComponent?: React.ReactNode;
  itemSeparatorHeight?: number;
  sectionSeparatorHeight?: number;
  animateItems?: boolean;
  itemAnimationMaxStagger?: number;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  stickyHeaders?: boolean;
};

export function ResourceSectionList<T, S extends ResourceSection<T> = ResourceSection<T>>({
  sections,
  renderItem,
  keyExtractor,
  loading,
  empty,
  refreshing = false,
  onRefresh,
  contentContainerStyle,
  listHeaderComponent,
  listFooterComponent,
  itemSeparatorHeight = SPACING.sm,
  sectionSeparatorHeight = SPACING.md,
  animateItems = true,
  itemAnimationMaxStagger = 10,
  onEndReached,
  onEndReachedThreshold,
  stickyHeaders = false,
}: Props<T, S>) {
  return (
    <SectionList<T, S>
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={(info) => {
        const content = renderItem(info);
        if (!animateItems || !content) return content;
        return (
          <StaggeredItem index={info.index} maxStagger={itemAnimationMaxStagger}>
            {content}
          </StaggeredItem>
        );
      }}
      renderSectionHeader={({ section }) => <ResourceSectionHeader section={section as ResourceSection<T>} />}
      stickySectionHeadersEnabled={stickyHeaders}
      ListHeaderComponent={
        <>
          {listHeaderComponent}
          {loading.isLoading ? (
            loading.skeleton ? <>{loading.skeleton}</> : null
          ) : loading.secondaryLoading && sections.length === 0 ? (
            <View style={styles.secondaryLoading}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.secondaryLoadingText}>{loading.secondaryMessage ?? "Cargando..."}</Text>
            </View>
          ) : null}
        </>
      }
      ListFooterComponent={
        <>
          {listFooterComponent}
          {loading.fetchingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={COLORS.primary} size="small" />
              <Text style={styles.footerText}>{loading.footerMessage ?? "Cargando más..."}</Text>
            </View>
          ) : loading.endReached && sections.some((section) => section.data.length > 0) ? (
            <View style={styles.footer}>
              <Text style={styles.footerEnd}>· · ·</Text>
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        !loading.isLoading && !loading.secondaryLoading && empty ? (
          <EmptyState
            icon={empty.icon}
            variant={empty.variant}
            title={empty.title}
            description={empty.description}
            action={empty.action}
          />
        ) : null
      }
      ItemSeparatorComponent={() => <View style={{ height: itemSeparatorHeight }} />}
      SectionSeparatorComponent={() => <View style={{ height: sectionSeparatorHeight }} />}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            // iOS usa tintColor; Android usa colors[] + progressBackgroundColor. Sin esto, en
            // Android el spinner salía con color por defecto (poco visible en tema oscuro), por lo
            // que el arrastre no daba feedback. Ahora el indicador es visible en todos los módulos.
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
            progressBackgroundColor={SURFACE.deepNavy}
          />
        ) : undefined
      }
      removeClippedSubviews={!stickyHeaders}
      maxToRenderPerBatch={10}
      windowSize={5}
      initialNumToRender={15}
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      contentContainerStyle={[styles.contentContainer, contentContainerStyle]}
    />
  );
}

function ResourceSectionHeader<T>({ section }: { section: ResourceSection<T> }) {
  if (section.headerVariant === "hidden") return null;

  if (section.headerVariant === "divider") {
    const Icon = section.headerIcon;
    return (
      <View style={styles.dividerHeader}>
        {Icon ? <Icon size={13} color={COLORS.storm} strokeWidth={2} /> : null}
        <Text style={styles.dividerLabel}>{section.label}</Text>
        {/* El total del dia da la orientacion que antes pretendia dar la tarjeta. */}
        {section.trailing ? (
          <Text
            style={[styles.dividerTrailing, section.trailingColor ? { color: section.trailingColor } : null]}
            numberOfLines={1}
          >
            {section.trailing}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.sectionLabel}>{section.label}</Text>
      {section.hint ? <Text style={styles.sectionHint}>{section.hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    padding: SPACING.lg,
    // En iOS la barra flota (absolute) y el contenido corre por detrás: hay que dejar libre
    // su franja o los últimos items quedan tapados. En Android la constante vale 0.
    paddingBottom: 100 + IOS_FLOATING_TAB_BAR_SPACE,
  },
  secondaryLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
  },
  secondaryLoadingText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.body,
  },
  dividerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    minHeight: 26,
    // 20 = margen lateral unico. Alinea el encabezado con el texto de las filas.
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: SURFACE.separator,
    // Pegajoso sobre el lienzo: sin fondo propio el contenido se leeria por debajo.
    backgroundColor: COLORS.canvas,
  },
  dividerLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodySemibold,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  dividerTrailing: {
    marginLeft: "auto",
    fontSize: FONT_SIZE.sm,
    color: COLORS.fog,
    fontFamily: FONT_FAMILY.heading,
  },
  sectionLabel: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bodySemibold,
    color: COLORS.storm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sectionHint: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.body,
    color: COLORS.storm,
    opacity: 0.85,
    marginBottom: SPACING.sm,
    marginTop: -SPACING.xs,
  },
  footer: {
    paddingVertical: SPACING.lg,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.sm,
  },
  footerText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textDisabled,
    fontFamily: FONT_FAMILY.body,
  },
  footerEnd: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDisabled,
    letterSpacing: 4,
  },
});
