# Recibos divididos: historial compartido, 14 de octubre de 2026

`features/subscriptions/lib/payment-receipts.ts` es idéntico al modelo web. Representa cada grupo completo como un pago por su total, no una fila por parte ni solo el importe de la cabecera. Acepta vínculos en todas las partes o solo la primera, pero rechaza partes ausentes/anuladas, índices repetidos, otro tipo/cuenta/creador/fecha, vínculos incompatibles o importes inválidos. Los centavos nativos se suman exactamente.

Es una proyección **de solo lectura**. `receiptPartIds` no es una columna SQL ni un cambio del saldo: sirve para indicar las partes del recibo. Su ID abre el movimiento original de la primera parte; no se guarda una fila ficticia por el total.

## Consumidores reales

- `catalog-history.ts`: consulta todas las páginas de vinculados, luego todas las partes de cada grupo (también sin vínculo/anuladas) en lotes de 40. Una lectura fallida, duplicada, cambiada, incompleta o de otro espacio no produce un total parcial. Sin red usa la copia local completa.
- `subscription-payment-rows.ts`: adapta snake_case al modelo y devuelve solo las cabeceras virtuales para analítica; un grupo incompatible es error explícito.
- `applyLocalMovementHistoriesToCache`: al editar/borrar sin red recalcula suscripciones desde todas las partes, conserva categorías y saldos, y comunica un historial inválido mediante `catalogHistoryErrors`.
- Detalle y analítica móviles muestran ese error con Reintentar, sin «0 pagos» ni importes viejos. El historial indica varias partes.
- El mapper convierte el total nativo una sola vez. La web usa su mismo orden de tasa directa/inversa. No se suman conversiones de partes (pueden cambiar el redondeo de un céntimo), ni se sustituye una tasa ausente por 1.
- El modelo analítico asigna meses por America/Lima y no por el timestamp UTC o mes del teléfono.

## Evidencia local

Web `test:subscription-receipts` ejecuta modelo/servicio/analítica reales con fixtures (701 grupos y grupos de 100 partes, error en segunda página, monedas/FX, mutaciones/partes desaparecidas, lectura offline) y renderiza los componentes web. Jest `paymentReceipts.test.tsx` más `subscription-analytics.test.ts`: 6 casos del caché/mapper/componentes móviles reales, con I/O y hoja visual simulados. No prueba gestos ni el servidor desplegado.

Esta unidad **no completa las divisiones detectadas**: siguen pendientes el contrato de ocurrencias por grupo, permitir vínculos en la RPC atómica, duplicados e integración de los formularios. El guardado móvil anterior sigue siendo secuencial. No se desplegó SQL ni OTA, ni se guardó/cobró/pagó sobre registros reales. El usuario eligió solo pruebas locales.
