import { Text, View } from "react-native";

import { COLORS } from "../../../constants/theme";
import { styles } from "../ObligationAnalyticsModal.styles";

type Props = {
  paidInstallments: number;
  totalInstallments: number;
  installmentsDoneAdj: string;
  isSharedViewer: boolean;
};

export function AnalyticsInstallmentGrid({
  paidInstallments,
  totalInstallments,
  installmentsDoneAdj,
  isSharedViewer,
}: Props) {
  if (totalInstallments <= 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>
        Cuotas: {paidInstallments} de {totalInstallments} {installmentsDoneAdj}
      </Text>
      {isSharedViewer ? (
        <Text style={styles.sectionHint}>
          Este bloque sigue mostrando el avance contractual de la obligacion. No cambia por la perspectiva de caja del analisis.
        </Text>
      ) : null}
      <View style={styles.installmentGrid}>
        {Array.from({ length: totalInstallments }, (_, i) => {
          const n = i + 1;
          const paid = n <= paidInstallments;
          return (
            <View
              key={n}
              style={[styles.installmentCell, paid ? styles.installmentPaid : styles.installmentPending]}
            >
              <Text style={[styles.installmentNum, { color: paid ? COLORS.pine : COLORS.storm }]}>
                {n}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
