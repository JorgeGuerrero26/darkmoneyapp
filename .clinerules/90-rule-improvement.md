# Rule and Workflow Improvement

Cline debe ayudar a mejorar las reglas, workflows e instrucciones del proyecto, pero nunca debe modificarlas sin aprobación explícita del usuario.

## Objetivo

Detectar patrones repetitivos, decisiones recurrentes, errores frecuentes o convenciones del proyecto que deberían documentarse para futuras conversaciones o desarrollos.

La mejora debe ser gradual: no crear reglas por cada caso puntual. Solo proponer nuevas reglas o workflows cuando el patrón sea realmente reutilizable.

## Cuándo proponer una nueva regla o workflow

Si durante una tarea detectas cualquiera de estos casos:

- El usuario repite la misma instrucción varias veces.
- Hay un patrón de arquitectura recurrente.
- Hay una convención de UI, filtros, moneda, queries, Supabase, React Query o validación que no está documentada.
- Se corrige el mismo tipo de error más de una vez.
- Una tarea se vuelve repetitiva y podría convertirse en workflow.
- Una revisión descubre una desviación común en módulos.
- Un patrón de código debería mantenerse en futuras conversaciones.
- El agente tuvo que inferir una regla importante que debería quedar explícita.
- Hay una decisión de producto o dominio que impacta varios módulos.
- Hay un comando, checklist o flujo de validación que conviene reutilizar.
- Hay una restricción de seguridad, datos, moneda o workspace que debería prevenir errores futuros.

Entonces propone una mejora.

## Tipos de mejora

Usar estas categorías:

### Rule

Para reglas permanentes del proyecto que deben estar siempre disponibles.

Ejemplos:
- No hardcodear tasas de cambio.
- No consultar Supabase desde componentes visuales.
- Las pantallas tipo recurso usan `ResourceModuleTemplate`.
- La moneda base siempre viene de settings y monedas soportadas.

Ruta sugerida:

```txt
.clinerules/<archivo>.md
```

### Workflow

Para procedimientos repetitivos que el usuario puede invocar cuando los necesite.

Ejemplos:
- Auditar un módulo.
- Migrar un módulo a `ResourceModuleTemplate`.
- Revisar contratos de queries.
- Preparar una revisión antes de commit.

Ruta sugerida:

```txt
.clinerules/workflows/<nombre>.md
```

### Skill

Solo si Cline Skills está disponible en esta instalación.

Ejemplos:
- `darkmoney-resource-module`
- `darkmoney-module-audit`

Ruta sugerida:

```txt
.cline/skills/<skill-name>/SKILL.md
```

Si Skills no está disponible, proponer un Workflow en lugar de una Skill.

## Formato obligatorio de propuesta

Antes de crear o editar reglas, workflows o skills, preguntar al usuario con este formato:

```md
Propongo crear/actualizar una regla o workflow.

Tipo:
- Rule / Workflow / Skill

Nombre propuesto:
- ...

Trigger:
- Cuándo debería aplicarse.

Motivo:
- Por qué conviene guardarlo.

Contenido propuesto:
- Resumen de reglas o pasos.

Archivos a modificar:
- ...

¿Autorizas que lo cree/actualice?
```

## Restricciones

- No crear ni modificar `.clinerules/`, `.cline/skills/`, `.agents/skills/`, `skills/` o `AGENTS.md` sin aprobación explícita.
- No guardar secretos, credenciales, env reales, tokens, URLs productivas ni datos sensibles.
- No copiar valores sensibles aunque parezcan necesarios para documentar un patrón.
- Mantener reglas cortas, específicas y accionables.
- Si una regla ya existe, proponer actualizarla en vez de duplicarla.
- Si el patrón solo aplica a una tarea puntual, no crear regla.
- No crear reglas basadas en suposiciones débiles; primero confirmar con el usuario.
- No modificar `.gitignore` sin autorización. Si se necesita ignorar reglas locales, sugerir `.git/info/exclude`.
- No hacer commits de reglas locales salvo que el usuario lo pida explícitamente.

## Criterios para decidir si vale la pena guardar una regla

Antes de proponer, evaluar:

- ¿Este patrón se repetirá en más de un módulo?
- ¿Evita errores futuros?
- ¿Reduce tokens o explicaciones repetidas?
- ¿Es específico de este repo?
- ¿Tiene impacto en arquitectura, UI, filtros, queries, moneda, seguridad o validación?
- ¿El usuario ya lo pidió o corrigió más de una vez?

Si la respuesta es mayormente sí, proponer la regla.

Si no, solo mencionar la observación en la respuesta final sin crear regla.

## Cómo responder cuando se detecta un patrón

Si detectas un patrón útil, al final de la respuesta agrega una sección breve:

```md
**Posible mejora de reglas**
Detecté un patrón que podría documentarse para futuras tareas: ...
Puedo proponerte una regla/workflow concreta si deseas guardarlo.
```

Si el usuario pide guardarlo, presentar la propuesta completa y esperar aprobación antes de editar archivos.

## Cómo aplicar una mejora aprobada

Cuando el usuario apruebe:

1. Editar solo el archivo de regla, workflow o skill aprobado.
2. Mantener el cambio pequeño.
3. No tocar otras reglas no relacionadas.
4. No incluir secretos ni datos sensibles.
5. Ejecutar `git diff --check`.
6. Resumir el cambio.

## Formato de cierre al actualizar reglas

Responder con:

- Archivos modificados.
- Qué regla/workflow/skill se creó o actualizó.
- Trigger de uso.
- Riesgos o límites.
- Validación ejecutada.