-- Un tipo de gasto que NO se repite: el reloj nuevo, el monitor, la compra de una sola vez.
--
-- El gasto típico de la proyección es la mediana de los últimos seis meses, y una mediana ya
-- resiste un mes raro. Pero si "compras que ya no voy a hacer" se repiten en varios meses (un
-- reloj, un monitor y una pulsera en meses seguidos), la mediana los toma como costumbre y la
-- proyección sale más baja de lo que de verdad pasará.
--
-- En vez de una lista de movimientos sueltos para ignorar, se marca el TIPO: "Compras únicas"
-- (o como lo llame cada quien). Todo lo que tenga ese tipo —propio o heredado de su categoría—
-- sigue contando como gasto en el historial y en los presupuestos, y solo se aparta de la
-- medición del gasto típico.

alter table public.spend_types
  add column if not exists excluded_from_typical boolean not null default false;
