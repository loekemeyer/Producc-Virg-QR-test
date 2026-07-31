-- =====================================================================
-- mov_stock_clientid_dedup.sql — idempotencia de Movimientos_Stock (idea 5490).
--
-- El dedup previo (mov_stock_pipeline_dedup) cubría solo picking/separado/facturado
-- por CLAVE NATURAL (ref, cod_art, deposito, tipo). Los movimientos recepcion/ajuste/
-- guardado/entrega_envasar no tienen clave natural: si el POST llegaba al server pero
-- la respuesta se perdía (wifi inestable), el reintento desde vir_stock_pend sumaba
-- cajas de más EN SILENCIO.
--
-- Fix: cada fila lleva un client_id único y ESTABLE (generado en el front, reusado en
-- la cola offline). Este índice único parcial + `Prefer: resolution=ignore-duplicates`
-- (→ ON CONFLICT DO NOTHING) hacen el insert idempotente: reintentar la misma fila
-- (mismo client_id) no la vuelve a insertar. NULL en filas viejas (múltiples NULLs
-- permitidos en un índice único) → sin migración de datos.
-- =====================================================================

alter table public."Movimientos_Stock" add column if not exists client_id text;

create unique index if not exists mov_stock_clientid_dedup
  on public."Movimientos_Stock" (client_id)
  where client_id is not null;
