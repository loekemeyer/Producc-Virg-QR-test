-- =====================================================================
--  stock_estancado.sql — Alerta Telegram "STOCK ESTANCADO" 👀
--
--  CONCEPTO (v6.66 — definición del dueño): no interesa "cuánto hay a guardar
--  hace X días" (una recepción entera sin tocar es trabajo pendiente normal, no
--  un error), sino los POTENCIALES ERRORES reales — mercadería que quedó trabada
--  porque alguien EMPEZÓ a guardar y NO TERMINÓ:
--
--   1) RESTO SIN GUARDAR (deposito a_guardar):
--      De lo que LLEGÓ, guardaron una PARTE (a góndola y/o excedente) pero NO la
--      TOTALIDAD → el resto quedó estancado. Ej: llegan 14 cajas, guardan 10 →
--      esas 4 que quedaron "a guardar" SON el estancado.
--
--      ⚠ Se mide por CICLO ABIERTO, no por el histórico del código. El ciclo
--      abierto arranca justo después del último movimiento que dejó el saldo de
--      `a_guardar` en 0 (o sea: la última vez que se guardó TODO lo que había).
--      Es estancado si, DENTRO de ese ciclo, hubo un `guardado` y todavía queda
--      resto. Si en el ciclo abierto NUNCA se guardó nada (llegó una recepción
--      nueva y nadie la tocó todavía), NO se avisa: es pendiente normal.
--
--      Ejemplo real (cod 824): llegan 10 → guardan 10 (saldo 0) · llegan 22 →
--      guardan 22 (saldo 0) · llegan 14 y nadie las tocó → saldo 14 pero NO es
--      estancado (arranca ciclo nuevo, sin guardado). Antes SÍ avisaba, porque
--      miraba "hubo guardado alguna vez" sobre todo el histórico → falso positivo.
--
--      Cantidad reportada = el RESTO que quedó al terminar el último `guardado`
--      del ciclo (no el saldo total): si después de dejar el resto llegó una
--      recepción nueva, esas cajas nuevas son pendiente normal, no estancado.
--      La antigüedad se cuenta desde ESE `guardado` (cuándo se dejó el resto).
--
--   2) PICKEADO SIN AVANZAR (deposito separar_pedidos + a_facturar):
--      Mercadería ya pickeada que quedó en un estado intermedio sin que nadie la
--      trabaje: pickeada sin separar/armar, o armada sin facturar. No puede quedar
--      así más de `dias_estancado` días hábiles.
--
--  DÍAS HÁBILES: los operarios NO trabajan sábado ni domingo, así que la
--  antigüedad se mide en días hábiles (lun–vie), no en días corridos. Algo que
--  quedó el viernes recién dispara el martes (vie + lun = 2 días hábiles), no el
--  lunes. Umbral configurable en `Stock_Config.dias_estancado` (default 2).
--
--  ⚠ SALDO EVENT-SOURCED, SIN FILTRAR LEGAJO: el saldo de stock se calcula sobre
--  TODOS los movimientos (igual que stockComputeSaldos en la app), NO se excluyen
--  legajos 0/1. Antes se filtraban (para saltear datos de prueba), pero algunos
--  movimientos REALES registran legajo 0 —típicamente `cp` (completar pedido)—, y
--  excluirlos rompía el saldo: marcaba estancado lo que la app muestra en 0. Caso
--  cod 534: llegan 6, `cp -1` (legajo 0) saca 1 → a_facturar, guardan 5 → A guardar
--  queda 0; con el filtro parecía "6 − 5 = 1 sin guardar" (falso). Sin filtro coincide
--  con la app. (Idem 323E.) Los movimientos de sistema usan legajos especiales —
--  'pipeline', 'reconcilia', '0'— que NO son basura de test para el stock.
--
--  Solo TELEGRAM. Respeta el cutoff. Lista los 15 más viejos
--  + "… y N más". Dedup diario por el set (depósito|cod).
--
--  Encadenada al cron de agentes (jobid 14, 3×/día):
--    ... select public.reporte_agentes_stock_estancado();
--  SECURITY DEFINER + grant solo service_role (patrón de las demás alertas).
-- =====================================================================

create or replace function public.reporte_agentes_stock_estancado()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  hoy     text := to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'YYYY-MM-DD');
  dias    int;
  n       int;
  detalle text;
  ids     text;
  extra   int;
begin
  select coalesce((select nullif(trim(valor), '')::int from public."Stock_Config" where clave = 'dias_estancado' limit 1), 2) into dias;
  if dias is null or dias < 1 then dias := 2; end if;

  with cfg as (select valor::timestamptz as cutoff from public."Stock_Config" where clave = 'cutoff_ts' limit 1),
  mv as (
    select upper(regexp_replace(trim(m.cod_art), '^0+(.)', '\1')) as cod,
           m.deposito, m.tipo, m.delta, m.ts, m.id
    from public."Movimientos_Stock" m left join cfg on true
    where m.deposito in ('a_guardar', 'separar_pedidos', 'a_facturar')
      and (cfg.cutoff is null or m.tipo = 'inicial' or m.ts >= cfg.cutoff)
  ),
  -- (1) resto sin guardar — saldo corrido de a_guardar por código, en orden
  run as (
    select cod, tipo, ts, id,
           sum(delta) over (partition by cod order by ts, id rows between unbounded preceding and current row) as saldo_run
    from mv
    where deposito = 'a_guardar'
  ),
  -- fin del último ciclo CERRADO = última vez que se guardó todo (saldo volvió a 0)
  cero as (select cod, max(ts) as cero_ts from run where saldo_run <= 0.5 group by cod),
  -- último `guardado` DENTRO del ciclo abierto + el resto que dejó sin guardar
  ultg as (
    select distinct on (r.cod) r.cod, r.ts as g_ts, r.saldo_run as resto
    from run r left join cero c on c.cod = r.cod
    where r.tipo = 'guardado' and (c.cero_ts is null or r.ts > c.cero_ts)
    order by r.cod, r.ts desc, r.id desc
  ),
  fin as (select cod, sum(delta) as saldo from mv where deposito = 'a_guardar' group by cod),
  ag as (
    select u.cod, u.resto as saldo, u.g_ts as ult
    from ultg u join fin f on f.cod = u.cod
    where u.resto > 0.5 and f.saldo > 0.5
  ),
  -- (2) pickeado sin avanzar: separar_pedidos / a_facturar con saldo > 0
  pick as (
    select deposito, cod, sum(delta) as saldo, max(ts) as ult
    from mv
    where deposito in ('separar_pedidos', 'a_facturar')
    group by deposito, cod
    having sum(delta) > 0.5
  ),
  todo as (
    select 'a_guardar'::text as deposito, cod, saldo, ult,
           'resto sin guardar (guardaron una parte de lo que llegó)'::text as est from ag
    union all
    select deposito, cod, saldo, ult,
           case deposito when 'a_facturar' then 'pickeado sin facturar'
                         else 'pickeado sin separar/armar' end
    from pick
  ),
  etiq as (
    select deposito, cod, round(saldo) as cajas,
           -- antigüedad en días HÁBILES (lun–vie), sin contar sáb/dom
           (select count(*) from generate_series(
              (ult at time zone 'America/Argentina/Buenos_Aires')::date + 1,
              (now() at time zone 'America/Argentina/Buenos_Aires')::date,
              interval '1 day') d
            where extract(isodow from d) < 6)::int as dh,
           est
    from todo
  ),
  fil as (
    select deposito, cod, cajas, dh, est,
           row_number() over (order by dh desc, cod) as rn
    from etiq
    where dh >= dias
  )
  select count(*),
         string_agg('cod ' || cod || ' — ' || cajas || ' cj · ' || est || ' (hace ' || dh || ' d. háb.)', E'\n• ' order by rn) filter (where rn <= 15),
         string_agg(deposito || '|' || cod, ',' order by deposito, cod),
         greatest(count(*) - 15, 0)
    into n, detalle, ids, extra
    from fil;

  if coalesce(n, 0) = 0 then return; end if;

  perform public.tg_enqueue(
    '👀 STOCK ESTANCADO — ' || n || ' cosa(s) sin moverse +' || dias || ' día(s) hábil(es):' || E'\n• ' || coalesce(detalle, '-')
      || case when extra > 0 then E'\n… y ' || extra || ' más.' else '' end
      || E'\n\n👉 O guardan el resto que quedó, o cierran lo pickeado. Si ya lo hicieron, márquenlo en la app.',
    'stock_estancado_' || hoy || '_' || md5(coalesce(ids, '')));
exception when others then null;
end
$function$;

revoke execute on function public.reporte_agentes_stock_estancado() from public, anon, authenticated;
grant execute on function public.reporte_agentes_stock_estancado() to service_role;

-- Encadenar al cron de agentes (jobid 14):
--   select cron.alter_job(14, command => '<... el resto ...> select public.reporte_agentes_stock_estancado();');

-- Tunear el umbral en días HÁBILES (opcional, default 2):
--   insert into "Stock_Config"(clave,valor) values ('dias_estancado','2')
--     on conflict (clave) do update set valor=excluded.valor;
