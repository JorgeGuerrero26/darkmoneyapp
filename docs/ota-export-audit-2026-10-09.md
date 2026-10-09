# Exportación OTA incompleta: 9 de octubre de 2026

## Síntoma y evidencia

El iPhone mostró el diseño antiguo en toda la aplicación después de una OTA.
El código del repositorio conservaba el diseño actual; los últimos commits solo
modificaban la revisión de movimientos detectados.

Los registros de arranque de producción mostraron el cambio:

- 13:12:03 (Lima): OTA `01a12133-55aa-7aed-8bca-e0c30cfe3e9a`, `embedded=false`.
- Desde 13:12:12: actualización del instalador
  `5791b946-3a25-4c3c-b7dd-b7f5c3fe4a5f`, `embedded=true`.

Los manifiestos de Expo permitieron comparar los paquetes publicados:

| Paquete iOS | Recursos | Fuentes TTF |
| --- | ---: | ---: |
| OTA estable `01a12133-55aa-7aed-8bca-e0c30cfe3e9a` | 63 | 32 |
| OTA problemática `01a121db-bfe9-7712-bed8-06a2074c3d4c` | 26 | 0 |
| Nueva exportación completa del commit `8ae6429f` | 63 | 32 |

La exportación problemática terminó con éxito pero contenía aproximadamente
1.945 módulos. La nueva exportación con caché limpia contiene 4.976 fuentes en
el mapa iOS y 4.983 en Android, incluyendo las pantallas y el componente de
revisión de movimientos.

Esto confirma una exportación incompleta. La caché de Metro/Expo Router al
publicar desde worktrees es una posible causa; no se ha aislado todavía si el
directorio oculto, el enlace a `node_modules` o la caché compartida la provocó.

## Recuperación y prevención

Se republicó primero el grupo estable
`81a59ef5-f086-41f1-8b69-73e61ba7980d` para el runtime 1.0.8. El grupo de
restauración es `8f9dd9b8-dda1-4877-ad6a-2951de22f325`.

El publicador ahora exporta con `--clear`, mapas de fuentes y mapa de recursos.
Antes de subir cada runtime, verifica ambos paquetes nativos:

- Bundle y recursos presentes y no vacíos.
- Pantallas principales, detalles y tarjeta de detecciones en el mapa de fuentes.
- Archivo e IBM Plex Sans incluidas en los recursos de cada plataforma.

Solo después ejecuta `eas update --skip-bundler` sobre el paquete validado.
`npm run test:ota` comprueba que se bloqueen exportaciones incompletas y se
ejecuta también en CI.

La comprobación automatizada del paquete no sustituye la apertura en el iPhone.
La validación visual en dispositivo de la nueva OTA queda pendiente de la
confirmación del usuario o de registros de arranque posteriores.

Referencia: [recuperación de errores de EAS Update](https://docs.expo.dev/eas-update/error-recovery/).
