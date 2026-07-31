-- =====================================================================
-- vista_saldos_stock.sql — saldo de stock por artículo y depósito.
--
-- idea 7263 (2026-07): se AGREGARON las columnas `para_envasar` y `racks_ch`.
-- Antes la vista sólo tenía 7 depósitos (terminado/excedente/separar_pedidos/
-- a_facturar/a_guardar/racks/insumos), así que los movimientos a `para_envasar`
-- (depósito del flujo de envasado, evento EA) y `racks_ch` quedaban FUERA de todo
-- saldo del server → "stock fantasma" no auditable. Cambio ADITIVO (columnas al
-- final): no altera las columnas ni la semántica existentes. security_invoker=true
-- se preserva (anon lee la vista con SUS permisos sobre Movimientos_Stock).
--
-- Nota: `para_envasar` sigue estando FUERA de los 7 depósitos que suma
-- stockComputeSaldos (front) para totales/OC — esta columna es sólo para AUDITAR
-- ese saldo, no para meterlo en los totales de compra.
-- =====================================================================

create or replace view public.vista_saldos_stock
with (security_invoker=true) as
 WITH cfg AS (
   SELECT (SELECT "Stock_Config".valor FROM "Stock_Config" WHERE "Stock_Config".clave = 'cutoff_ts' LIMIT 1) AS cutoff
 )
 SELECT m.cod_art,
   (array_agg(m.descripcion ORDER BY length(m.descripcion), m.descripcion) FILTER (WHERE COALESCE(TRIM(BOTH FROM m.descripcion), '') <> ''))[1] AS descripcion,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'terminado'), 0::numeric)       AS terminado,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'excedente'), 0::numeric)        AS excedente,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'separar_pedidos'), 0::numeric)  AS separar_pedidos,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'a_facturar'), 0::numeric)       AS a_facturar,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'a_guardar'), 0::numeric)        AS a_guardar,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'racks'), 0::numeric)            AS racks,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'insumos'), 0::numeric)          AS insumos,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'para_envasar'), 0::numeric)     AS para_envasar,
   COALESCE(sum(m.delta) FILTER (WHERE m.deposito = 'racks_ch'), 0::numeric)         AS racks_ch
  FROM "Movimientos_Stock" m, cfg
 WHERE cfg.cutoff IS NULL OR m.tipo = 'inicial' OR m.ts >= cfg.cutoff::timestamp with time zone
 GROUP BY m.cod_art;
