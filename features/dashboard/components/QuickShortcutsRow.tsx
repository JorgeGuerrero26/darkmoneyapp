import { memo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Check, ChevronRight, Plus } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { formatCurrency } from "../../../components/ui/AmountDisplay";
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACING, SURFACE } from "../../../constants/theme";
import { buildQuickRow, type QuickEntry } from "../../movements/lib/quickEntries";

type Props = {
  /** Los que encajan con este momento. */
  entries: QuickEntry[];
  /** Todos los que existen, para la puerta "Ver todos". */
  pool: QuickEntry[];
  currencyCode: string;
  /** El que se está guardando ahora mismo, para no dejar el toque sin respuesta. */
  savingKey: string | null;
  /** El último guardado: el mosaico enseña la marca unos segundos y vuelve. */
  savedKey: string | null;
  onRegister: (entry: QuickEntry) => void;
};

/**
 * Los gastos que repites, a un toque, en mosaicos de un tercio.
 *
 * **Por qué existe.** Registrar los S/ 2 de la moto al trabajo son cinco pasos —abrir el
 * formulario, tipo, monto, cuenta, categoría— para un dato que se repite veintiocho veces al mes
 * y siempre igual. La app ya sabe cuál es: está en tus propios movimientos.
 *
 * **Por qué no lleva rótulo.** Tenía uno —"LO DE SIEMPRE"— y entre el rótulo y una tarjeta se
 * comían ~130px del sitio más caro de la app para ahorrar un toque. Un mosaico que dice
 * "+ Moto · S/ 4.00" no necesita que le expliquen qué es; el rótulo pesaba más que el dato que
 * anunciaba. La fila entera cabe ahora en 52px, que sigue siendo objetivo táctil de sobra.
 *
 * **Por qué tercios fijos y no una fila que crece.** Con cinco atajos, una fila de cápsulas se
 * convierte en un desplazamiento horizontal cortado en el borde — la misma cápsula a medias que
 * se sacó de siete formularios y cuatro listas. Tres tercios no saltan de línea ni se cortan:
 * un nombre largo se recorta con puntos suspensivos dentro de su tercio. Cuando hay más de los
 * que caben, el tercer sitio es la puerta al resto.
 *
 * **Y la fila no tiene que estar llena.** Con uno se pinta uno, del mismo ancho de tercio. Entre
 * las 5 y las 9 de la mañana solo encaja la moto —el atajo con más repeticiones de los nueve— y
 * esconderla por no tener compañía era tapar el mejor dato en el momento exacto en que se usa.
 * Ver [[buildQuickRow]].
 *
 * **Y por qué no hay IA aquí.** Es contar repeticiones y mirar la hora. Así es instantáneo,
 * gratis y funciona sin señal: tres cosas que una llamada a un modelo no da.
 */
function QuickShortcutsRowBase({
  entries,
  pool,
  currencyCode,
  savingKey,
  savedKey,
  onRegister,
}: Props) {
  const [allOpen, setAllOpen] = useState(false);
  const { tiles, showAll } = buildQuickRow(entries, pool);

  if (tiles.length === 0) return null;

  return (
    <>
      <View style={styles.row}>
        {tiles.map((entry) => (
          <Tile
            key={entry.key}
            entry={entry}
            currencyCode={currencyCode}
            saving={savingKey === entry.key}
            saved={savedKey === entry.key}
            onPress={() => onRegister(entry)}
          />
        ))}
        {showAll ? (
          <Pressable
            style={({ pressed }) => [styles.tile, styles.moreTile, pressed && styles.tilePressed]}
            onPress={() => setAllOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Ver los ${pool.length} atajos`}
          >
            <Text style={styles.moreLabel} numberOfLines={1}>Ver todos</Text>
            <ChevronRight size={14} color={COLORS.storm} strokeWidth={2} />
          </Pressable>
        ) : null}
      </View>

      <BottomSheet visible={allOpen} onClose={() => setAllOpen(false)} title="Tus atajos" snapHeight={0.7}>
        <View style={styles.sheetList}>
          {pool.map((entry, index) => (
            <Pressable
              key={entry.key}
              style={({ pressed }) => [
                styles.sheetRow,
                index < pool.length - 1 && styles.sheetRowDivided,
                pressed && styles.tilePressed,
              ]}
              onPress={() => { setAllOpen(false); onRegister(entry); }}
              accessibilityRole="button"
              accessibilityLabel={`Anotar ${entry.label} de ${formatCurrency(entry.amount, currencyCode)}`}
            >
              <Plus size={15} color={COLORS.fog} strokeWidth={2.5} />
              <Text style={styles.sheetLabel} numberOfLines={1}>{entry.label}</Text>
              <Text style={styles.sheetAmount}>{formatCurrency(entry.amount, currencyCode)}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheet>
    </>
  );
}

function Tile({
  entry,
  currencyCode,
  saving,
  saved,
  onPress,
}: {
  entry: QuickEntry;
  currencyCode: string;
  saving: boolean;
  saved: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, saving && styles.tileSaving]}
      onPress={onPress}
      disabled={saving}
      accessibilityRole="button"
      accessibilityLabel={`Anotar ${entry.label} de ${formatCurrency(entry.amount, currencyCode)}`}
    >
      <View style={styles.tileHead}>
        {saving ? (
          <ActivityIndicator size="small" color={COLORS.storm} />
        ) : saved ? (
          /* La marca dura unos segundos y vuelve sola: confirma sin convertirse en un estado. */
          <Check size={14} color={COLORS.income} strokeWidth={3} />
        ) : (
          <Plus size={14} color={COLORS.fog} strokeWidth={2.5} />
        )}
        <Text style={styles.tileLabel} numberOfLines={1}>{entry.label}</Text>
      </View>
      <Text style={styles.tileAmount} numberOfLines={1}>
        {formatCurrency(entry.amount, currencyCode)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: SPACING.sm },
  tile: {
    /* Un tercio SIEMPRE, haya uno o tres.
       `flexBasis` en vez de `flex: 1` porque la fila ya no tiene que estar llena: con `flex: 1`
       un atajo solo se estiraría a lo ancho y volvería a ser la tarjeta pesada que quitamos —
       un chip suelto son 44px, no una barra. Con tres, `flexShrink` los encoge lo justo para
       que quepan los huecos, así que siguen siendo tercios iguales.
       `minWidth: 0` es lo que hace que un nombre largo se recorte DENTRO de su tercio en vez de
       empujar al siguiente y desbordar la fila. */
    flexBasis: "33.33%",
    flexGrow: 0,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 52,
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
  },
  tilePressed: { opacity: 0.7 },
  tileSaving: { opacity: 0.6 },
  tileHead: { flexDirection: "row", alignItems: "center", gap: SPACING.xs },
  tileLabel: {
    flexShrink: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.sm,
    color: COLORS.ink,
  },
  tileAmount: {
    fontFamily: FONT_FAMILY.heading,
    fontSize: FONT_SIZE.xs,
    color: COLORS.storm,
    paddingLeft: 20,
  },
  moreTile: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xs },
  moreLabel: { fontFamily: FONT_FAMILY.bodyMedium, fontSize: FONT_SIZE.sm, color: COLORS.fog },
  sheetList: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: SURFACE.cardBorder,
    backgroundColor: SURFACE.card,
    overflow: "hidden",
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    minHeight: 56,
    paddingHorizontal: SPACING.md,
  },
  sheetRowDivided: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SURFACE.separator,
  },
  sheetLabel: {
    flex: 1,
    fontFamily: FONT_FAMILY.bodyMedium,
    fontSize: FONT_SIZE.md,
    color: COLORS.ink,
  },
  sheetAmount: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.md, color: COLORS.ink },
});

export const QuickShortcutsRow = memo(QuickShortcutsRowBase);
