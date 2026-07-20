-- =====================================================================
--  auditoria_se_pendientes.sql — TAREAS PREPARADAS (no aplicadas)
--
--  Pendientes del backlog del agente SE (#35) que quedaron BLOQUEADOS
--  el 2026-07-01 porque el acceso MCP a Supabase se cayó en la sesión.
--  Correr en orden cuando vuelva el acceso. ⚠ Los UPDATE van con un
--  SELECT previo: verificar filas afectadas ANTES de ejecutar cada uno.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Ver el backlog vivo (referencia; confirma nombres de columnas)
-- ---------------------------------------------------------------------
select * from "Auditoria_Codigo" where estado = 'abierto' order by severidad, id;

-- ---------------------------------------------------------------------
-- 1) Marcar RESUELTOS los 4 hallazgos corregidos en v5.17 (commit 7250a0d)
--    Matchear por ubicacion/título — VERIFICAR el SELECT antes del UPDATE.
-- ---------------------------------------------------------------------
-- a) [ALTA] ocgEnter/ocgRecompute: normalización de códigos unificada (_ocgNorm en todos los cruces)
-- b) [media] fechas sin timeZone (formatDateTime + todayStr del monitor → tz AR)
-- c) [media] URL/KEY duplicada en index.html (bloque auth ahora referencia las globales)
-- d) [baja] función muerta _compLioReset (eliminada)
select id, severidad, ubicacion, estado from "Auditoria_Codigo"
where estado='abierto'
  and ( ubicacion ilike '%ocgRecompute%' or ubicacion ilike '%ocgEnter%'
     or ubicacion ilike '%formatDateTime%' or ubicacion ilike '%timeZone%' or ubicacion ilike '%3481%' or ubicacion ilike '%14803%'
     or ubicacion ilike '%16578%' or ubicacion ilike '%SB_URL%'
     or ubicacion ilike '%_compLioReset%' );
-- update "Auditoria_Codigo" set estado='resuelto'
-- where id in (/* ids confirmados del select de arriba */);

-- ---------------------------------------------------------------------
-- 2) [baja] Clases CSS muertas: la lista original está en el hallazgo.
--    Compararla contra lo borrado en el cliente (ver GUIA v5.18 cuando
--    esté) y marcar resuelto / ajustar.
-- ---------------------------------------------------------------------
select id, ubicacion from "Auditoria_Codigo" where estado='abierto' and ubicacion ilike '%css%';

-- ---------------------------------------------------------------------
-- 3) [media] 9 vistas SECURITY DEFINER: listarlas y decidir una a una
--    (algunas pueden ser intencionales; el patrón deseado es invoker
--    salvo que la vista DEBA saltear RLS a propósito).
-- ---------------------------------------------------------------------
select c.relname as vista,
       coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'), 'false') as security_invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='v'
order by 2, 1;
-- Para cada vista que NO deba ser definer:
-- alter view "NOMBRE" set (security_invoker = true);
-- (después re-testear el cliente: si la vista dependía de saltear RLS, se rompe la lectura anon)

-- ---------------------------------------------------------------------
-- 4) [baja] search_path mutable en ~9 funciones: listarlas y pinnear.
-- ---------------------------------------------------------------------
select p.proname, pg_get_function_identity_arguments(p.oid) args,
       p.prosecdef as security_definer,
       coalesce(array_to_string(p.proconfig, ','), '(sin search_path fijo)') config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public'
  and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
order by p.prosecdef desc, p.proname;
-- Para cada una:  alter function public.NOMBRE(args) set search_path = public;

-- ---------------------------------------------------------------------
-- 5) [media] Bucket público `remitos` lista archivos: restringir el list
--    (policy de storage.objects para anon: permitir SELECT solo por
--    objeto puntual si la app lo necesita, no listado).
-- ---------------------------------------------------------------------
select * from storage.buckets where id='remitos';
select policyname, cmd, roles, qual from pg_policies where schemaname='storage' and tablename='objects';

-- ---------------------------------------------------------------------
-- 6) [baja] Backup de horas sin RLS: activar RLS sin policies (solo owner).
-- ---------------------------------------------------------------------
select tablename, rowsecurity from pg_tables where schemaname='public' and not rowsecurity order by 1;
-- alter table "NOMBRE_BACKUP" enable row level security;

-- ---------------------------------------------------------------------
-- 7) Al terminar: re-correr el digest para que el Telegram refleje el estado
-- ---------------------------------------------------------------------
-- select auditoria_codigo_resumen_telegram(true);
