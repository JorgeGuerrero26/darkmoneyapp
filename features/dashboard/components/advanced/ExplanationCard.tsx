import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ArrowRight, Sparkles } from "lucide-react-native";

import { COLORS, EXTENDED_PALETTE } from "../../../../constants/theme";
import { type ExplanationTone, explanationToneLabel } from "../../lib/advanced-types";
import { dashboardSimpleStyles as subStyles } from "../simple/styles";

export function ExplanationIntro({ kicker, summary }: { kicker: string; summary: string }) {
  return (
    <View style={subStyles.explanationIntroCard}>
      <Text style={subStyles.explanationKicker}>{kicker}</Text>
      <Text style={subStyles.explanationSummary}>{summary}</Text>
    </View>
  );
}

export function ExplanationVisualSummary({
  tone,
  actionsCount,
  detailCount,
}: {
  tone: ExplanationTone;
  actionsCount: number;
  detailCount: number;
}) {
  const urgency = tone === "danger" ? 92 : tone === "warning" ? 66 : 34;
  const clarity = Math.min(100, Math.max(28, detailCount * 16));
  const actionStrength = Math.min(100, Math.max(actionsCount > 0 ? 42 : 18, actionsCount * 44));
  const toneColor = tone === "positive" ? COLORS.primary : tone === "danger" ? EXTENDED_PALETTE.rosePink : COLORS.gold;
  const items = [
    { label: "Lectura", value: urgency, caption: explanationToneLabel(tone), color: toneColor },
    { label: "Claridad", value: clarity, caption: `${detailCount} puntos`, color: COLORS.secondary },
    { label: "Acción", value: actionStrength, caption: actionsCount > 0 ? `${actionsCount} CTA` : "solo lectura", color: COLORS.primary },
  ];

  return (
    <View style={subStyles.explanationVisualCard}>
      <View style={subStyles.explanationVisualHeader}>
        <Sparkles size={16} color={toneColor} />
        <View style={{ flex: 1 }}>
          <Text style={subStyles.explanationVisualTitle}>Lectura rápida</Text>
          <Text style={subStyles.explanationVisualHint}>Toca las tarjetas de abajo para abrir solo el detalle que necesitas.</Text>
        </View>
      </View>
      <View style={subStyles.explanationVisualGrid}>
        {items.map((item) => (
          <View key={item.label} style={subStyles.explanationVisualMetric}>
            <Text style={subStyles.explanationVisualMetricLabel}>{item.label}</Text>
            <Text style={[subStyles.explanationVisualMetricValue, { color: item.color }]}>{item.caption}</Text>
            <View style={subStyles.explanationVisualTrack}>
              <View style={[subStyles.explanationVisualFill, { width: `${item.value}%` as any, backgroundColor: item.color }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function ExplanationSection({
  index,
  title,
  items,
}: {
  index: string;
  title: string;
  items: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity
      style={[subStyles.explanationSectionCard, !expanded && subStyles.explanationSectionCardCollapsed]}
      onPress={() => setExpanded((value) => !value)}
      activeOpacity={0.86}
    >
      <View style={subStyles.explanationSectionHeader}>
        <View style={subStyles.explanationStepBadge}>
          <Text style={subStyles.explanationStepBadgeText}>{index}</Text>
        </View>
        <Text style={subStyles.explanationSectionTitle}>{title}</Text>
        <View style={[subStyles.explanationChevron, expanded && subStyles.explanationChevronOpen]}>
          <ArrowRight size={15} color={COLORS.storm} />
        </View>
      </View>
      {expanded ? (
        <View style={subStyles.explanationBulletList}>
          {items.map((item) => (
            <View key={item} style={subStyles.explanationBulletRow}>
              <View style={subStyles.explanationBulletDot} />
              <Text style={subStyles.explanationBulletText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={subStyles.explanationCollapsedHint}>{items[0]}</Text>
      )}
    </TouchableOpacity>
  );
}

export function ExplanationResult({
  tone,
  items,
}: {
  tone: ExplanationTone;
  items: string[];
}) {
  const [expanded, setExpanded] = useState(true);
  return (
    <View style={subStyles.explanationResultSection}>
      <TouchableOpacity style={subStyles.explanationSectionHeader} onPress={() => setExpanded((value) => !value)} activeOpacity={0.86}>
        <View style={subStyles.explanationStepBadge}>
          <Text style={subStyles.explanationStepBadgeText}>03</Text>
        </View>
        <Text style={subStyles.explanationSectionTitle}>Qué significa este resultado</Text>
        <View style={[subStyles.explanationChevron, expanded && subStyles.explanationChevronOpen]}>
          <ArrowRight size={15} color={COLORS.storm} />
        </View>
      </TouchableOpacity>
      <View
        style={[
          subStyles.resultMeaningCard,
          tone === "positive"
            ? subStyles.resultMeaningCardPositive
            : tone === "danger"
              ? subStyles.resultMeaningCardDanger
              : subStyles.resultMeaningCardWarning,
        ]}
      >
        <View style={subStyles.resultMeaningHeader}>
          <View
            style={[
              subStyles.resultMeaningIndicator,
              tone === "positive"
                ? subStyles.resultMeaningIndicatorPositive
                : tone === "danger"
                  ? subStyles.resultMeaningIndicatorDanger
                  : subStyles.resultMeaningIndicatorWarning,
            ]}
          />
          <Text
            style={[
              subStyles.resultMeaningTone,
              tone === "positive"
                ? subStyles.resultMeaningTonePositive
                : tone === "danger"
                  ? subStyles.resultMeaningToneDanger
                  : subStyles.resultMeaningToneWarning,
            ]}
          >
            {explanationToneLabel(tone)}
          </Text>
        </View>
        {expanded ? (
          <View style={subStyles.explanationBulletList}>
            {items.map((item) => (
              <View key={item} style={subStyles.explanationBulletRow}>
                <View style={subStyles.explanationBulletDotMuted} />
                <Text style={subStyles.explanationBulletText}>{item}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={subStyles.explanationCollapsedHint}>{items[0]}</Text>
        )}
      </View>
    </View>
  );
}

export function ExplanationActions({
  actions,
}: {
  actions: Array<{ label: string; onPress: () => void }>;
}) {
  if (actions.length === 0) return null;
  return (
    <View style={subStyles.explanationActionsSection}>
      <Text style={subStyles.explanationActionsTitle}>Qué puedes hacer ahora</Text>
      <View style={subStyles.executiveActionList}>
        {actions.map((action) => (
          <TouchableOpacity key={action.label} style={subStyles.executiveActionBtn} onPress={action.onPress} activeOpacity={0.84}>
            <Text style={subStyles.executiveActionBtnText}>{action.label}</Text>
            <ArrowRight size={15} color={COLORS.primary} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
