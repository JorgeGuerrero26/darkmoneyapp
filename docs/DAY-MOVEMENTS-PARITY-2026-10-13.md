# Detalle diario: paridad local del 13 de octubre de 2026

Se conserva la hoja existente y sus grupos Ingresos, Gastos y Transferencias. Se separan sus reglas en `features/dashboard/lib/day-movements-model.ts`, idéntico al modelo web. La auditoría del módulo dirigió la extracción de cálculos fuera del JSX y los estados de carga/error explícitos.

## Correcciones

- Ahorro = ingresos − gastos; traspasos y aperturas de obligaciones no lo aumentan. Cobros de obligaciones y devoluciones leen destino; pagos y suscripciones leen origen. Los grupos muestran conteo y subtotal.
- Resumen en moneda de visualización con tasas persistidas directas, inversas o vía moneda base. Sin moneda/tasa/importe válido, el registro no suma y se declara parcial. Las filas mantienen la moneda original: desaparece la relabelación incorrecta a soles cuando faltaba tasa.
- La hoja usa una consulta del día exacto en Perú, no la lista limitada de 90 días del dashboard. Páginas de 500 y conteo exacto; un fallo, cambio de conteo o ID repetido no entrega un total parcial silencioso. Los límites son inicio incluido y siguiente día excluido.
- Clave por usuario, espacio y día, sin placeholder anterior; se conserva el prefijo de invalidaciones `dashboard-movements`. Carga/error ocultan dinero anterior y ofrecen reintento de lectura. Los comprobantes mantienen su consulta Storage existente.
- Modo simple usa su propia moneda, igual que el gráfico que abre el detalle. El modo avanzado conserva la suya.

## Validación y pendientes

- Typecheck móvil pasa; Jest: 10 casos en `dayMovements.test.ts` y `DayMovementsSheet.test.tsx`. Modelo y hoja reales con lectura/animación/insets simulados. No se ejecutó Jest completo.
- Web ejecuta ambos modelos, la función direccional móvil y `fetchDashboardDayMovements` real con cliente simulado: 1.003 filas históricas, error de segunda página, cambios durante paginación y consultas correctamente acotadas. También renderiza el diálogo web con fixtures.
- Lint global: 0 errores, 424 advertencias antes de añadir la suite de interfaz. La comprobación final de los cinco archivos de esta unidad (hoja, suite de interfaz, modelo, suite pura y consulta) pasa sin errores ni advertencias. No se usa `--fix`.
- No es una instantánea transaccional entre páginas: una edición concurrente que mantenga conteo/IDs puede requerir refrescar. No hay prueba contra servidor, RLS/Storage reales, dos dispositivos ni gestos/posición visual en teléfono.
- No se publicó OTA ni se modificaron registros reales. Se preservó el trabajo ajeno de offline y Suscripciones. Push de código no significa instalado. Los demás pendientes de paridad continúan en la auditoría web.
