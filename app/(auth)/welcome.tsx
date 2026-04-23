import { useRef, useState } from "react";
import {
  FlatList,
  Image,
  type ImageSourcePropType,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Link } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../components/ui/Button";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING } from "../../constants/theme";

type Slide = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  image: ImageSourcePropType;
};

const SLIDES: Slide[] = [
  {
    key: "control",
    eyebrow: "Control financiero",
    title: "Tu dinero en un solo lugar.",
    body: "Organiza cuentas, gastos e ingresos con una vista clara antes de decidir.",
    image: require("../../assets/images/welcome-slider-1.png"),
  },
  {
    key: "shared",
    eyebrow: "Creditos y deudas",
    title: "Comparte creditos y deudas.",
    body: "Invita, valida y mantén claridad.",
    image: require("../../assets/images/welcome-slider-2.png"),
  },
  {
    key: "context",
    eyebrow: "Contexto inteligente",
    title: "Anticipa lo que viene.",
    body: "Lee el mes con alertas, recordatorios y senales accionables.",
    image: require("../../assets/images/welcome-slider-3.png"),
  },
];

const BOTTOM_FADE_LAYERS = [
  { height: 620, opacity: 0.03 },
  { height: 570, opacity: 0.04 },
  { height: 520, opacity: 0.05 },
  { height: 470, opacity: 0.06 },
  { height: 420, opacity: 0.08 },
  { height: 370, opacity: 0.10 },
  { height: 320, opacity: 0.12 },
  { height: 270, opacity: 0.14 },
  { height: 225, opacity: 0.16 },
  { height: 185, opacity: 0.18 },
  { height: 145, opacity: 0.20 },
  { height: 108, opacity: 0.22 },
  { height: 76, opacity: 0.24 },
  { height: 48, opacity: 0.26 },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const compact = height < 740;

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        style={styles.carousel}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
          setActiveIndex(Math.max(0, Math.min(SLIDES.length - 1, nextIndex)));
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Image source={item.image} style={styles.image} resizeMode="cover" />
            <View style={styles.imageShadeTop} />
            {BOTTOM_FADE_LAYERS.map((layer) => (
              <View
                key={`${layer.height}-${layer.opacity}`}
                pointerEvents="none"
                style={[
                  styles.fadeLayer,
                  {
                    height: layer.height,
                    backgroundColor: `rgba(3,7,17,${layer.opacity})`,
                  },
                ]}
              />
            ))}

            <View
              style={[
                styles.copyWrap,
                compact && styles.copyWrapCompact,
                { bottom: insets.bottom + (compact ? 164 : 184) },
              ]}
            >
              <View style={styles.eyebrowPill}>
                <Text style={styles.eyebrow}>{item.eyebrow}</Text>
              </View>
              <Text style={[styles.title, compact && styles.titleCompact]}>{item.title}</Text>
              <Text style={[styles.body, compact && styles.bodyCompact]} numberOfLines={2}>
                {item.body}
              </Text>
            </View>
          </View>
        )}
      />

      <View style={[
        styles.footer,
        compact && styles.footerCompact,
        { paddingBottom: insets.bottom + (compact ? SPACING.lg : SPACING.xl) },
      ]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, index) => (
            <View
              key={slide.key}
              style={[
                styles.dot,
                index === activeIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          <Link href="/(auth)/register" asChild>
            <Button label="Crear cuenta" size="lg" style={styles.actionButton} />
          </Link>
          <Link href={{ pathname: "/(auth)/login", params: { fromWelcome: "1" } }} asChild>
            <Button label="Ya soy usuario" variant="secondary" size="lg" style={styles.actionButton} />
          </Link>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  carousel: {
    flex: 1,
  },
  slide: {
    flex: 1,
    overflow: "hidden",
  },
  image: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  imageShadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: "rgba(3,7,17,0.20)",
  },
  fadeLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  copyWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: SPACING.xxl,
    gap: SPACING.md,
  },
  copyWrapCompact: {
    gap: SPACING.sm,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.pine + "55",
    backgroundColor: COLORS.pine + "16",
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.bodySemibold,
    fontSize: FONT_SIZE.xs,
    color: COLORS.pine,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.ink,
    lineHeight: 38,
  },
  titleCompact: {
    fontSize: FONT_SIZE.xxl,
    lineHeight: 30,
  },
  body: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.md,
    color: COLORS.storm,
    lineHeight: 23,
  },
  bodyCompact: {
    fontSize: FONT_SIZE.sm,
    lineHeight: 19,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.xxl,
    paddingTop: SPACING.md,
    backgroundColor: COLORS.canvas,
    gap: SPACING.lg,
  },
  footerCompact: {
    paddingTop: SPACING.sm,
    gap: SPACING.md,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: SPACING.xs,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(255,255,255,0.24)",
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.pine,
  },
  actions: {
    gap: SPACING.sm,
  },
  actionButton: {
    width: "100%",
  },
});
