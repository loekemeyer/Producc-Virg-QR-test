# Integración Facturación app → ISIS (contabilidad)

Snapshot: **2026-07-30**. Estado: **facturación electrónica real ya operativa** en la
app (PV 11, prod). Falta el circuito para que esas facturas entren al ISIS para la
contabilidad / libro IVA ventas.

## Objetivo del usuario

- **Facturar desde Producción Virgilio** (la app) porque es más rápido para los
  empleados. A futuro, **auto-facturar** al cerrar/entregar la NP (sin click).
- Que después esas facturas **entren al ISIS** para la contabilidad (libro IVA ventas
  y, si hace falta, cuenta corriente del cliente).

## Contexto / restricciones

- La app emite Factura A por **web service** en **punto de venta 11** ("APP PRODUCCIÓN
  WS"). El ISIS emite en sus propios PV (4 y 5). Son sistemas separados: el ISIS **no
  ve** lo que emite la app.
- El módulo del ISIS "Procesar Facturas Electrónicas por método Web Service" **solo
  EMITE** (pide CAE de lo cargado en el ISIS). Si se usa para una factura de la app,
  la **duplica** (pide un CAE nuevo). ❌ No usar para esto.
- AFIP "Mis Comprobantes" sí muestra TODAS juntas (ISIS PV 4/5 + app PV 11), pero con
  demora de horas. Es la fuente consolidada para el contador.

## Cómo entra al ISIS (confirmado por el proveedor de Sistemas ISIS)

Sí se puede registrar en el ISIS una factura de venta ya emitida por otro sistema,
como **"Comprobante Manual"** (no electrónico, no fiscal → no pide CAE nuevo):

1. **Configurar un tipo de comprobante manual** (ej. "Factura Manual"), no electrónico
   ni fiscal.
2. Cargar por: **Ventas > Remito/Factura > Ingresar Comprobante Manual**.
3. Completar datos de la factura (cliente, artículos, importes).
4. En la confirmación, poner el **número real completo** (PV + 8 dígitos, ej.
   `0011-00000001`) en el campo **"Nro. Preimpreso"**.

Esto la registra para la contabilidad / libro IVA ventas **sin obtener un CAE nuevo**.

⚠ **No hay import masivo por archivo** para este fin — es **carga manual, uno por uno**.

## Plan del lado de la app

Como no hay import por archivo, la app no puede escribir sola en el ISIS (on-premise).
Lo que SÍ hace la app: **darle al operario un reporte con exactamente lo que tiene que
tipear**, para que la carga manual sea rápida y sin errores.

- **Feature a construir:** reporte / export **"Comprobantes para cargar en ISIS"**, que
  liste cada factura emitida (de `Comprobantes_ARCA`, entorno='prod') con:
  - **Nro. Preimpreso** = `PV(4) + "-" + nro(8)` → `0011-00000001`
  - Fecha, Cliente (razón social + CUIT), Neto / IVA 21% / Total
  - Artículos (cód + cajas + importe) — **solo si el ISIS los exige** (ver pregunta
    abierta)
  - Marca de "ya cargado en ISIS" (para no cargar dos veces) — a definir.

### Pregunta abierta (define el alcance del reporte)

- Al cargar un Comprobante Manual, ¿el ISIS **exige artículos** o alcanza con los
  **totales** (neto/IVA/total) para el libro IVA?
  - Solo totales → reporte simple.
  - Exige artículos → hay que persistir el `detalle` en `Comprobantes_ARCA` (hoy NO se
    guarda el detalle ítem por ítem; el `emitir_np` lo calcula pero solo loguea los
    importes) y mapear códigos app ↔ catálogo ISIS.

### Pasos siguientes (futuro)

- **Auto-facturar sin click:** emitir automáticamente al cerrar/entregar la NP. Se hace
  después de tener el circuito ISIS definido.

## Decisión del usuario (2026-07-30)

Quiere **migrar a este modelo**: facturar desde la app (rápido, a futuro automático
sin click) **manteniendo en el ISIS el stock y el registro completo de ventas** como
hoy. Requisito firme: **cero carga manual** (si el ahorro de facturar automático se
pierde tipeando en el ISIS, no sirve). El stock lo quieren en **los dos** sistemas.

→ Esto **descarta el "Comprobante Manual"** (es carga manual) y exige un **método
automático de entrada al ISIS**. La pelota queda del lado del proveedor: que digan cuál
es el camino soportado.

### Preguntas enviadas al proveedor (Sistemas ISIS)

1. ¿Import desde archivo (CSV/TXT/Excel/formato AFIP) de comprobantes de venta ya
   emitidos (PV, número, CAE), sin re-emitir? ¿Estructura?
2. ¿Import desde archivo de movimientos/salidas de stock? ¿Formato?
3. ¿API / Web Service propio del ISIS para crear comprobantes y movimientos de stock
   desde un sistema externo?
4. ¿Soportan escribir directo en la base de datos del ISIS? ¿Motor?
5. ¿Pueden DESARROLLAR la integración a medida (importador automático)? ¿Alcance,
   costo, plazo?
6. ¿Tienen versión CLOUD? Si se migra, ¿ya trae API/conectores/import automático que
   resuelva esto sin desarrollo aparte?

### Respuesta del proveedor (ronda 1) — 2026-07-30

1. Import por archivo de comprobantes de venta emitidos → **NO** existe. Solo carga
   manual ("Comprobante Manual", Nro. Preimpreso).
2. Import por archivo de movimientos de stock → **NO** hay info de esa funcionalidad.
3. **API → SÍ.** Endpoint **`/api/ISISPedido`** inserta **Pedidos de Venta**. Un
   sistema externo puede crear pedidos; después **deben facturarse dentro del ISIS**
   para afectar contabilidad y stock. No especifican si por esta vía se puede registrar
   un comprobante con **CAE ya emitido**.
4. Escribir directo en la base → sin info.
5. Traer masivo desde AFIP "Mis Comprobantes" → **NO**. Existe "Recuperar Facturas
   (webservice)" pero es para **un** comprobante puntual aprobado por AFIP cuyo CAE no
   quedó registrado, no import masivo.

### Dos modelos posibles (a partir de la API)

- **Modelo A — la app manda el pedido, el ISIS factura.** La app usa `/api/ISISPedido`
  para insertar el pedido; el ISIS lo factura (emite CAE) y mueve stock + contabilidad
  nativo. El empleado solo toca la app. **Pro:** usa la API que YA existe, sin doble
  laburo, todo en el ISIS. **Contra:** el facturador a AFIP pasa a ser el ISIS (su PV);
  la emisión directa del app (PV 11) queda como **respaldo**. Riesgo a resolver: que NO
  haya doble emisión (si la app además emite, se duplica).
- **Modelo B — la app factura, el ISIS registra.** La app emite (PV 11) y el ISIS
  registra la factura ya emitida (stock + libro IVA) sin CAE nuevo. **Contra:** requiere
  un endpoint que hoy NO existe → habría que pedir desarrollo a medida.

**Lean actual: Modelo A** (usa API existente, evita doble emisión, todo nativo en ISIS).

### Preguntas ronda 2 al proveedor (reformuladas con lo de la API)

Sobre `/api/ISISPedido`: (1) ¿facturar el pedido emite CAE nuevo? (2) ¿se puede
auto-facturar el pedido insertado por API, sin intervención manual? (3) ¿la API despacha
el pedido para afectar stock, o el stock solo se mueve al facturar?
Sobre registrar comprobantes ya emitidos: (4) ¿endpoint (o desarrollo) para registrar un
comprobante con PV/número/CAE existente que afecte stock + libro IVA sin CAE nuevo?
(5) ¿endpoint de movimientos/ajustes de stock? Desarrollo/cloud: (6) ¿lo desarrollan a
medida (alcance/costo/plazo)? (7) ¿la versión cloud trae API más completa que lo cubra?

### Respuesta del proveedor (ronda 2) — VEREDICTO

Sobre `/api/ISISPedido`:
1. Facturar el pedido **emite CAE nuevo** (patrón integración "Balcony", "CAE
   Inmediato"). → doble emisión si la app también emite.
2. La facturación **se puede automatizar** (parám. "Emite Factura de los Pedidos = Sí"
   + proceso "Facturar pedidos"). ✅
3. **El stock se mueve al facturar** (o remitir); el pedido solo compromete stock
   futuro. ✅ (facturar el pedido descuenta stock físico).
4. Registrar comprobante con CAE ya emitido por API → **NO existe** (solo manual).
5. Endpoint de movimientos/ajustes de stock → **no documentado**.
6. Desarrollo a medida → sin datos de política/costo/plazo.
7. **Cloud tiene funciones exclusivas** (ej. integración Mercado Libre: "Administrador
   de Publicaciones", "Consola de Ventas" son de ISIS Cloud). Confirma diferencias.

**VEREDICTO:**
- **Modelo B DESCARTADO** (no hay API para registrar CAE ya emitido; solo manual).
- **Modelo A ELEGIDO y viable con la API existente:** la app **deja de emitir directo
  a AFIP** y **empuja el pedido a `/api/ISISPedido`**; el ISIS **auto-factura** (CAE +
  stock + contabilidad, nativo). Empleado solo usa la app. La emisión directa (PV 11)
  queda de **respaldo**.
- **Tema clave a resolver:** la app es cloud; el ISIS es on-premise → la API debe ser
  **alcanzable desde internet**. Esto empuja a **evaluar migrar a ISIS Cloud** (API
  accesible y mantenida). Recomendación: **Modelo A + evaluar ISIS Cloud**.

### Preguntas ronda 3 (técnicas, para construir)

(1) Doc del endpoint `/api/ISISPedido`: URL, auth, payload. (2) Facturación automática:
¿inmediata o batch?, ¿devuelve CAE/número? (3) Accesibilidad: ¿API desde internet o solo
red local? (4) ISIS Cloud: ¿API accesible + integración de fábrica?, ¿costo/tiempo de
migrar? (5) Mapeo cliente/artículos por código ISIS.

### Respuesta del proveedor (ronda 3) — patrón Balcony (Mercado Libre)

Balcony es el **módulo adicional (pago)** que integra ML: un **sincronizador que corre
constante** baja ventas de ML → tabla temporal en la base del ISIS → ISIS crea un
**Pedido** → se factura con el proceso "Facturar pedidos de Balcony" (emite **CAE
nuevo** contra AFIP; **no** registra comprobantes ya emitidos en otra plataforma). La
facturación puede ser A/B/C pero **siempre como CONTADO con ingreso de valores**.

**Confirma el patrón del Modelo A** (feeder externo → pedidos → ISIS factura). Nuestra
app sería un "Balcony-like feeder" con las ventas propias.

**Dos alertas que surgen:**
- ⚠ **Contado vs Cuenta Corriente:** Balcony factura como CONTADO con ingreso de valores
  (sirve para ML, que es prepago). Los clientes mayoristas de Virgilio son **cuenta
  corriente** → si se registra como contado, carga cobros inexistentes. **Confirmar que
  la facturación por API pueda ser cuenta corriente.**
- 💰 **Costo:** `/api/ISISPedido` ¿viene solo o requiere el módulo **Balcony** (adicional
  pago) o un desarrollo? A confirmar con comercial.

### Estado: la base de conocimiento se agotó → hablar con un humano

Lo técnico ya está claro (Modelo A). Lo que falta requiere **comercial + soporte técnico
de Sistemas ISIS**, no la KB:
1. **Doc real del endpoint `/api/ISISPedido`** (auth + payload). Sin esto no se codea.
2. ¿Requiere el módulo Balcony? ¿Costo?
3. ¿Soporta **cuenta corriente** (no solo contado)?
4. Presupuesto y tiempo de migrar a **ISIS Cloud** (para que la API sea accesible desde
   la app cloud).

### Qué construye la app (Modelo A)

Al facturar una NP, la app arma el **pedido** (cliente, artículos, cantidades, precios —
datos que ya tiene) y lo **POSTea a `/api/ISISPedido`**; el ISIS auto-factura. Necesita:
spec del endpoint (auth + payload) y URL alcanzable. El `arca-wsfe` (PV 11) queda como
respaldo de emisión directa.

### Según la respuesta, del lado de la app

- **Cloud con API / API on-premise (3, 6)** → la app se conecta a esa API y empuja
  facturas + movimientos de stock. Cero manual. (Camino más limpio a futuro.)
- **Import por archivo (1, 2)** → la app exporta en ese formato y una tarea lo deja
  donde el ISIS lo importa. Cero manual.
- **Desarrollo a medida (5)** → la app genera los datos en el formato que definan.
- **Base de datos (4)** → puente en la red local que escribe al ISIS (más frágil).
- **Solo carga manual** → no cumple el requisito; replantear con el proveedor.

## Otros efectos a considerar

Al facturar por afuera del ISIS, ese sistema tampoco actualiza solo la **cuenta
corriente del cliente** ni el **stock** por esas ventas — no solo el libro IVA. Definir
con el contador/proveedor qué necesita el ISIS de esas ventas (mínimo: comprobante para
IVA; ideal: también CC del cliente).
