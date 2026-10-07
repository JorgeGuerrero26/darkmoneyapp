import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Copy, Mail, MoreVertical, RefreshCw } from "lucide-react-native";

import { BottomSheet } from "../../../components/ui/BottomSheet";
import { Button } from "../../../components/ui/Button";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { DetailActionBar } from "../../../components/ui/DetailActionBar";
import { DetailFieldRow } from "../../../components/ui/DetailFieldRow";
import { HeaderActionGroup } from "../../../components/ui/HeaderActionGroup";
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING, SURFACE } from "../../../constants/theme";

type Props = {
  visible: boolean;
  workspaceName: string;
  address: string | null;
  isLoading: boolean;
  isError: boolean;
  isGenerating: boolean;
  isCopying: boolean;
  canGenerate: boolean;
  onClose: () => void;
  onRetry: () => void;
  onCopy: () => void;
  onGenerate: () => Promise<boolean>;
};

/** Configuración de correo: lectura por secciones y una acción fija compartida. */
export function EmailDetectionSheet({
  visible, workspaceName, address, isLoading, isError, isGenerating, isCopying,
  canGenerate, onClose, onRetry, onCopy, onGenerate,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = isGenerating || isCopying;
  const loading = isLoading && !address;
  const failed = isError && !address;

  useEffect(() => {
    setMenuOpen(false);
    setConfirmOpen(false);
  }, [visible, address, workspaceName]);

  const generate = async () => {
    if (busy || !canGenerate) return;
    if (await onGenerate()) setConfirmOpen(false);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Detectar pagos por correo"
      entranceAnimation="springFade"
      snapHeight={0.9}
      contentStyle={styles.content}
      headerAction={address ? <HeaderActionGroup actions={[{
        key: "more", icon: MoreVertical, accessibilityLabel: "Más acciones de la dirección",
        disabled: busy || !canGenerate, onPress: () => setMenuOpen((open) => !open),
      }]} /> : undefined}
      footer={<DetailActionBar primary={{
        label: isGenerating ? "Generando…" : isCopying ? "Copiando…" : loading ? "Cargando…" : failed ? "Reintentar" : address ? "Copiar dirección" : "Generar dirección",
        accessibilityLabel: failed ? "Reintentar cargar la dirección" : address ? "Copiar dirección de recepción" : "Generar dirección de recepción",
        icon: failed ? RefreshCw : address ? Copy : Mail,
        loading: busy || loading,
        disabled: !address && !failed && !canGenerate,
        onPress: failed ? onRetry : address ? onCopy : () => { void generate(); },
      }} />}
      overlay={<ConfirmDialog
        inline
        visible={confirmOpen}
        entranceAnimation="springFade"
        title="¿Cambiar la dirección?"
        body="La dirección actual dejará de recibir pagos en DarkMoney. Tendrás que confirmar la nueva dirección en Gmail y actualizar tus filtros de reenvío."
        confirmLabel="Cambiar dirección"
        confirmLoading={isGenerating}
        confirmLoadingLabel="Generando…"
        onCancel={() => { if (!isGenerating) setConfirmOpen(false); }}
        onConfirm={() => { void generate(); }}
      />}
    >
      {menuOpen ? <View style={styles.menu}>
        <Button label="Cambiar dirección" variant="ghost" disabled={busy} onPress={() => {
          setMenuOpen(false);
          setConfirmOpen(true);
        }} />
        <Text style={styles.caption}>Requiere actualizar el reenvío en Gmail.</Text>
      </View> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tu dirección</Text>
        <DetailFieldRow label="Workspace" value={workspaceName} last />
        {loading ? <View style={styles.state}>
          <ActivityIndicator color={COLORS.storm} />
          <Text style={styles.caption}>Cargando tu dirección…</Text>
        </View> : failed ? <View style={styles.state}>
          <Text style={styles.error}>No pudimos cargar tu dirección.</Text>
          <Text style={styles.caption}>Reintenta para consultar la configuración de este workspace.</Text>
        </View> : address ? <>
          <Text style={styles.caption}>Dirección creada</Text>
          <Text selectable style={styles.address}>{address}</Text>
          <Text style={styles.caption}>Configura el reenvío en Gmail para empezar a recibir comprobantes.</Text>
        </> : <Text style={styles.caption}>
          Genera una dirección privada para recibir los comprobantes de este workspace.
        </Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cómo conectar Gmail</Text>
        <Text style={styles.caption}>Desde una computadora</Text>
        <SetupStep number="1" title="Añade tu dirección" description="En Gmail: Configuración → Ver todos los ajustes → Reenvío → Añadir una dirección de reenvío." />
        <SetupStep number="2" title="Confirma el reenvío" description="Gmail enviará un mensaje a tu dirección privada. Durante el piloto, abre ese mensaje en Resend → Emails → Receiving y usa el enlace o código de confirmación." />
        <SetupStep number="3" title="Filtra los comprobantes" description="Crea un filtro para los comprobantes de tu banco y elige «Reenviar a» tu dirección. Mantén desactivado el reenvío general de la bandeja." last />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Cómo funciona</Text>
        <DetailFieldRow label="Formatos disponibles" value="BCP y Yape" />
        <DetailFieldRow label="Dónde revisar" value="Notificaciones" last />
        <Text style={styles.caption}>Revisa cada sugerencia antes de registrarla. DarkMoney recibe solo los correos que reenvías; no accede al resto de tu bandeja.</Text>
      </View>
    </BottomSheet>
  );
}

function SetupStep({ number, title, description, last = false }: { number: string; title: string; description: string; last?: boolean }) {
  return <View style={[styles.step, !last && styles.divider]}>
    <Text style={styles.stepNumber}>{number}</Text>
    <View style={styles.stepBody}>
      <Text style={styles.stepTitle}>{title}</Text>
      <Text style={styles.caption}>{description}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg, gap: SPACING.xxl },
  section: { gap: SPACING.sm },
  sectionTitle: { fontFamily: FONT_FAMILY.heading, fontSize: FONT_SIZE.lg, color: COLORS.ink },
  caption: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, lineHeight: 21 },
  address: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink, lineHeight: 24 },
  state: { alignItems: "flex-start", gap: SPACING.sm, paddingVertical: SPACING.md },
  error: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.dangerStrong },
  menu: { gap: SPACING.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator, paddingBottom: SPACING.md },
  step: { flexDirection: "row", gap: SPACING.md, paddingVertical: SPACING.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SURFACE.separator },
  stepNumber: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.storm, paddingTop: SPACING.xs },
  stepBody: { flex: 1, gap: SPACING.xs },
  stepTitle: { fontFamily: FONT_FAMILY.bodySemibold, fontSize: FONT_SIZE.md, color: COLORS.ink },
});
