# Fixtures de correos

Correos reales ANONIMIZADOS. Se conserva **intacta** la estructura que el parser lee
—tabulaciones, orden de los campos, redacción de los verbos, formato del monto, avisos legales
del pie— y se reemplazan nombres, celulares, números de tarjeta, números de operación y correos
por valores ficticios.

NUNCA subir un correo sin anonimizar: traen datos financieros reales.

Cada fixture de acá salió de un correo que rompió una suposición del parser. Si agregas un
banco, **captura primero el correo real**: los dos remitentes que parecían obvios
(`@bcp.com.pe`, `@yape.com.pe`) resultaron equivocados y descartaban el 100% del tráfico.
