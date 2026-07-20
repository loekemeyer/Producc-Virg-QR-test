-- =====================================================================
--  rendimiento_anomalo.sql — alerta de rendimientos anómalos (v4.76)
--
--  Detecta operarios con m³/h MUY bajo o MUY alto y los avisa por DOS vías:
--    • Tablero Agentes  → inserta en reporte_agentes (categoria 'rendimiento_anomalo')
--    • Telegram         → tg_enqueue, 1 vez por semana por operario (dedup)
--
--  Se calcula sobre vista_productividad_semanal (m³/h por rol = el del rol que más
--  hace, suma/suma de las últimas 4 semanas). "Anómalo" =
--    • RELATIVO: fuera de 0.45× .. 2.2× la MEDIANA del rol — solo si el rol tiene
--      ≥3 operarios (mediana confiable) y el operario tiene ≥8 tandas con m³.
--    • ABSOLUTO: imposibles, casi siempre dato roto — armado <0.12 o >2.0;
--      picking <0.18 o >3.5 m³/h (no necesitan mediana).
--  Hoy (datos limpios) NO marca a nadie: los operarios están en una banda muy pareja
--  (armado ~0.41–0.44, picking ~1.0–1.24). Salta cuando algo se va de rango o se
--  rompe el dato (como los m³/h inflados que arreglamos en v4.68).
--
--  Enganche: el helper se llama desde el cron 14 (generar-reporte-agentes, cada 2 h),
--  DESPUÉS de generar_reporte_agentes (que hace delete+rebuild de reporte_agentes):
--    select cron.schedule('generar-reporte-agentes','0 */2 * * *',
--      'select public.generar_reporte_agentes();
--       select public.reporte_agentes_recepcion_absurda();
--       select public.reporte_agentes_faltante_articulo();
--       select public.reporte_agentes_rendimiento_anomalo();');
--  Cliente: categoria 'rendimiento_anomalo' agregada al array CATS de agtRender (index.html).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reporte_agentes_rendimiento_anomalo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $fn$
declare
  rec record;
  nom text;
  semana_key text := to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'IYYY"W"IW');
begin
  for rec in
    with base as (
      select legajo, sum(armadas) arm, sum(pickeadas) pick,
        sum(arm_m3) arm_m3, sum(arm_eff_min) arm_eff, sum(pick_m3) pick_m3, sum(pick_eff_min) pick_eff,
        sum(arm_tandas_dur) arm_td, sum(pick_tandas_dur) pick_td
      from public.vista_productividad_semanal
      where semana_ts >= (now() at time zone 'America/Argentina/Buenos_Aires')::date - interval '28 days'
      group by legajo
    ),
    r as (
      select legajo,
        case when arm >= pick then 'armado' else 'picking' end rol,
        case when arm >= pick then 60*arm_m3/nullif(arm_eff,0) else 60*pick_m3/nullif(pick_eff,0) end m3h,
        case when arm >= pick then arm_td else pick_td end td
      from base
    ),
    med as (
      select rol, percentile_cont(0.5) within group (order by m3h) md, count(*) n
      from r where m3h is not null and td >= 5 group by rol
    )
    select r.legajo, r.rol, round(r.m3h::numeric, 2) m3h, round(m.md::numeric, 2) mediana, r.td,
      case when (r.m3h < coalesce(0.45 * m.md, 1e9))
                or (r.rol = 'armado' and r.m3h < 0.12) or (r.rol = 'picking' and r.m3h < 0.18)
           then 'bajo' else 'alto' end tipo
    from r join med m on m.rol = r.rol
    where r.td >= 8
      and (
        (m.n >= 3 and (r.m3h < 0.45 * m.md or r.m3h > 2.2 * m.md))
        or (r.rol = 'armado'  and (r.m3h > 2.0 or r.m3h < 0.12))
        or (r.rol = 'picking' and (r.m3h > 3.5 or r.m3h < 0.18))
      )
  loop
    select coalesce(nullif(btrim("Empleado"), ''), 'Legajo ' || rec.legajo) into nom
    from public."Empleados" where "Legajo" = rec.legajo limit 1;
    nom := coalesce(nom, 'Legajo ' || rec.legajo);

    insert into public.reporte_agentes (categoria, severidad, titulo, detalle, valor)
    values ('rendimiento_anomalo',
      case when rec.tipo = 'bajo' then 'alta' else 'media' end,
      nom || ' — ' || rec.rol,
      'rinde ' || rec.m3h || ' m³/h (' || (case when rec.tipo = 'bajo' then 'MUY BAJO' else 'MUY ALTO' end)
        || coalesce(' · normal ≈ ' || rec.mediana, '') || ' · ' || rec.td || ' tandas, últimas 4 sem)',
      rec.m3h);

    perform public.tg_enqueue(
      '📊⚠ RENDIMIENTO ' || (case when rec.tipo = 'bajo' then 'MUY BAJO' else 'MUY ALTO' end)
        || ' — ' || nom || ' (' || rec.rol || '): ' || rec.m3h || ' m³/h'
        || coalesce(' vs ' || rec.mediana || ' normal', '') || ' · ' || rec.td || ' tandas (4 sem). Revisar.',
      'rend_anom_' || rec.legajo || '_' || rec.rol || '_' || semana_key);
  end loop;
exception when others then null;   -- best-effort: nunca romper el resto del reporte
end $fn$;

-- ⚠ SEGURIDAD: esta función es SECURITY DEFINER y manda Telegram. NO debe ser
-- ejecutable por la anon key (pública). El cron (jobid 14) corre como postgres, que
-- conserva EXECUTE. Revocamos de public/anon/authenticated. (Migración
-- lock_down_telegram_report_functions, v4.82.)
revoke execute on function public.reporte_agentes_rendimiento_anomalo() from public, anon, authenticated;
grant  execute on function public.reporte_agentes_rendimiento_anomalo() to service_role;
