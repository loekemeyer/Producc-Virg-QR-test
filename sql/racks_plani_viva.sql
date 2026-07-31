-- =====================================================================
--  racks_plani_viva.sql — RPC para la PLANIMETRÍA VIVA de racks
--
--  El módulo operario "Bajar de racks" muestra las UBICACIONES del código
--  (chips desde Racks_Planimetria) y al confirmar descuenta de la celda
--  elegida llamando esta RPC (best-effort: si no existe, el cliente falla
--  silencioso y solo queda el ledger). Sin esto, la planimetría cargada el
--  30/06 se desactualiza con la primera bajada y deja de servir para
--  encontrar mercadería.
--
--  Historial:
--   · v5.22 — versión base (solo descuenta la celda, con clamps).
--   · migración racks_plani_descontar_alerta_rack_vacio — avisos Telegram
--     "📦 RACK LIBRE" (la celda quedó en 0) y "🚨 SIN STOCK EN RACKS" (el
--     código quedó en 0 en TODAS sus posiciones), con dedup por minuto.
--   · migración racks_plani_descontar_libera_celda_en_cero (v5.53) — REGLA
--     DEL DUEÑO: "si quedó en cero, anulá ese art para esa ubicación y pasa
--     a libre". Cuando la posición llega a 0, además del aviso, la celda se
--     LIBERA (estado='libre', cod_art=null, master=0, inner=0) → cuenta como
--     posición vacía disponible para otro palet. (One-time: se liberaron
--     también las que ya estaban en 0/0 al aplicar.)
--
--  Patrón de seguridad: RPC acotada SECURITY DEFINER + grant anon (como
--  cp_completar_faltante) — solo toca esta tabla, con clamps.
-- =====================================================================

create or replace function public.racks_plani_descontar(p_sector text, p_cod text, p_inner numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pos_new numeric;
  v_rows    int;
  v_codn    text := upper(replace(trim(coalesce(p_cod, '')), ' ', ''));
  v_total   numeric;
  v_nombre  text;
  v_otras   text;
  v_bucket  text := to_char(now() at time zone 'America/Argentina/Buenos_Aires', 'YYYYMMDD_HH24MI');
begin
  if p_inner is null or p_inner <= 0 or p_inner > 100000 then
    return;   -- basura / abuso: no tocar nada
  end if;

  update "Racks_Planimetria"
     set master_cajas = case
           when coalesce(innercajas, 0) > 0
             then round(coalesce(master_cajas, 0) * greatest(0, innercajas - p_inner) / innercajas)
           else master_cajas
         end,
         innercajas = greatest(0, coalesce(innercajas, 0) - p_inner)
   where sector = p_sector
     and upper(replace(trim(cod_art), ' ', '')) = v_codn
     and estado = 'ocupado'
   returning innercajas into v_pos_new;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return;   -- no existía esa posición ocupada; nada que avisar
  end if;

  -- nombre del artículo para el mensaje (best-effort)
  begin
    select descripcion into v_nombre
      from public.vista_nombres_articulos
     where upper(replace(trim(cod), ' ', '')) = v_codn
     limit 1;
  exception when others then
    v_nombre := null;
  end;

  -- (1) La POSICIÓN del rack quedó vacía → se LIBERA (anula el art, pasa a 'libre')
  if coalesce(v_pos_new, 0) <= 0 then
    -- ¿en qué OTRAS posiciones sigue estando este artículo? (con stock, distinta a la vaciada)
    select string_agg(sector || ' (' || coalesce(innercajas, 0) || ' cj)', ', ' order by sector)
      into v_otras
      from "Racks_Planimetria"
     where upper(replace(trim(cod_art), ' ', '')) = v_codn
       and estado = 'ocupado' and coalesce(innercajas, 0) > 0 and sector <> p_sector;
    perform tg_enqueue(
      '📦 RACK LIBRE — La posición ' || coalesce(p_sector, '?') ||
      ' quedó VACÍA: se bajó TODO el ' || coalesce(p_cod, '?') ||
      coalesce(' · ' || v_nombre, '') || ' que había EN ESA POSICIÓN. Quedó LIBRE para otro palet.' ||
      case when v_otras is not null then E'\n✅ El ' || coalesce(p_cod, '?') || ' TODAVÍA tiene stock en rack: ' || v_otras || '.'
           else E'\n⚠ El ' || coalesce(p_cod, '?') || ' ya NO queda en ninguna otra posición de rack.' end,
      'rackpos0|' || coalesce(p_sector, '') || '|' || v_codn || '|' || v_bucket
    );
    -- Regla del dueño: si quedó en 0, se anula ese artículo para esa ubicación y pasa a libre.
    update "Racks_Planimetria"
       set estado = 'libre', cod_art = null, master_cajas = 0, innercajas = 0
     where sector = p_sector
       and upper(replace(trim(cod_art), ' ', '')) = v_codn
       and estado = 'ocupado';
  end if;

  -- (2) El ARTÍCULO se agotó en TODAS sus posiciones de rack
  select coalesce(sum(greatest(0, coalesce(innercajas, 0))), 0)
    into v_total
    from "Racks_Planimetria"
   where upper(replace(trim(cod_art), ' ', '')) = v_codn
     and estado = 'ocupado';

  if coalesce(v_total, 0) <= 0 then
    perform tg_enqueue(
      '🚨 SIN STOCK EN RACKS — ' || coalesce(p_cod, '?') ||
      coalesce(' · ' || v_nombre, '') ||
      ' quedó en 0 en TODAS sus posiciones de rack. No queda nada para bajar de ese código.',
      'rackzero|' || v_codn || '|' || v_bucket
    );
  end if;
end
$function$;

revoke execute on function public.racks_plani_descontar(text, text, numeric) from public;
grant execute on function public.racks_plani_descontar(text, text, numeric) to anon, authenticated, service_role;

-- One-time (aplicado con la migración v5.53): liberar las posiciones que YA
-- estaban en 0/0 al momento de aplicar la regla.
-- update "Racks_Planimetria"
--    set estado='libre', cod_art=null, master_cajas=0, innercajas=0
--  where estado='ocupado' and cod_art is not null
--    and upper(replace(trim(cod_art),' ','')) not in ('PEDIDOS','CAJAS')
--    and coalesce(innercajas,0)=0 and coalesce(master_cajas,0)=0;

-- Verificación:
-- select racks_plani_descontar('ZZTEST', 'NADA', 1);  -- no debe fallar ni tocar filas
-- select sector, cod_art, master_cajas, innercajas, estado from "Racks_Planimetria" where cod_art = '437E';
