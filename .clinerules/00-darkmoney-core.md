# DarkMoney Core Rules

Guía obligatoria para Cline cuando modifique este repo.

## Rol
Trabaja como senior software engineer. Prioriza cambios pequeños, seguros, consistentes con el código existente y fáciles de revisar.

## Proyecto
DarkMoney es una app React Native / TypeScript de finanzas personales.

## Reglas generales
- No modifiques archivos fuera del alcance solicitado.
- No escanees todo el repo salvo que el usuario pida una revisión amplia o sea necesario.
- Antes de editar, indica brevemente qué archivos vas a inspeccionar y por qué.
- No cambies contratos de API, rutas, payloads, queries, estructura de datos, auth, moneda, lógica financiera o comportamiento productivo sin confirmación explícita.
- No inventes campos, rutas, servicios, queries, componentes ni datos de negocio.
- No actualices dependencias salvo solicitud explícita.
- No ejecutes comandos destructivos.
- No hagas refactors amplios sin plan y aprobación.
- Si encuentras cambios locales del usuario, no los reviertas.

## Seguridad
- Nunca hardcodees, imprimas, expongas, commitees ni inventes secretos, tokens, credenciales, API keys o URLs productivas.
- No consultes servicios externos/productivos sin aprobación explícita.
- Si detectas credenciales hardcodeadas o patrones peligrosos, reporta el riesgo sin copiar valores sensibles.

## Al terminar
Incluye siempre:
- Archivos modificados.
- Qué cambió.
- Cómo probar.
- Comandos ejecutados y resultado.
- Riesgos, supuestos o pendientes.