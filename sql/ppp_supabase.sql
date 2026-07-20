-- =====================================================================
--  PPP en Supabase  —  espeja en Postgres las hojas de Google que hoy
--  lee la app (programación / pedidos / m³). Objetivo: sacar la
--  dependencia de Google y poder calcular m³ por SQL.
--
--  Proyecto: hrxfctzncixxqmpfhskv ("Control Partes Talleristas").
--  Ejecutar en el SQL Editor de Supabase.
--
--  ⚠ DROP + CREATE: este script BORRA y recrea las 3 tablas. Correlo cuando
--    están vacías (recién creadas / aún sin datos cargados). Si ya tienen datos
--    que querés conservar, no lo corras tal cual.
--
--  Modelo de carga: REEMPLAZO TOTAL. El Apps Script (handleCargaPPPSync_) hace
--  clearContents+setValues en el Sheet; del lado Supabase espejamos igual
--  (DELETE all + INSERT). Por eso NO hace falta clave natural ni upsert: cada
--  tabla usa un id autonumérico y se permiten filas repetidas (igual que la hoja).
--
--  Quién escribe / quién lee:
--    • La app lee con la key PUBLISHABLE (rol anon / authenticated) → SOLO SELECT.
--    • El Apps Script escribe con la SERVICE_ROLE key del proyecto Virgilio
--      (bypassa RLS). NUNCA exponer write al rol anon.
--
--  m³: NUMERIC (no texto). La hoja trae coma decimal; el Apps Script convierte.
-- =====================================================================

drop table if exists public."PPP_Programacion_Diaria" cascade;
drop table if exists public."PPP_Pedidos_Entregados"  cascade;
drop table if exists public."PPP_Base_Pedidos"        cascade;

-- ── 1) Programación diaria ───────────────────────────────────────────
--  Una fila por pedido (las que tienen N° NP). Columnas en el MISMO orden que
--  el layout fijo del Excel que lee fetchMonitorSheet (Tanda=0, Tipo=1, NP=2,
--  FechaRecep=3, Cod=4, RazonSocial=5, M3=6, V=7, Direccion=8, Barrio=9, Op=10,
--  FechaEntrega=11, FechaFc=12, Zona=13, Observaciones=14).
create table public."PPP_Programacion_Diaria" (
  id            bigint generated always as identity primary key,
  np            text,
  tanda         text,
  tipo          text,
  fecha_recep   text,
  cod           text,
  razon_social  text,
  m3            numeric,
  v             text,
  direccion     text,
  barrio        text,
  op            text,                     -- "SI" / "" (planificado)
  fecha_entrega text,                     -- texto, mismo formato que la hoja
  fecha_fc      text,
  zona          text,
  observaciones text
);
create index ppp_prog_tanda_idx on public."PPP_Programacion_Diaria" (upper(tanda));

-- ── 2) Pedidos entregados (histórico, fuente del m³ fallback) ─────────
--  La app sólo suma mt3 por tanda → con tanda + mt3 alcanza. ⚠ col "Mt3", NO "Mt3 FC".
create table public."PPP_Pedidos_Entregados" (
  id    bigint generated always as identity primary key,
  tanda text,
  mt3   numeric
);
create index ppp_entr_tanda_idx on public."PPP_Pedidos_Entregados" (upper(tanda));

-- ── 3) Base de pedidos (artículos por pedido, para el picking) ────────
--  Una fila por línea (pedido, artículo, cajas). Sin agregar: el picking suma
--  por código en la app, igual que con la hoja.
create table public."PPP_Base_Pedidos" (
  id       bigint generated always as identity primary key,
  pedido   text,                          -- col "Pedido" (A)
  articulo text,                          -- col "Art" (C)
  cajas    numeric                        -- col "Cant"/"Cantidad Cajas" (F)
);
create index ppp_base_pedido_idx on public."PPP_Base_Pedidos" (pedido);

-- ── RLS: la app (anon/authenticated) solo lee; el Apps Script escribe con service_role ──
alter table public."PPP_Programacion_Diaria" enable row level security;
alter table public."PPP_Pedidos_Entregados"  enable row level security;
alter table public."PPP_Base_Pedidos"        enable row level security;

create policy "ppp_prog_select" on public."PPP_Programacion_Diaria"
  for select to anon, authenticated using (true);
create policy "ppp_entr_select" on public."PPP_Pedidos_Entregados"
  for select to anon, authenticated using (true);
create policy "ppp_base_select" on public."PPP_Base_Pedidos"
  for select to anon, authenticated using (true);
-- (Sin policy de INSERT/UPDATE/DELETE a propósito: solo service_role escribe.)

-- =====================================================================
--  VERIFICACIÓN — m³ por tanda YA calculable por SQL (la limitación #1):
--
--    select upper(tanda) tanda, round(sum(m3)::numeric, 3) m3
--    from "PPP_Programacion_Diaria" where coalesce(tanda,'') <> ''
--    group by upper(tanda) order by 1;
--
--    select upper(tanda) tanda, round(sum(mt3)::numeric, 3) m3
--    from "PPP_Pedidos_Entregados" group by upper(tanda) order by 1;
-- =====================================================================
