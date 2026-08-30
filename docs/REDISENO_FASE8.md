# Plan de rediseño — DarkMoney (Revisión 08)

> Octava tanda: **Nueva cuenta**, segunda pasada. Las anteriores están cerradas en
> [`REDISENO.md`](REDISENO.md) (sistema visual), [`REDISENO_FASE2.md`](REDISENO_FASE2.md)
> (dashboard), [`REDISENO_FASE3.md`](REDISENO_FASE3.md) (módulos de lista),
> [`REDISENO_FASE4.md`](REDISENO_FASE4.md) (pantallas de sistema),
> [`REDISENO_FASE5.md`](REDISENO_FASE5.md) (formularios y Salud) y
> [`REDISENO_FASE7.md`](REDISENO_FASE7.md) (registrar movimiento).

Fuente: `DarkMoney - Rediseño.dc.html`, Revisión 08 (29 ago 2026), mockup `U · NUEVA CUENTA`.

Archivo: `components/forms/AccountForm.tsx`.

---

## 0. Lo que ya estaba hecho

La cuadrícula de 28 íconos y 12 colores ya no estaba —quedó como fila "Apariencia"—, el saldo
ya llevaba símbolo, la moneda ya era fila-selector y el nombre ya era el primer campo. La
Revisión 08 es **lo que quedó pendiente de esa misma plantilla**, no material nuevo.

---

## 1. Los ocho puntos

### [x] A · Menta otra vez para cosas que no son plata
Tres usos de menta y ninguno es dinero: "Banco" seleccionado, "Ninguna" seleccionado y el
interruptor de patrimonio. **Estar elegido y estar activado no son ingresos.** Los tres van en
hueso. Los dos primeros desaparecen con el punto B; el interruptor pasa a pista hueso con el
pulgar oscuro.

### [x] B · Las cápsulas siguen cortándose, en dos filas
TIPO terminaba en "Pr…" e INSTITUCIÓN en un círculo sin nombre. Son las dos filas que la regla
2 manda convertir: **pasadas seis opciones, selector que abre lista**. Pasan a filas con el
valor a la derecha, junto a Moneda y Apariencia, que ya estaban así.

### [x] C · Institución tenía dos controles para un dato
Un campo "Buscar institución…" **y** debajo una fila de cápsulas con las mismas instituciones.
La búsqueda vive dentro de la hoja que elige, no al costado: `SearchableSelectSheet` la enseña
sola pasadas diez opciones, y hay veintidós.

### [x] D · La vista previa repetía el título
"Nueva cuenta · Banco · PEN" a cien píxeles del título "Nueva cuenta", con los dos datos que
estás por elegir. Se retira; la fila Apariencia ya muestra el ícono elegido.

**Al editar sí quedan** los dos datos que el formulario no enseña —saldo de hoy y última
actividad—, en las dos líneas de información de arriba. No estaban en el mockup porque el
mockup es de una cuenta nueva.

### [x] E · El botón estaba activo sin nombre
Mientras falte el nombre, el botón está **apagado y dice qué falta**: "Falta el nombre". Eso
reemplaza al asterisco de "NOMBRE *", que no se explica en ninguna parte de la app.

`FormSheetScaffold` ya tenía `missingLabel`; el formulario no lo usaba porque su botón vivía
al final del scroll. Al adoptar la plantilla gana también la barra fija.

### [x] F · Cuatro maneras de etiquetar un campo
"NOMBRE *" y "TIPO" en mayúscula espaciada; "Saldo inicial" en minúscula dentro de la tarjeta;
"Moneda" y "Apariencia" como fila; "Incluir en patrimonio neto" con subtítulo. **Quedan dos:**
mayúscula espaciada para lo que se escribe (Nombre, Saldo inicial) y fila con valor para lo que
se elige.

### [x] G · "S/ 0" y "PEN" en la misma pantalla
El monto va `S/ 0.00` —el saldo inicial nace con dos decimales— y la fila dice **"Soles"**: el
código ISO es para el backend, no para quien abre una cuenta.

### [x] H · "Afecta el balance total del dashboard"
Tres palabras que el usuario no usa. Queda **"Suma al total del inicio"**, bajo "Contar en el
patrimonio". Y el contorno del ícono de Apariencia deja el violeta —un color que en el sistema
significa IA— por el gris de las demás filas.

---

## 2. Piezas

- `FormOptionRow` gana `trailing`: ocupa el sitio del valor con algo que se enseña en vez de
  decirse. La apariencia elegida es su propio ícono, no la palabra "Cambiar".
- `FormSheetScaffold` mueve `missingLabel` **debajo** del botón, como lo dibuja el mockup.
  Afecta también a Nueva categoría, que ya usaba la plantilla.
- `constants/currencies.ts` gana `currencyPluralTitle`: "Soles", "Dólares".
- `features/accounts/lib/account-types.ts` recibe `ACCOUNT_TYPES` y `TYPE_PRESETS`, que vivían
  dentro del componente retirado.

### Componentes retirados
`AccountTypePicker` e `InstitutionPicker`: sus dos scrollers de cápsulas son ahora filas, y
eran sus únicos consumidores.

---

## 3. Lo que NO cambió, y por qué

- **El ícono de Apariencia conserva el color elegido.** La crítica nombra el contorno violeta,
  y ese sí pasa a gris. Pintar también el ícono en gris dejaría la fila sin decir qué color
  tiene la cuenta, que es la mitad de lo que se elige ahí.
- **Los interruptores del resto de la app siguen en menta.** El mismo `trackColor` está en
  doce sitios más (Configuración, Presupuestos, Suscripciones, Detección). La revisión mira
  esta pantalla; el barrido se hace cuando se pida, de una vez y con su propia validación.
