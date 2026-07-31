# Pendientes — Producción Virgilio (inventario)

Snapshot: **2026-07-30**. Origen: inventario traído de otro chat. Lo construido
hasta acá está completo y pusheado (v6.41→v6.49 + Supabase + guía). Esto es lo que
queda abierto, para que **no se olvide**. No borres entradas: se tildan (`[x]`) o se
tachan (`~~…~~`).

> ⚠ **#7 y #8 se están haciendo en OTRO chat** (el usuario dio el OK allá). No
> tocarlos desde acá para no pisar el trabajo (el #7 es un revoke en Supabase en vivo).

## ⚠ Revisar mañana (operativo) — anotado 2026-07-30

- [ ] **2 pedidos armados + facturados pero SIN despachar (del 29/07).** Las NP **98185**
  y **98186** (**Mundo Bazar S.R.L**, tanda **C98J**) se **armaron** el 29/07 16:51 (~216
  cajas) y se **facturaron/tildaron** el 29/07 17:24, pero **NO se cargaron al camión**
  (no hay evento `CCN`) ni entraron a ningún reparto (`Facturacion_NP.cierre_id` = null).
  Son los 2 que aparecen en "YA TILDADOS HOY" del Cierre de jornada de Facturación.
  **Acción:** verificar físicamente que esas cajas estén en el depósito y despacharlas en el
  próximo reparto (van a estar en el "Generar PDF"); si ya salieron por otro medio, cerrarlas
  / marcar la carga (CCN) para que salgan de la lista de pendientes.

## Grupo A — Requiere al usuario (Google/ARCA, fuera del alcance del agente)

- ~~**1. Deploy del Apps Script `ppp-a-excel.gs`**~~ — **DESCARTADO 2026-07-30** por
  decisión del usuario: se eliminó el script del repo. Queda solo el botón
  "⬇ Exportar Excel" de la app (que ya funciona).
- [ ] **2. Facturación ARCA** — conseguir certificado + PDV nuevo + definir de dónde
  sale el importe + OK del contador. **2026-07-30: la emisión ya está IMPLEMENTADA y
  deployada** (WSAA con firma CMS + cache TA, FECompUltimoAutorizado, FECAESolicitar,
  log en Comprobantes_ARCA), gateada por secrets + `ARCA_EMITIR=on`. Al llegar el
  certificado de homologación: cargar secrets y probar `action=ta` → `ultimo` → `emitir`.

## Grupo B — Decisiones en pausa (no son deuda; esperan tu decisión)

- [ ] **3. Capa 1b / split del 66** — dijiste "no hagamos el paso 4". El 66 sigue
  partido (6 cajas, cosmético); si una tanda vuelve a traer un código mal, el picking
  puede repetirlo.
- [ ] **4. Purga de los ~76 numéricos restantes** de la carga de insumos del 27/7 —
  solo se borraron los 13 confirmados; el CSV lo tenés para decidir.
  Decisiones 2026-07-30: **`0037` y `0087` QUEDAN como están** (el usuario no los
  reconoce; saldo 0, solo insumos, inofensivos — no volver a proponer borrarlos).
  Auditoría de patrones (2 díg / 0XX / 00XX) hecha: el único split real del stock
  era `66`↔`066` (tanda C94A, 5 filas, ids 7327/7328/7626/7627/8532) —
  **CONSOLIDADO 2026-07-30** con OK del usuario (UPDATE a `066`, verificado: sin
  variante `66`, góndola de `066` quedó en 212). Con esto el stock no tiene ningún
  código partido por padding.
- [ ] **5. Fase 2 del PPP** (programar desde la app / Supabase motor, sync con upsert)
  — diseño entregado, sin implementar. El Espejo quedó idéntico a PPP esperando esa
  divergencia.
- [ ] **6. Ajuste dinámico de espacio por proyección** — quedó en recomendación
  (Fase 1: cobertura en días); nunca se arrancó.

## Grupo C — Pendientes chicos (accionables)

- [ ] **7. Seguridad (el más importante)** — `anon` puede escribir/borrar en
  `Facturacion_NP`, `Facturacion_Cierres` y `Entregas_Virgilio` (pre-existente).
  Revoke cuidadoso (al menos `TRUNCATE`, que saltea RLS) sin romper lo que el armado
  escribe con `anon`. — ⏳ **EN CURSO en otro chat.**
- [ ] **8. `CLAUDE.md` desactualizado** — dice "los m³ NO están en Supabase", y eso ya
  no es cierto desde v5.33 (verificado). Corrección de 2 minutos. — ⏳ **EN CURSO en
  otro chat.**
- [ ] **9. (Menor) Instructivo de firma de commits** — quedó solo en el chat; guardarlo
  como `docs/firmar-commits.md`.
