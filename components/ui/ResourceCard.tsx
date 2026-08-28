import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { memo, type ReactNode } from "react";
import { ChevronRight, Star, type LucideIcon } from "lucide-react-native";

import { COLORS, ELEVATION, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../constants/theme";

export type ResourceCardAction = {
  key: string;
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  color?: string;
};

type Props = {
  title: string;
  subtitle?: string | null;
  leading?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  actions?: ResourceCardAction[];
  footer?: ReactNode;
  selected?: boolean;
  archived?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /**
   * "card" (por defecto) para recursos: cuenta, deuda, presupuesto, suscripcion.
   *
   * "row" para listas largas — hoy solo movimientos. Sin tarjeta, sin sombra y sin fondo
   * propio: texto sobre lienzo con un separador sangrado. Con cientos de filas cada tarjeta
   * cobra un peaje de 16px de aire y dos bordes; asi caben 4 filas mas por pantalla sin bajar
   * ningun tamaño de letra. El area tactil se queda en 56 > 44.
   */
  variant?: "card" | "row";
  /**
   * La fila está fijada.
   *
   * Se enseña el RESULTADO, no el control: ver que algo está fijado es información; poder
   * fijarlo desde la lista no lo es. Fijar es excepcional —una vez por contacto en la vida— y
   * vive en la hoja de detalle, que es donde ya editas todo lo demás de esa fila.
   */
  pinned?: boolean;
};

function ResourceCardBase({
  title,
  subtitle,
  leading,
  meta,
  trailing,
  actions = [],
  footer,
  selected,
  archived,
  disabled,
  onPress,
  onLongPress,
  style,
  contentStyle,
  variant = "card",
  pinned,
}: Props) {
  const isRow = variant === "row";
  return (
    <Pressable
      style={({ pressed }) => [
        isRow ? styles.row : styles.card,
        selected && styles.selected,
        archived && styles.archived,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
      onPress={disabled ? undefined : onPress}
      onLongPress={disabled ? undefined : onLongPress}
      delayLongPress={400}
      accessibilityRole={onPress ? "button" : undefined}
    >
      {/* Separador sangrado 62px: se alinea con el TEXTO, no con el borde de pantalla.
          Va absoluto para no robarle alto a la fila ni sumarse al padding. */}
      {isRow ? <View style={styles.rowSeparator} pointerEvents="none" /> : null}
      <View style={[styles.mainRow, contentStyle]}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}

        <View style={styles.body}>
          <View style={styles.titleRow}>
            {pinned ? <Star size={12} color={COLORS.fog} fill={COLORS.fog} /> : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {meta ? <View style={styles.meta}>{meta}</View> : null}
        </View>

        {/* Chevron: la fila ENTERA es tocable, y hay que verlo. Solo en variante fila y solo
            si de verdad lleva a algun sitio. */}
        {isRow && onPress && actions.length === 0 ? (
          <ChevronRight size={18} color={COLORS.textDisabled} />
        ) : null}

        {actions.length > 0 ? (
          <View style={styles.actions}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Pressable
                  key={action.key}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}
                  onPress={(event) => {
                    event.stopPropagation();
                    action.onPress();
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={action.accessibilityLabel}
                >
                  <Icon size={14} color={action.color ?? COLORS.storm} strokeWidth={2} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </Pressable>
  );
}

export function ResourceCardIcon({
  icon: Icon,
  color,
}: {
  icon: LucideIcon;
  color: string;
}) {
  return (
    <View style={[styles.iconWrap, { backgroundColor: color + "18" }]}>
      <Icon size={20} color={color} strokeWidth={2} />
    </View>
  );
}

export function ResourceCardBadge({
  label,
  color,
  icon: Icon,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  color: string;
  icon?: LucideIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      {Icon ? <Icon size={9} color={color} strokeWidth={2} /> : null}
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </>
  );
  if (onPress) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.badge,
          { backgroundColor: color + "15" },
          pressed && styles.badgePressed,
        ]}
        onPress={(event) => {
          event.stopPropagation();
          onPress();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <View style={[styles.badge, { backgroundColor: color + "15" }]}>
      {content}
    </View>
  );
}

export function ResourceCardMetaText({
  children,
}: {
  children: ReactNode;
}) {
  return <Text style={styles.metaText} numberOfLines={1}>{children}</Text>;
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  row: {
    minHeight: 56,
    paddingVertical: SPACING.sm,
    // 20 es el margen lateral unico de la app.
    paddingHorizontal: SPACING.xl,
    justifyContent: "center",
  },
  rowSeparator: {
    position: "absolute",
    left: 62,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: SURFACE.separator,
  },
  card: {
    borderRadius: RADIUS.xl,
    backgroundColor: SURFACE.card,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    ...ELEVATION[2],
  },
  selected: {
    backgroundColor: SURFACE.cardActive,
    borderColor: SURFACE.cardActiveBorder,
  },
  archived: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.48,
  },
  pressed: {
    opacity: 0.82,
    backgroundColor: SURFACE.pressed,
  },
  mainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  leading: {
    flexShrink: 0,
  },
  body: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  title: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
  },
  actionButton: {
    width: 26,
    height: 26,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: SURFACE.separator,
  },
  actionPressed: {
    backgroundColor: SURFACE.cardBorder,
  },
  trailing: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  footer: {
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: SURFACE.separator,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  badgePressed: {
    opacity: 0.7,
  },
  badgeText: {
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: 10,
    letterSpacing: 0.1,
  },
  metaText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    flexShrink: 1,
  },
});

/** Memoizado: los cards se renderizan en listas largas; evita re-renders cuando las props son estables. */
export const ResourceCard = memo(ResourceCardBase);
