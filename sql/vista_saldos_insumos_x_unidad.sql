-- =====================================================================
-- vista_saldos_insumos_x_unidad.sql — saldo de INSUMOS separado por unidad (idea 7382).
--
-- Problema: vista_saldos_stock.insumos suma `delta` del depósito 'insumos' MEZCLANDO
-- unidades heterogéneas (kg, Uni, Bolsas, MC, Paquetes, null…) como si fueran cajas →
-- el número no tiene sentido físico. Pedido del usuario: "separar el saldo por unidad
-- (kg / Uni / Bolsas aparte), no sumar todo junto".
--
-- Esta vista ADITIVA (no toca vista_saldos_stock) devuelve UNA fila por (cod_art, unidad)
-- con el saldo de esa unidad. Las variantes de CASE de la misma unidad se unifican
-- (kg == Kg, agrupando por lower(trim(unidad))); null/vacío = '(s/u)'. Respeta el mismo
-- corte (Stock_Config.cutoff_ts, 'inicial' siempre base) que vista_saldos_stock.
-- security_invoker=true → anon la lee con SUS permisos sobre Movimientos_Stock.
--
-- El front (solapa Insumos de Stock) también desglosa por unidad desde los movimientos
-- en memoria; esta vista sirve para auditoría/SQL y futuros consumidores (p. ej. el
-- módulo de conteo de insumos, que hoy sigue mostrando un único número).
-- =====================================================================

create or replace view public.vista_saldos_insumos_x_unidad
with (security_invoker=true) as
 with cfg as (
   select (select "Stock_Config".valor from "Stock_Config" where "Stock_Config".clave = 'cutoff_ts' limit 1) as cutoff
 )
 select m.cod_art,
   (array_agg(m.descripcion order by length(m.descripcion), m.descripcion) filter (where coalesce(trim(both from m.descripcion), '') <> ''))[1] as descripcion,
   coalesce(nullif(max(trim(both from m.unidad)), ''), '(s/u)') as unidad,
   coalesce(sum(m.delta), 0::numeric) as saldo
  from "Movimientos_Stock" m, cfg
 where m.deposito = 'insumos'
   and (cfg.cutoff is null or m.tipo = 'inicial' or m.ts >= cfg.cutoff::timestamptz)
 group by m.cod_art, lower(coalesce(trim(both from m.unidad), ''));

grant select on public.vista_saldos_insumos_x_unidad to anon, authenticated;
