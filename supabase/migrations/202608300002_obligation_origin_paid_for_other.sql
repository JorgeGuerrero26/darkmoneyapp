-- Un origen más para las obligaciones: "Pagué por alguien" (Revisión 11, fase 13 del plan).
--
-- El formulario preguntaba dos veces lo mismo: primero "¿cómo nació esta deuda?" y después
-- "impacto inicial en cuenta", y dejaba contestar distinto en cada una. Los tres impactos
-- posibles —entra dinero, sale dinero, no se mueve nada— SON los tres orígenes, así que el
-- segundo bloque desaparece y cada origen determina su consecuencia.
--
-- Para eso falta el caso "sale dinero de tu cuenta al crearla" en la lista de deudas: los dos
-- que había son "me prestaron dinero" (entra) y "compré a cuotas" (no se mueve nada).
--
-- `manual` se conserva: hay obligaciones creadas con ese origen y se siguen leyendo. Solo deja
-- de ofrecerse al crear, porque no describía un caso — era un permiso para contestar la otra
-- pregunta ("Tú decides si hay movimiento de cuenta").

alter type public.obligation_origin_type add value if not exists 'paid_for_other';
