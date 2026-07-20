-- =====================================================================
--  auditoria_codigo.sql — Backlog del agente de Ingeniería de Software (#35)
--
--  El dueño pidió "un agente de software engineering que se la pase revisando el
--  programa y la info de Supabase para sugerir mejoras o encontrar defectos".
--  Este archivo documenta el SUSTRATO server-side de ese agente:
--
--   • Tabla `Auditoria_Codigo` — backlog PERSISTENTE de hallazgos. Vive acá y NO en
--     `reporte_agentes` porque `generar_reporte_agentes()` hace `delete from
--     reporte_agentes` + rebuild cada 2 h (cron 14) y borraría los hallazgos del SE.
--     La `huella` (clave estable por hallazgo) permite que el agente re-corra y haga
--     UPSERT (no duplica) y marque `estado='resuelto'` lo ya arreglado.
--       area      : codigo | supabase | seguridad
--       severidad : alta | media | baja
--       estado    : abierto | resuelto | descartado
--       ubicacion : archivo:linea | funcion | vista
--     RLS habilitada SIN policy para anon/authenticated (notas internas, sólo server;
--     las funciones SECURITY DEFINER del digest la leen igual porque corren como owner).
--     Si algún día se quieren ver en la app (solapa 🤖 Agentes), agregar policy de
--     lectura o un RPC SECURITY DEFINER puntual.
--
--   • Función `auditoria_codigo_resumen_telegram(p_enqueue boolean default true)` —
--     arma el digest de los hallazgos ABIERTOS agrupados por severidad (🔴/🟡/🟢) e
--     ícono por área (🔒 seguridad · 💻 código · 🗄 supabase) y lo encola a Telegram con
--     `tg_enqueue` (dedup `auditoria_codigo_YYYYMMDD`). La llama el agente recurrente al
--     terminar su pasada, o se puede colgar de un cron. SECURITY DEFINER + revoke de
--     anon/authenticated (mismo patrón que el resto de funciones Telegram).
--     Probar sin mandar:  select public.auditoria_codigo_resumen_telegram(false);
--
--  El AGENTE en sí (que descubre los hallazgos) corre como sesión de Claude vía el
--  "web scheduled trigger" (la decisión del dueño, opción A): cada corrida re-audita
--  código (index.html/recepcion.js) + Supabase (advisors, RLS, funciones), hace UPSERT
--  por `huella`, marca resueltos y llama al digest. v1 = sólo reporta; v2 = deja fixes
--  listos.
--
--  ── Primera auditoría (2026-06-29) ────────────────────────────────────────────────
--  Arreglado en el acto (holes claros, patrón ya autorizado):
--    • 14 funciones cron/trigger-only de Telegram/agentes eran ejecutables por la anon
--      key → REVOKE de public/anon/authenticated + GRANT service_role + search_path fijo
--      (migración lockdown_cron_telegram_agentes_functions). Verificado: ninguna se
--      llama desde el cliente; los triggers se disparan sin chequear EXECUTE.
--    • `vista_productividad_diaria` había quedado SECURITY DEFINER tras el rebuild con
--      dedup (regresión) → vuelta a security_invoker (migración
--      fix_productividad_diaria_security_invoker). Sus 2 base-tables son anon-SELECTables.
--  Reportado (sembrado en Auditoria_Codigo, sin tocar): ver tabla — 1 alta de código
--  (ocgRecompute normaliza códigos de 3 formas y las cruza, index.html:7728), fechas sin
--  timeZone, key triplicada, 9 vistas SECURITY DEFINER, bucket remitos lista archivos,
--  CSS muerto, etc.
-- =====================================================================

-- Tabla (idempotente)
create table if not exists public."Auditoria_Codigo" (
  id           bigint generated always as identity primary key,
  detectado_at timestamptz not null default now(),
  area         text not null,            -- codigo | supabase | seguridad
  severidad    text not null,            -- alta | media | baja
  titulo       text not null,
  detalle      text,
  ubicacion    text,                     -- archivo:linea | funcion | vista
  estado       text not null default 'abierto',  -- abierto | resuelto | descartado
  huella       text unique,              -- dedupe key (upsert al re-correr)
  resuelto_at  timestamptz,
  visto        boolean not null default false
);
alter table public."Auditoria_Codigo" enable row level security;
revoke all on public."Auditoria_Codigo" from anon, authenticated;

-- El cuerpo de auditoria_codigo_resumen_telegram(boolean) está aplicado en Supabase
-- (migración auditoria_codigo_resumen_telegram). Engancha de seguridad:
revoke execute on function public.auditoria_codigo_resumen_telegram(boolean) from public, anon, authenticated;
grant  execute on function public.auditoria_codigo_resumen_telegram(boolean) to service_role;

-- (Opcional) cron diario/semanal si se quiere mandar el digest sin esperar al agente:
--   select cron.schedule('auditoria-codigo-telegram', '0 12 * * 1',
--     $$select public.auditoria_codigo_resumen_telegram();$$);  -- lunes 09:00 AR
