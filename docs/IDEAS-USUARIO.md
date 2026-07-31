# Ideas del usuario — Producción Virgilio

Proyección en el repo de las ideas que **escribe el usuario** en cualquier chat.
Cada idea queda acá (durable, versionada) y además en la tabla `agente_propuestas`
(Supabase) para entrar al mismo circuito que las de los agentes: se desarrolla sola
en su rama `idea/<código>`, se recuerda en el Telegram de las 8 **todos los días
hasta que el usuario la active**, y se mergea a `main` cuando el usuario dice el número.

- `[ ]` = pendiente / esperando activación · `[x]` = activada (mergeada a main) ·
  `~~tachada~~` = descartada.
- El código de 4 dígitos es el mismo que en la tabla y en el Telegram.

> Este archivo es un espejo legible. La fuente operativa es la tabla
> `agente_propuestas`. Al registrar o activar una idea del usuario se actualizan
> los dos. No borres entradas: se tildan o se tachan.

## Ideas

- [x] **2091** (2026-07-31) — Mover el botón **Cerrar** del módulo Consulta de NP (composición a líos) **arriba a la derecha** — _hecha (v6.68, en main)_
- [x] **1963** (2026-07-31) — **Prolijar** la estética del pop-up de movimientos por artículo (alinear rótulos, chips en pill, alinear el `+`) — _hecha (v6.68, en main)_
- [x] **1636** (2026-07-31) — **Fix estancado**: el `cp` (completar pedido) con legajo 0 se excluía y rompía el saldo → falso positivo del 534/323E en "a guardar". Ahora el saldo es event-sourced sobre todos los movimientos (sin filtrar legajo), como la app — _hecha (v6.68 + backend Supabase, en main)_
- [x] **1108** (2026-07-31) — Que las columnas de depósito (A facturar / A guardar / etc.) se puedan **abrir aunque digan 0**, si el artículo tuvo movimientos ahí alguna vez — _hecha (v6.67, en main)_
- [x] **3989** (2026-07-31) — Un **`+`** en cada recepción del pop-up que muestre la **entrega completa**: día que llegó, de qué prov/tall, qué códigos entregó y cuántas cajas de cada uno — _hecha (v6.67, en main)_
- [x] **2415** (2026-07-31) — En el pop-up de movimientos por artículo (📦 A guardar) mostrar las **siglas y el legajo de quien recibió** — _hecha (v6.66, en main)_
- [x] **1730** (2026-07-31) — Redefinir **ESTANCADO**: es cuando de lo que llegó se guardó una **parte** (entre góndola y excedente) pero **no la totalidad** (llegan 14, guardan 10, quedan 4 → eso es estancado). Una recepción nueva intacta **no** es estancado (caso cod 824) — _hecha (v6.66 + backend Supabase, en main)_

<!-- Nuevas entradas se agregan ARRIBA de esta línea, formato:
- [ ] **CÓDIGO** (AAAA-MM-DD) — texto de la idea — _estado_
-->
