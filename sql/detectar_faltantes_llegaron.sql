-- =====================================================================
--  detectar_faltantes_llegaron.sql — cron: faltantes que se pueden COMPLETAR
--
--  Detecta NPs con faltante (Entregas_Virgilio.cajas_falto > 0) para las que
--  HAY stock en "a guardar" del mismo código → crea la tarea (Faltantes_Tareas,
--  dispara el pop-up en Virgilio) y avisa por Telegram para que un operario lo
--  complete desde CP. No re-avisa si la NP ya está facturada o ya tiene tarea
--  abierta; dedup diario por (np|códigos).
--
--  DOS CASOS EN EL MENSAJE (pedido del dueño) — según CUÁNDO llegó ese stock
--  respecto del armado del pedido (Entregas_Virgilio.creado):
--   · "FALTANTE QUE LLEGÓ": hubo una RECEPCIÓN del código DESPUÉS de armado el
--     pedido → la mercadería ingresó en el día, después de armar.
--   · "FALTANTE QUE ESTÁ A GUARDAR": el stock YA estaba en a_guardar antes de
--     armar (pendiente de subir a góndola) → por eso no lo tomaron al pickear.
--  Antes decía "LLEGÓ" siempre, aunque el stock estuviera pendiente hace días.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.detectar_faltantes_llegaron()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_rs text;
  n int := 0;
  v_bucket text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYYMMDD');
begin
  for r in
    with ag as (
      select upper(regexp_replace(trim(cod_art), '^0+', '')) codn, sum(delta) saldo
      from "Movimientos_Stock" where deposito = 'a_guardar'
      group by 1 having sum(delta) > 0
    ),
    fmark as (
      select e.np, e.tanda, e.cod_cliente, e.cod_art, e.cajas_falto,
             exists (select 1 from ag
                     where ag.codn = upper(regexp_replace(trim(e.cod_art), '^0+', ''))
                        or rtrim(ag.codn,'E') = rtrim(upper(regexp_replace(trim(e.cod_art), '^0+', '')),'E')) as llego,
             -- ¿ese stock llegó DESPUÉS de armado el pedido? (recepción con ts > creado) → "LLEGÓ"
             exists (select 1 from "Movimientos_Stock" m
                     where m.deposito = 'a_guardar' and m.tipo = 'recepcion' and m.ts > e.creado
                       and (upper(regexp_replace(trim(m.cod_art), '^0+', '')) = upper(regexp_replace(trim(e.cod_art), '^0+', ''))
                            or rtrim(upper(regexp_replace(trim(m.cod_art), '^0+', '')),'E') = rtrim(upper(regexp_replace(trim(e.cod_art), '^0+', '')),'E'))) as arrived_after
      from "Entregas_Virgilio" e where e.cajas_falto > 0
    ),
    falt as (
      select np,
             max(tanda) tanda, max(cod_cliente) cod_cliente,
             -- SOLO lo que se puede completar (hay stock a guardar):
             sum(cajas_falto) filter (where llego)::int cajas_arr,
             jsonb_agg(jsonb_build_object('cod', cod_art, 'falto', cajas_falto) order by cod_art) filter (where llego) arts_arr,
             string_agg(distinct case when llego then cod_art end, ', ') filter (where llego) arrived,
             bool_or(llego) hay,
             -- si ALGÚN código completable llegó después de armar → mensaje "LLEGÓ"
             coalesce(bool_or(case when llego then arrived_after else false end), false) es_llego
      from fmark group by np
    )
    select f.np, f.tanda, f.cod_cliente, f.cajas_arr, f.arts_arr, f.arrived, f.es_llego
    from falt f
    where f.hay
      and not exists (select 1 from "Facturacion_NP" fn where trim(fn.np) = trim(f.np))
      and not exists (select 1 from "Faltantes_Tareas" t where t.np = f.np and t.estado in ('pendiente','asignado'))
  loop
    select razon_social into v_rs from "PPP_Programacion_Diaria" where trim(np) = trim(r.np) limit 1;
    -- La tarea se crea con SOLO los códigos completables (así el pop-up y el CP muestran eso).
    perform faltante_tarea_crear(r.np, coalesce(r.cod_cliente, ''), coalesce(v_rs, ''), coalesce(r.tanda, ''), coalesce(r.arts_arr, '[]'::jsonb), coalesce(r.cajas_arr, 0), '0');
    perform tg_enqueue(
      case when r.es_llego
        then '📦➡️ FALTANTE QUE LLEGÓ — NP ' || r.np || coalesce(' · ' || v_rs, '') ||
             E'\n' || 'Llegó a "a guardar": ' || coalesce(r.arrived, '?') ||
             ' (' || coalesce(r.cajas_arr, 0) || ' caja(s)). Que UN operario lo complete (ya les saltó el pop-up en Virgilio).'
        else '📦➡️ FALTANTE QUE ESTÁ A GUARDAR — NP ' || r.np || coalesce(' · ' || v_rs, '') ||
             E'\n' || 'Está en "a guardar" para completarlo: ' || coalesce(r.arrived, '?') ||
             ' (' || coalesce(r.cajas_arr, 0) || ' caja(s)). Que UN operario lo complete (ya les saltó el pop-up en Virgilio).'
      end,
      'faltllego|' || r.np || '|' || coalesce(r.arrived,'') || '|' || v_bucket
    );
    n := n + 1;
  end loop;
  perform tg_outbox_flush();
  return 'ok creadas=' || n;
exception when others then
  return 'error: ' || sqlerrm;
end $function$;
