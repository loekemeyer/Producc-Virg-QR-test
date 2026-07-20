-- backup pre-fix error_envio 2026-07-03
CREATE OR REPLACE FUNCTION public.generar_reporte_agentes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  delete from public.reporte_agentes;
  -- 1) Stock negativo
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor)
  select 'stock_negativo', 'alta', cod_art,
         'góndola ' || round(terminado) || ' · exc ' || round(excedente)
           || ' · a guardar ' || round(a_guardar) || ' · racks ' || round(racks),
         least(terminado, excedente, a_guardar, racks, separar_pedidos, a_facturar)
  from public.vista_saldos_stock
  where terminado < 0 or excedente < 0 or a_guardar < 0 or racks < 0
     or separar_pedidos < 0 or a_facturar < 0;
  -- 2) Errores de la app
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'error_app', 'alta', coalesce(nullif(trim(mensaje), ''), '(sin mensaje)'),
         count(*) || ' vez(ces) · pantalla: ' || coalesce(max(url), '?') || ' · legajo ' || coalesce(max(legajo), '?'),
         count(*), max(ts)
  from public.errores_cliente where ts > now() - interval '7 days'
  group by coalesce(nullif(trim(mensaje), ''), '(sin mensaje)') order by count(*) desc limit 20;
  -- 3) Envíos que FALLARON
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'error_envio', 'alta', 'Envío que falló — ' || coalesce(nullif(trim(opcion), ''), '?'),
         count(*) || ' vez(ces) · motivo ' || coalesce(max(motivo), '?') || ' · legajo ' || coalesce(max(legajo), '?'),
         count(*), max(coalesce(ts, ts_cliente))
  from public."Auditoria_Produccion_Virgilio"
  where coalesce(ts, ts_cliente) > now() - interval '7 days' and coalesce(legajo, '') not in ('0', '1')
  group by coalesce(nullif(trim(opcion), ''), '?') order by count(*) desc limit 20;
  -- 4) Faltantes de picking (rea < esp)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'faltante', 'media',
         'Tanda ' || split_part(texto, '|', 1) || ' · art ' || split_part(texto, '|', 2),
         'puso ' || split_part(texto, '|', 4) || ' de ' || split_part(texto, '|', 3)
           || ' (faltan ' || ((split_part(texto, '|', 3))::numeric - (split_part(texto, '|', 4))::numeric) || ')',
         count(*), max(created_at)
  from public."Registros_Produccion_Virgilio"
  where opcion = 'PKC' and created_at > now() - interval '7 days' and coalesce(legajo, '') not in ('0', '1')
    and split_part(texto, '|', 3) ~ '^[0-9]+(\.[0-9]+)?$' and split_part(texto, '|', 4) ~ '^[0-9]+(\.[0-9]+)?$'
    and (split_part(texto, '|', 4))::numeric < (split_part(texto, '|', 3))::numeric
  group by texto order by max(created_at) desc limit 20;
  -- 5) OCs con entrega baja
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'oc_baja', 'media', codigo,
         'pedidas ' || round(sum(cantidad)) || ' · recibidas ' || round(sum(cantidad_recibida))
           || ' (' || round(100.0 * sum(cantidad_recibida) / nullif(sum(cantidad), 0)) || '%) · ' || coalesce(max(proveedor), '?'),
         round(100.0 * sum(cantidad_recibida) / nullif(sum(cantidad), 0)), null
  from public."Ordenes_Compra"
  where coalesce(estado, '') <> 'recibida' and cantidad > 0
  group by codigo having sum(cantidad) > 0 and sum(cantidad_recibida) < 0.5 * sum(cantidad)
  order by sum(cantidad_recibida) / nullif(sum(cantidad), 0) asc limit 20;
  -- 6) Telegram sin enviar
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'outbox', 'media', 'Telegram sin enviar',
         left(text, 90) || (case when attempts > 0 then ' · ' || attempts || ' intento(s)' else '' end),
         attempts, created_at
  from public.telegram_outbox where sent_at is null and created_at < now() - interval '15 minutes'
  order by created_at limit 20;
  -- 7) Excedente guardado (góndola llena)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'excedente', 'media', m.cod_art,
         'se guardaron ' || round(sum(m.delta)) || ' cajas en EXCEDENTE'
           || coalesce(' · 📍 ' || nullif(string_agg(distinct nullif(trim(m.ubicacion), ''), ', '), ''), '')
           || coalesce(' · ' || max(n.descripcion), ''),
         round(sum(m.delta)), max(m.ts)
  from public."Movimientos_Stock" m
  left join public.vista_nombres_articulos n on n.cod = upper(regexp_replace(coalesce(trim(m.cod_art), ''), '^0+(.)', '\1'))
  where m.deposito = 'excedente' and m.tipo = 'guardado' and m.delta > 0 and m.ts > now() - interval '7 days'
  group by m.cod_art order by sum(m.delta) desc limit 20;
  -- 8) Carga al camión sin control de remitos (CCN sin CRN > 30 h)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  with ccn as (
    select split_part(texto, '|', 1) as np, max(split_part(texto, '|', 2)) as tanda,
           max(created_at) as ts_carga, max(legajo) as legajo
    from public."Registros_Produccion_Virgilio"
    where opcion = 'CCN' and created_at > now() - interval '7 days' and coalesce(legajo, '') not in ('0', '1')
    group by split_part(texto, '|', 1)
  ),
  crn as (select distinct split_part(texto, '|', 1) as np from public."Registros_Produccion_Virgilio"
          where opcion = 'CRN' and created_at > now() - interval '14 days')
  select 'carga_sin_control', 'alta', 'NP ' || ccn.np,
         'tanda ' || coalesce(nullif(ccn.tanda, ''), '?') || ' · cargada al camión hace '
           || round(extract(epoch from (now() - ccn.ts_carga)) / 3600) || ' h y SIN controlar en remitos · legajo '
           || coalesce(ccn.legajo, '?'),
         round(extract(epoch from (now() - ccn.ts_carga)) / 3600), ccn.ts_carga
  from ccn left join crn on crn.np = ccn.np
  where crn.np is null and ccn.ts_carga < now() - interval '30 hours' order by ccn.ts_carga limit 30;
  -- 9) Guardado fuera de lista (MGX)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'mg_fuera_lista', 'media', 'Art ' || split_part(texto, '|', 1),
         'se guardó un código que NO estaba en "Mercadería a guardar" · legajo ' || coalesce(max(legajo), '?'),
         count(*), max(created_at)
  from public."Registros_Produccion_Virgilio"
  where opcion = 'MGX' and created_at > now() - interval '7 days' and coalesce(legajo, '') not in ('0', '1')
  group by texto order by max(created_at) desc limit 20;
  -- 10) Picking sin stock (SSG)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'picking_sin_stock', 'alta', 'Tanda ' || split_part(texto, '|', 1),
         'se sacaron cajas que el sistema NO tenía · legajo ' || coalesce(max(legajo), '?'),
         count(*), max(created_at)
  from public."Registros_Produccion_Virgilio"
  where opcion = 'SSG' and created_at > now() - interval '7 days' and coalesce(legajo, '') not in ('0', '1')
  group by texto order by max(created_at) desc limit 20;
  -- 11) Sin planimetría (PSP picking + RSP recepción)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'sin_planimetria', 'media', coalesce(nullif(split_part(texto, '|', 2), ''), '(sin dato)'),
         case when opcion = 'RSP' then 'recepción' else 'picking' end
           || ' — códigos sin lugar en planimetría · ' || split_part(texto, '|', 1)
           || ' · legajo ' || coalesce(max(legajo), '?'),
         count(*), max(created_at)
  from public."Registros_Produccion_Virgilio"
  where opcion in ('PSP', 'RSP') and created_at > now() - interval '7 days' and coalesce(legajo, '') not in ('0', '1')
  group by opcion, texto order by max(created_at) desc limit 20;
  -- 12) Errores en la PPP (PPE)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  select 'ppp_error', 'media', 'Errores en la PPP',
         'último chequeo: ' || replace(replace(replace(replace(coalesce(texto, ''),
           'sinzona:', 'sin zona '), '|zonadif:', ' · zona dif '),
           '|tandamal:', ' · tandas mezcladas '), '|sacar:', ' · ya entregados '),
         1, created_at
  from public."Registros_Produccion_Virgilio"
  where opcion = 'PPE' and created_at > now() - interval '7 days' order by created_at desc limit 1;
  -- 13) Falta facturación (entrega hoy/mañana)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  with tap as (select distinct upper(btrim(texto)) as tanda from public."Registros_Produccion_Virgilio"
               where opcion = 'TAP' and ts_cliente >= now() - interval '5 days'),
  obj as (select 'hoy' as modo, (now() at time zone 'America/Argentina/Buenos_Aires')::date as d
          union all select 'manana', ((now() at time zone 'America/Argentina/Buenos_Aires')::date + 1)),
  pend as (select o.modo, o.d, upper(btrim(pp.tanda)) as tanda, pp.np
           from public."PPP_Programacion_Diaria" pp
           join tap on tap.tanda = upper(btrim(pp.tanda))
           join obj o on left(btrim(pp.fecha_entrega), 10) = to_char(o.d, 'YYYY-MM-DD')
           where not exists (select 1 from public."Facturacion_NP" f where f.np = pp.np))
  select 'falta_facturacion', case when modo = 'hoy' then 'alta' else 'media' end,
         case when modo = 'hoy' then 'Facturar HOY (' || to_char(d, 'DD/MM') || ')'
              else 'Facturar mañana (' || to_char(d, 'DD/MM') || ')' end,
         count(*) || ' pedido(s) con armado terminado SIN facturar · tandas '
           || string_agg(distinct tanda, ', ' order by tanda), count(*), null
  from pend group by modo, d having count(*) > 0;
  -- ===== Pendientes que se traban (no son "errores", son cosas que quedaron a medias) =====
  -- 14) MG pendiente: mercadería recibida sin guardar a góndola (a_guardar parado > 8 h)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  with cfg as (select valor::timestamptz as cutoff from public."Stock_Config" where clave = 'cutoff_ts' limit 1),
  ag as (
    select m.cod_art, sum(m.delta) as saldo, min(m.ts) filter (where m.delta > 0 and m.tipo <> 'inicial') as entrada
    from public."Movimientos_Stock" m left join cfg on true
    where m.deposito = 'a_guardar' and (cfg.cutoff is null or m.tipo = 'inicial' or m.ts >= cfg.cutoff)
      and coalesce(m.legajo, '') not in ('0', '1')
    group by m.cod_art
  )
  select 'mg_pendiente', 'media', ag.cod_art,
         'hay ' || round(ag.saldo) || ' cajas recibidas SIN guardar a góndola hace '
           || round(extract(epoch from (now() - ag.entrada)) / 3600) || ' h' || coalesce(' · ' || n.descripcion, ''),
         round(ag.saldo), ag.entrada
  from ag left join public.vista_nombres_articulos n on n.cod = upper(regexp_replace(coalesce(trim(ag.cod_art), ''), '^0+(.)', '\1'))
  where ag.saldo > 0 and ag.entrada is not null and ag.entrada < now() - interval '8 hours'
  order by ag.entrada limit 20;
  -- 15) Armado empezado (AP) sin terminar (TAP) > 24 h
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  with ap as (
    select upper(btrim(split_part(texto, '|', 1))) as tanda, max(created_at) as ts, max(legajo) as legajo
    from public."Registros_Produccion_Virgilio"
    where opcion = 'AP' and created_at > now() - interval '7 days'
      and coalesce(legajo, '') not in ('0', '1') and btrim(split_part(texto, '|', 1)) <> ''
    group by upper(btrim(split_part(texto, '|', 1)))
  ),
  tap as (select distinct upper(btrim(split_part(texto, '|', 1))) as tanda
          from public."Registros_Produccion_Virgilio" where opcion = 'TAP' and created_at > now() - interval '7 days')
  select 'armado_sin_terminar', 'media', 'Tanda ' || ap.tanda,
         'armado empezado hace ' || round(extract(epoch from (now() - ap.ts)) / 3600)
           || ' h y SIN terminar (TAP) · legajo ' || coalesce(ap.legajo, '?'),
         round(extract(epoch from (now() - ap.ts)) / 3600), ap.ts
  from ap left join tap on tap.tanda = ap.tanda
  where tap.tanda is null and ap.ts < now() - interval '24 hours' order by ap.ts limit 20;
  -- 16) Pipeline atascado: separar_pedidos / a_facturar sin avanzar > 2 días (future-ready)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  with cfg as (select valor::timestamptz as cutoff from public."Stock_Config" where clave = 'cutoff_ts' limit 1),
  ag as (
    select m.cod_art, m.deposito, sum(m.delta) as saldo, min(m.ts) filter (where m.delta > 0) as entrada
    from public."Movimientos_Stock" m left join cfg on true
    where m.deposito in ('separar_pedidos', 'a_facturar') and (cfg.cutoff is null or m.tipo = 'inicial' or m.ts >= cfg.cutoff)
      and coalesce(m.legajo, '') not in ('0', '1')
    group by m.cod_art, m.deposito
  )
  select 'pipeline_atascado', 'media',
         ag.cod_art || ' (' || (case ag.deposito when 'separar_pedidos' then 'pickeado' else 'a facturar' end) || ')',
         'hay ' || round(ag.saldo) || ' cajas sin avanzar hace ' || round(extract(epoch from (now() - ag.entrada)) / 86400) || ' día(s)',
         round(ag.saldo), ag.entrada
  from ag where ag.saldo > 0 and ag.entrada is not null and ag.entrada < now() - interval '2 days'
  order by ag.entrada limit 20;
  -- 17) Excedente estancado: excedente sin moverse > 5 días (future-ready)
  insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor, ts_evento)
  with cfg as (select valor::timestamptz as cutoff from public."Stock_Config" where clave = 'cutoff_ts' limit 1),
  ag as (
    select m.cod_art, sum(m.delta) as saldo, max(m.ts) as ult_mov
    from public."Movimientos_Stock" m left join cfg on true
    where m.deposito = 'excedente' and (cfg.cutoff is null or m.tipo = 'inicial' or m.ts >= cfg.cutoff)
    group by m.cod_art
  )
  select 'excedente_estancado', 'media', ag.cod_art,
         'hay ' || round(ag.saldo) || ' cajas en EXCEDENTE sin moverse hace '
           || round(extract(epoch from (now() - ag.ult_mov)) / 86400) || ' día(s) — ¿bajar a góndola?',
         round(ag.saldo), ag.ult_mov
  from ag where ag.saldo > 0 and ag.ult_mov < now() - interval '5 days' order by ag.ult_mov limit 20;
end $function$
