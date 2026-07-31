-- Comprobantes_ARCA — log de comprobantes electrónicos emitidos contra ARCA (ex AFIP).
-- Esqueleto v6.41: la tabla existe pero TODAVÍA NO SE EMITE nada. La emisión la hará la
-- Edge Function `arca-wsfe` (service_role) cuando lleguen el certificado + el PDV nuevo.
-- Ver docs/facturacion-arca.md. RLS: anon SOLO lectura; la escritura la hace la función.
-- (Aplicado como migración `comprobantes_arca_skeleton`; este archivo es la copia versionada.)

create table if not exists public."Comprobantes_ARCA" (
  id            bigint generated always as identity primary key,
  np            text,
  tanda         text,
  cuit_cliente  text,
  tipo_cbte     int,            -- 1=FA A, 6=FA B, etc. (tabla ARCA)
  pto_vta       int,
  nro_cbte      bigint,
  importe_neto  numeric,
  importe_iva   numeric,
  importe_total numeric,
  cae           text,
  cae_vto       date,
  estado        text not null default 'pendiente',  -- pendiente|autorizado|rechazado
  entorno       text not null default 'homo',       -- homo|prod
  raw_resp      jsonb,
  creado        timestamptz not null default now()
);

alter table public."Comprobantes_ARCA" enable row level security;

-- anon: SOLO lectura. La escritura la hace la Edge Function con service_role (bypassa RLS).
drop policy if exists "anon_select_comprobantes_arca" on public."Comprobantes_ARCA";
create policy "anon_select_comprobantes_arca"
  on public."Comprobantes_ARCA"
  for select
  to anon
  using (true);
