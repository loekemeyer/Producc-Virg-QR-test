-- ARCA_TA — cache del Ticket de Acceso (TA) de WSAA para la Edge Function arca-wsfe.
-- ARCA rechaza pedir un TA nuevo mientras hay uno vigente (~12 h), así que la función
-- lo guarda acá y lo reusa hasta 5 min antes del vencimiento.
-- Solo la usa la Edge Function con service_role: RLS sin policies + revoke a anon/auth.
-- (Aplicado como migración `arca_ta_cache`; este archivo es la copia versionada.)

create table if not exists public."ARCA_TA" (
  service text primary key,          -- 'wsfe-homo' | 'wsfe-prod'
  entorno text not null,
  token   text not null,
  sign    text not null,
  expira  timestamptz not null,
  creado  timestamptz not null default now()
);
alter table public."ARCA_TA" enable row level security;
revoke all on public."ARCA_TA" from anon, authenticated;
