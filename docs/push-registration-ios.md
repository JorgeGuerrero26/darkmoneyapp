# Activación push en iPhone

## Incidente del 6 de octubre de 2026

Al activar «Push en este dispositivo», Ajustes mostraba «Sin conexión. Revisa tu internet».
El registro clasificaba **todas** las excepciones de `getExpoPushTokenAsync` como errores de red.
Eso incluía la ausencia de `aps-environment` en la firma de iOS. Los errores de permisos
no se capturaban y el guardado en Supabase ignoraba su campo `error`.

La instalación documentada en [REINSTALL_IOS.md](REINSTALL_IOS.md) usa Apple ID gratuito,
AltStore/SideStore y entitlements vacíos. Esa instalación no permite registro APNs.
Este antecedente apunta a una causa probable; todavía falta verificar el error del iPhone
actual con el nuevo diagnóstico. La consulta agregada de preferencias durante la investigación
no encontró ningún dispositivo registrado como iOS.

## Implementación

- `services/push-registration.ts` comparte la petición en curso entre bootstrap y Ajustes,
  captura errores de permisos/canal/token y comprueba el resultado del guardado.
- `lib/push-registration-errors.ts` distingue firma/configuración nativa, permisos, red,
  servicio, espera agotada y fallo desconocido. Un fallo desconocido no demuestra falta de internet.
- Se usan los códigos de Expo: `ERR_NOTIFICATIONS_NETWORK_ERROR` y
  `ERR_NOTIFICATIONS_SERVER_ERROR` tienen significados diferentes. «Fetching» en un mensaje
  no demuestra que el teléfono esté desconectado.
- El registro del token tiene un límite de 25 segundos. El diálogo de permisos no tiene ese
  límite; el usuario puede tardar en decidir. Agotar la espera no cancela el registro nativo,
  pero una respuesta tardía no guarda ni activa avisos por su cuenta.
- Ajustes muestra progreso durante la activación y bloquea intentos simultáneos.
- Los fallos quedan en `app_error_logs`, fuente `push-registration`, con etapa y motivo.
  El token obtenido no se imprime en consola.

## Qué puede corregir OTA

OTA actualiza el diagnóstico, la interfaz y el flujo de registro. **No cambia los entitlements
ni la firma del binario instalado**. Si el error es `aps-environment`, hace falta una nueva
instalación firmada con capacidad Push Notifications y las credenciales APNs del proyecto.
No añadir esa capacidad a una firma de Apple ID gratuito: volvería a fallar la firma.

Las notificaciones locales y la bandeja de avisos de la app son vías distintas del registro push.
No deben deshabilitarse por un fallo APNs.

## Validación

Pruebas automatizadas: falta de entitlement, servidor frente a red, error desconocido,
permisos denegados y excepciones, concurrencia, espera agotada con respuesta tardía y error
de persistencia. Ejecutar `npm run test -- --runInBand __tests__/push-registration.test.ts`
y `npm run typecheck`.

Pendiente en dispositivo:

1. Recibir OTA en el iPhone e intentar activar push. Confirmar mensaje y log `push-registration`.
2. En una instalación con capacidad APNs, permitir notificaciones y comprobar el guardado real.
3. Probar permisos bloqueados, reintento y servicio inaccesible.
4. Validar recepción de un push real con su ticket y recibo del proveedor.

Referencias: [Expo: diagnóstico push](https://docs.expo.dev/push-notifications/faq/),
[Apple: registro APNs](https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns).
