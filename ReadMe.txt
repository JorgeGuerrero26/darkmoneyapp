Guía para el desarrollador móvil — DarkMoney
1. Stack y configuración base

Expo (SDK 51+)
React Native
Expo Router v3
@supabase/supabase-js
@react-native-async-storage/async-storage
react-native-url-polyfill
Setup de Supabase en React Native:


import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

// Mantener el token vivo en foreground
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
2. Estructura de navegación (Expo Router)

app/
  (auth)/
    login.tsx
    register.tsx
    recovery.tsx
    reset-password.tsx
  (app)/
    _layout.tsx          ← tabs principales
    dashboard.tsx
    accounts.tsx
    movements.tsx
    budgets.tsx
    contacts.tsx
    obligations.tsx
    subscriptions.tsx
    notifications.tsx
    settings.tsx
  movement/[id].tsx
  account/[id].tsx
  obligation/[id].tsx
  subscription/[id].tsx
  workspace-invite/[token].tsx
  obligation-invite/[token].tsx
  onboarding.tsx
3. Módulos — funcionalidades esenciales por pantalla
Dashboard
Balance total en moneda base (suma de cuentas incluidas en net worth)
Entradas vs salidas del mes actual
Alertas de presupuestos cerca del límite o superados
Próximas suscripciones (próximos 7 días)
Créditos/deudas pendientes (resumen)
Acceso rápido a crear movimiento (FAB)
Cuentas
Lista de cuentas con balance actual y moneda
Crear / editar / archivar cuenta
Tipos: checking, savings, credit_card, cash, investment, loan, other
Flag includeInNetWorth
Ver movimientos de esa cuenta (filtrado)
Movimientos
Lista paginada (no cargar todo en móvil — usar paginación o ventana de fechas)
Tipos: income, expense, transfer, subscription_payment
Estados: planned, pending, posted, voided
Quick create: 3 pasos — tipo → monto/cuenta → descripción/categoría
Editar, confirmar borrador, anular
Preview de impacto en saldo antes de guardar
Warning si el saldo proyectado queda negativo
Adjuntar comprobante (foto de cámara / galería → Supabase Storage)
Presupuestos
Lista con barra de progreso y % consumido
Colores: verde / amarillo (alerta) / rojo (excedido)
Crear presupuesto con scope: general, por categoría, por cuenta, por categoría+cuenta
Período con fecha inicio/fin
alertPercent configurable
Rollover opcional
Categorías
Lista por kind: income, expense, both
Crear / editar / desactivar
Soporte de subcategorías (parentId)
Contactos
Lista con nombre, tipo (person / company), roles
Roles: client, supplier, employee, partner, lender, borrower, other
Ver obligaciones pendientes por cobrar / pagar asociadas
Ver movimientos vinculados
Créditos y Deudas (Obligaciones)
Dirección: receivable (me deben) / payable (yo debo)
Campos clave: monto principal, pendiente, fecha inicio, vencimiento, cuotas, interés
Registrar pago parcial
Ajustar principal (aumentar / reducir con motivo)
Historial de eventos (pagos, ajustes, apertura)
Barra de progreso de pago
Compartir con otro usuario (invitación por email, modo solo lectura)
Suscripciones
Lista con próximo cobro y monto
Frecuencias: daily, weekly, monthly, yearly
autoCreateMovement — si está activo, crea el movimiento automáticamente
remindDaysBefore — alerta anticipada
Mostrar costo mensual y anual estimado
Notificaciones
Centro de notificaciones in-app
Tipos smart: presupuestos críticos, vencimientos próximos, borradores viejos, deudas vencidas
Marcar como leída, limpiar
Badge counter en tab
Configuración
Perfil: nombre, moneda base, timezone, avatar
Preferencias de notificación: in-app, email, push
Gestión de workspaces: crear, cambiar activo, invitar miembros
Cambiar contraseña
4. Conceptos de dominio críticos que el dev debe entender
Multi-workspace: todo dato pertenece a un workspace_id. El usuario puede tener varios y cambiar entre ellos. Siempre filtrar por workspace activo.

Multi-moneda: cada cuenta y movimiento tiene su currencyCode. La app tiene una moneda base (workspace.baseCurrencyCode). Los totales del dashboard se calculan convirtiendo a moneda base usando la tabla exchange_rates.

Snapshot: la web usa useWorkspaceSnapshotQuery que trae en una sola llamada cuentas, movimientos recientes, presupuestos, obligaciones, suscripciones, categorías, contactos y tasas de cambio. En móvil conviene hacer lo mismo — una query consolidada para el estado inicial, no N queries paralelas.

Movimientos bidireccionales: un transfer crea dos registros vinculados (source account → destination account). Al crear un transfer, la app debe manejar tanto sourceAccountId/sourceAmount como destinationAccountId/destinationAmount, que pueden ser en monedas distintas con un fxRate.

Balance impactado: antes de confirmar un movimiento, mostrar cómo queda el saldo de la(s) cuenta(s) afectada(s). Si queda negativo, mostrar warning visible.

Presupuesto con scope: un presupuesto puede ser general (todo), solo por categoría, solo por cuenta, o por ambos. Al calcular el consumido hay que filtrar movimientos según ese scope.

5. Estándares de UX móvil requeridos
Navegación

Tab bar con máximo 5 tabs visibles; el resto en un menu o tab "Más"
Stack interno para detalle de cada entidad
Swipe-to-go-back nativo (no bloquear gestos del sistema)
Deep linking para invitaciones (/workspace-invite/:token, /obligation-invite/:token)
Formularios

KeyboardAvoidingView en todos los formularios con inputs
Scroll automático al campo con error
Feedback de error inline por campo (no solo un alert)
Deshabilitar botón submit mientras está guardando
Confirmar antes de descartar cambios sin guardar
Listas

FlatList con onEndReached para paginación (movimientos especialmente)
Pull-to-refresh en todas las listas
Empty state con texto diferenciado: "sin datos" vs "sin resultados con ese filtro"
Skeleton loader mientras carga (no spinner vacío)
Acciones destructivas

Siempre confirmar eliminación con Alert.alert o un bottom sheet
Nunca eliminar con un solo tap
Feedback

Toast / snackbar para éxito (crear, editar, pagar)
Error visible en pantalla, no solo en consola
Loading state en botones (ActivityIndicator dentro del botón)
Comprobantes

Acceso a cámara y galería para adjuntar a movimientos
Preview de la imagen antes de subir
Upload a Supabase Storage con progress indicator
Offline / conectividad

Mostrar banner cuando no hay conexión
No crashear en ausencia de red — manejar errores de Supabase gracefully
6. Seguridad y auth
Supabase RLS activo en todas las tablas — el dev móvil no necesita implementar autorización extra, pero debe asegurarse de que nunca se usen service keys en el cliente móvil
Usar solo anon key en el cliente
Acciones sensibles (crear invitación, checkout Pro) deben ir por Edge Functions con validación server-side
Refresh token automático via AppState (ver punto 1)
Biometría opcional para abrir la app (Face ID / fingerprint) usando expo-local-authentication — bloquear la app pero no re-autenticar con Supabase
7. Notificaciones push
Usar expo-notifications para push locales (recordatorios de suscripciones, vencimientos)
Para push remotas: Expo Push Notifications Service → puede integrarse con Supabase Edge Functions que ya manejan la lógica de notificaciones
El token de push se guarda en notification_preferences table junto con push_enabled
Respetar el flag pushEnabled del perfil del usuario
8. Lo que NO hace falta reimplementar
La lógica de negocio ya existe en Supabase:

Vistas: v_counterparty_summary, v_account_balance, etc.
RLS: acceso por workspace ya configurado
Edge Functions: invitaciones, checkout, acciones críticas
El dev móvil consume la misma API que la web. No hay backend nuevo que construir.

9. Orden de desarrollo recomendado

1. Auth completo (login, register, recovery, onboarding)
2. Shell con tabs + workspace selector
3. Dashboard (snapshot query → cards de resumen)
4. Movimientos (lista + quick create)
5. Cuentas (lista + crear/editar)
6. Presupuestos (lista con progress bars)
7. Notificaciones (centro + badge)
8. Categorías + Contactos (listas simples)
9. Créditos/Deudas (más complejo por eventos + compartir)
10. Suscripciones
11. Configuración + perfil
12. Comprobantes (cámara + storage)
13. Push notifications
14. Biometría (opcional)