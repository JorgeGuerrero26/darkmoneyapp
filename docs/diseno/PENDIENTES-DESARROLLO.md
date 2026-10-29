# Pendientes para desarrollo — DarkMoney

29 oct 2026 · Reúne los "Datos a revisar" y "Para el desarrollador" de las revisiones 43–54 (móvil) y App web 5–6.
Marcar con [x] al resolver.

## 1. Cálculos que cambian lo que ve el usuario (prioridad alta)

> Revisado en el código el 29 oct. La mayoría ya está resuelta en `AdvancedDashboard.tsx`; lo que falta es que las **correcciones de saldo** todavía se cuelan en Patrones y en la proyección.

- [x] ~~Correcciones en Historial, detalle del mes, ahorro, reserva y Salud.~~ Resuelto: `isHistoryBalanceCorrection` (`features/dashboard/lib/history-view.ts:17`) se aplica en `annualHistory`, `monthlySavingsRate`, `cashCushion` y el detalle del mes, que ya separa `correctionIds`.
- [x] **Correcciones en Patrones.** Los cuatro cálculos usan una lista filtrada que excluye correcciones de saldo. Pendiente verificar en dispositivo con datos reales.
  - `patternMovements` alimenta el gasto semanal, anomalías, hábitos repetidos y subidas por categoría.
- [x] **Correcciones en la proyección (gasto típico).** `useCashflowProjection` excluye correcciones del historial de gasto habitual y tarjetas; la prueba cubre seis meses. Pendiente verificar en dispositivo con datos reales.
- [x] **Dashboard simple:** `app/(app)/dashboard.tsx` filtra correcciones en `simpleMovements` antes de calcular `simpleStats` y `simpleMonthStats`. Pendiente verificar en dispositivo con datos reales.
- [x] ~~La proyección usa la mediana de 1 mes.~~ Resuelto: `useProjectionHistoryQuery` carga 6 meses terminados (`PROJECTION_HISTORY_MONTHS`) y Flujo avisa cuando hay menos de 3.
- [x] ~~La nota de Salud usa el ahorro del mes.~~ Resuelto: `healthInputs` usa `healthBaseline` (meses completos), no `lastRate`.
- [x] ~~El promedio de 6 meses da 0.0% y abr–jun salen vacíos.~~ Resuelto: `recentHistoryMovements` une la query de 6 meses y `periodSavingsRate` pondera por ingresos.
- [x] ~~Barras por día suman distinto al total.~~ Resuelto: `weeklySpendPattern` calcula el promedio por día de la semana y PatternsTab lo rotula así.
- [x] ~~Umbral 70% vs 80%.~~ Resuelto: `SYSTEM_CONFIDENT_THRESHOLD = 80` en `system-state.ts`, con test.

## 2. Cifras que no coinciden entre pantallas

Todas deben venir de una misma función o selector.

- [ ] **Próximos 7 días:** +S/ 564.10 (Flujo) vs −S/ 62.00 (Resumen). *(rev. 47)*
- [x] ~~**Cierre de mes:** S/ 5,151.60 (Flujo), S/ 5,194.01 (Resumen), S/ 4,927.33 (Fin de mes).~~ Resuelto en código: Resumen y Flujo leen el mismo `useCashflowProjection`. Confirmar en la app que también coincide con la hoja Fin de mes. *(rev. 47)*
- [x] ~~**Reserva:** 0.9 vs 1.2 meses.~~ Resuelto en código: Salud y caja usan `healthBaseline`. Confirmar en la app. *(rev. 50)*
- [ ] **Suscripciones:** las filas suman S/ 62.00 y el total dice S/ 115.90. *(rev. 47)*
- [ ] **7 d y 15 d muestran exactamente lo mismo** (S/ 680 / S/ 115.90 / S/ 5,365.08). *(rev. 47)*
- [ ] **"Agenda comprometida +S/ 618" en verde:** si es comprometido, no debería sumar. *(rev. 47)*

## 3. Datos y nombres

- [ ] **Hábitos sin descripción toman el nombre de la cuenta** ("Cuenta Principal"). Usar "Gasto sin descripción" / "Ingreso sin descripción" y poner la cuenta en la segunda línea. *(rev. 46)*
- [ ] **Tres presupuestos llamados "Alimentación mensual" con cifras distintas:** ¿duplicados o de meses distintos? *(rev. 51)*
- [ ] **Tildes en categorías del sistema:** Tecnología, Alimentación, Diversión. *(rev. 48, 50)*
- [ ] **"Cuenta 8":** nombre por defecto. Pedir nombre al crear. *(rev. 47)*
- [ ] **Errores de tipeo del usuario** ("Correción", "Suelgo AGV", "Yt Premiun"): opcional, sugerir corrección. *(rev. 49, 51)*
- [ ] **"Actualizado hace 42s" → "hace 42 s"** (con espacio). *(rev. 54)*

## 4. Colores mal asignados

- [ ] **Ahorro 20.6% en naranja (clay)** aunque es positivo. *(rev. 48)*
- [ ] **"Gastos −S/ 5,623.93 vs mes anterior" en clay:** gastar menos es bueno. Comparaciones en gris y en palabras. *(rev. 49)*
- [x] ~~**Umbral de confiabilidad de datos:** usar 80% en todas partes.~~ Resuelto (ver grupo 1). *(rev. 43, 50)*

## 5. Reglas de implementación (componentes compartidos)

- [ ] **Formularios:** estado por campo `missing | invalid | ok` y `submitError` solo para errores sin campo. Hoy el mismo mensaje se pinta dos veces y el botón cambia a "Reintentar" con cualquier fallo. *(rev. 53, web 6e)*
- [ ] **Confirmaciones:** banner arriba, 3 s, nunca empuja el botón +. *(rev. 40, web 5c)*
- [ ] **Sin conexión:** cola global con estado `online | offline | syncing | needsReview`, leído por el encabezado de todas las pantallas. Esperar 2–3 s antes de mostrar "Sin conexión". *(rev. 54, web 6f)*
- [ ] **Detecciones:** estado `pendiente | guardada | descartada` separado de leído/no leído. Una sola fuente para dashboard, "Ver los N" y Notificaciones. La revisión es el mismo componente en todas. Las detecciones no entran en la cola sin conexión. *(rev. 52, web 6g)*
- [ ] **Margen inferior del scroll:** el botón + tapa "Informe con IA" y podría tapar botones de tarjetas. *(rev. 52)*
- [ ] **Web: hojas de móvil = panel lateral de 440 px** con fundido, Esc cierra y conserva lo escrito. *(web 5c)*
- [ ] **Encabezado igual en todas las pestañas del dashboard** ("Hola, Adrian"), sin cambiar el título por pestaña. *(rev. 46)*

## 6. Ocultar cuando no hay nada que decir (regla 5)

- [ ] **"Eficiencia de cobro"** sin datos (y con "receivable" en inglés). *(rev. 50)*
- [ ] **"Exposición por moneda"** con 100% PEN, y el botón PEN/USD en el dashboard simple. *(rev. 50, 51)*
- [ ] **"Comparación estacional"** hasta tener 12 meses. *(rev. 48)*
- [ ] **"Cambio detectado"** si no hay cambio significativo. *(rev. 48)*
- [ ] **Tarjeta "Por revisar"** con 0 pendientes, sin dejar hueco. *(rev. 52)*
