-- =====================================================================
-- telegram_alertas.sql — Alertas de Telegram (v4.05)
--
-- DOS alertas nuevas al grupo "Faltantes Virgilio" (chat -1004379879565,
-- mismo bot @Faltantes_Virgilio_bot que faltantes / sin planimetría / carga
-- sin control). Mecanismo: pg_net (net.http_post) + pg_cron.
--
-- ⚠⚠ ARCHIVO HISTÓRICO / DESACTUALIZADO (no correr tal cual). Las funciones VIVAS
--   en Supabase EVOLUCIONARON: hoy mandan vía `tg_enqueue` → `telegram_outbox` →
--   `tg_outbox_flush()` (con dedup y reintentos), no con `net.http_post` directo como
--   acá. Si corrés este archivo, PISÁS las funciones buenas. Está sólo como referencia.
-- ⚠ SEGURIDAD: el bot_token YA NO se hardcodea — se lee de **Supabase Vault**
--   (secreto `telegram_bot_token`). Si rotás el token (BotFather), actualizá SOLO el Vault:
--   select vault.update_secret((select id from vault.secrets where name='telegram_bot_token'), '<NUEVO>');
--   El `chat_id` no es secreto.
--
-- (1) FALTA DE FACTURACIÓN — server-side (pg_cron). Pedidos con armado
--     terminado (TAP) y entrega mañana/hoy que NO están en Facturacion_NP.
-- (2) ERROR EN PPP — client-emit. El monitor PPP emite un evento PPE
--     (opcion='PPE') y este trigger lo reenvía. Sólo si hay errores (>0).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) FALTA DE FACTURACIÓN
-- ---------------------------------------------------------------------
create or replace function public.notificar_falta_facturacion_telegram(modo text)
returns void language plpgsql security definer as $fn$
declare
  bot_token text := (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_bot_token');
  chat_id   text := '-1004379879565';
  hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  objetivo date := case when modo = 'hoy' then hoy else hoy + 1 end;
  total int; tandas text; nps int; msg text; titulo text;
begin
  with tap as (
    select distinct upper(btrim(texto)) as tanda
    from "Registros_Produccion_Virgilio"
    where opcion = 'TAP' and ts_cliente >= now() - interval '5 days'
  ),
  pend as (
    select upper(btrim(pp.tanda)) as tanda, pp.np
    from "PPP_Programacion_Diaria" pp
    join tap on tap.tanda = upper(btrim(pp.tanda))
    where left(btrim(pp.fecha_entrega), 10) = to_char(objetivo, 'YYYY-MM-DD')
      and not exists (select 1 from "Facturacion_NP" f where f.np = pp.np)
  )
  select count(*), count(distinct tanda), string_agg(distinct tanda, ', ' order by tanda)
  into nps, total, tandas from pend;
  if coalesce(nps, 0) = 0 then return; end if;   -- nada pendiente → no avisar
  titulo := case when modo = 'hoy'
    then '🧾🚨 FACTURACIÓN URGENTE — sin facturar y la ENTREGA es HOY (' || to_char(objetivo, 'DD/MM') || ')'
    else '🧾 FACTURACIÓN — faltan facturar para la entrega de MAÑANA (' || to_char(objetivo, 'DD/MM') || ')' end;
  msg := titulo || E'\n\n' || nps || ' pedido(s) con armado terminado y SIN facturar (' || total || ' tanda/s).'
       || E'\nTandas: ' || coalesce(tandas, '-');
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('chat_id', chat_id, 'text', msg));
end $fn$;

-- Cron: 18:00 AR (21:00 UTC) lo de mañana · 08:00 AR (11:00 UTC) lo de hoy (urgente).
select cron.unschedule(jobid) from cron.job where jobname in ('falta-fact-manana','falta-fact-hoy');
select cron.schedule('falta-fact-manana','0 21 * * *', $$select public.notificar_falta_facturacion_telegram('manana')$$);
select cron.schedule('falta-fact-hoy',   '0 11 * * *', $$select public.notificar_falta_facturacion_telegram('hoy')$$);

-- ---------------------------------------------------------------------
-- (2) ERROR EN PPP (client-emit: evento PPE desde el monitor)
--     texto = 'sinzona:N|zonadif:N|tandamal:N|sacar:N'
-- ---------------------------------------------------------------------
create or replace function public.notificar_ppp_error_telegram()
returns trigger language plpgsql security definer as $fn$
declare
  bot_token text := (select decrypted_secret from vault.decrypted_secrets where name = 'telegram_bot_token');
  chat_id   text := '-1004379879565';
  kv text; arr text[];
  sz int := 0; zd int := 0; tm int := 0; sc int := 0;
  msg text;
begin
  if new.opcion <> 'PPE' then return new; end if;
  foreach kv in array string_to_array(coalesce(new.texto,''), '|') loop
    arr := string_to_array(kv, ':');
    if coalesce(array_length(arr,1),0) = 2 then
      if    arr[1] = 'sinzona'  then sz := coalesce(nullif(arr[2],'')::int,0);
      elsif arr[1] = 'zonadif'  then zd := coalesce(nullif(arr[2],'')::int,0);
      elsif arr[1] = 'tandamal' then tm := coalesce(nullif(arr[2],'')::int,0);
      elsif arr[1] = 'sacar'    then sc := coalesce(nullif(arr[2],'')::int,0);
      end if;
    end if;
  end loop;
  if (sz + zd + tm + sc) = 0 then return new; end if;   -- nada para corregir → no avisar
  msg := '🗂️ PROGRAMACIÓN (PPP) — hay errores para corregir';
  if sz > 0 then msg := msg || E'\n• ' || sz || ' pedido(s) SIN ZONA asignada'; end if;
  if zd > 0 then msg := msg || E'\n• ' || zd || ' pedido(s) con ZONA distinta a la del barrio'; end if;
  if tm > 0 then msg := msg || E'\n• ' || tm || ' tanda(s) MEZCLADAS (más de una fecha o ruta)'; end if;
  if sc > 0 then msg := msg || E'\n• ' || sc || ' pedido(s) YA ENTREGADOS que siguen en Programación (sacar)'; end if;
  msg := msg || E'\n\n👉 Revisá la PPP y corregí.';
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || bot_token || '/sendMessage',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := jsonb_build_object('chat_id', chat_id, 'text', msg));
  return new;
end $fn$;

drop trigger if exists trg_ppp_error_telegram on "Registros_Produccion_Virgilio";
create trigger trg_ppp_error_telegram
  after insert on "Registros_Produccion_Virgilio"
  for each row execute function public.notificar_ppp_error_telegram();
