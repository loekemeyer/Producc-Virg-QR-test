-- =====================================================================
--  capacidad_sin_maximo.sql — Alerta "📐 CAPACIDAD SIN PROYECCIÓN"
--
--  Regla del dueño: un artículo NO debería tener lugar en góndola si no tiene
--  proyección de ventas. Si `Capacidad_Sector` tiene el código pero `OC_Maximos`
--  no (activo), casi siempre es el código mal escrito (le falta la E, un cero…).
--  Avisa por Telegram y sugiere la E si el código + "E" SÍ tiene máximo.
--  (La solapa 📐 Capacidad ya lo muestra en pantalla, v5.60; esto lo hace proactivo.)
--
--  Dedup SEMANAL (dato de calidad, cambia lento). Encadenada al cron de agentes
--  (jobid 14). SECURITY DEFINER + grant solo service_role.
-- =====================================================================

create or replace function public.reporte_agentes_capacidad_sin_maximo()
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  sem     text := to_char((now() at time zone 'America/Argentina/Buenos_Aires')::date, 'IYYY-IW');
  n       int;
  detalle text;
  ids     text;
begin
  with capn as (
    select upper(regexp_replace(trim(cod), '^0+(.)', '\1')) as codn, min(cod) as cod, sum(cajas_max) as cajas
    from public."Capacidad_Sector" group by 1),
  maxn as (
    select distinct upper(regexp_replace(trim(cod), '^0+(.)', '\1')) as codn
    from public."OC_Maximos" where coalesce(activo, true)),
  sinmax as (
    select c.cod, c.codn, round(c.cajas) as cajas,
           exists (select 1 from maxn m where m.codn = c.codn || 'E') as hay_e
    from capn c
    where not exists (select 1 from maxn m where m.codn = c.codn))
  select count(*),
         string_agg(cod || ' (' || cajas || ' cj)' || case when hay_e then ' → ¿' || cod || 'E?' else '' end, E'\n• ' order by cod),
         string_agg(codn, ',' order by codn)
    into n, detalle, ids
    from sinmax;

  if coalesce(n, 0) = 0 then return; end if;

  perform public.tg_enqueue(
    '📐 CAPACIDAD SIN PROYECCIÓN — ' || n || ' artículo(s) con lugar en góndola pero SIN máximo/proyección (revisar, ¿código mal escrito?):' || E'\n• ' || coalesce(detalle, '-')
      || E'\n\n👉 Un artículo no debería tener lugar en góndola sin proyección: corregí el código o sacale el lugar.',
    'capsinmax_' || sem || '_' || md5(coalesce(ids, '')));
exception when others then null;
end
$function$;

revoke execute on function public.reporte_agentes_capacidad_sin_maximo() from public, anon, authenticated;
grant execute on function public.reporte_agentes_capacidad_sin_maximo() to service_role;

-- Encadenar al cron 14: ... select public.reporte_agentes_capacidad_sin_maximo();

-- Limpieza de modelo (#5): la tabla vieja Capacidad_Gondola (730 filas, superseded por
-- Capacidad_Sector que usa la app; 0 refs en código/funciones/vistas/triggers) se
-- ARCHIVÓ (no borró, reversible):
--   alter table "Capacidad_Gondola" rename to "zzz_backup_Capacidad_Gondola";
-- Para restaurar: alter table "zzz_backup_Capacidad_Gondola" rename to "Capacidad_Gondola";
