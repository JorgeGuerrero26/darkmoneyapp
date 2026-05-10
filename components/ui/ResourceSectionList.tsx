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
import { EmptyState } from "./EmptyState";
import { StaggeredItem } from "./StaggeredItem";

export type ResourceSection<T, K extends string = string> = {
  key: K;
  label: string;
  hint?: string;
  data: T[];
  headerVariant?: "default" | "divider" | "hidden";
  headerIcon?: LucideIcon;
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
      stickySectionHeadersEnabled={false}
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
        ) : undefined
      }
      removeClippedSubviews
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
    paddingBottom: 100,
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
    marginTop: SPACING.sm,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: SURFACE.separator,
  },
  dividerLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.storm,
    fontFamily: FONT_FAMILY.bodyMedium,
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
