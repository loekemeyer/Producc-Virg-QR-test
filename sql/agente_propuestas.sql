-- =====================================================================
-- agente_propuestas.sql — Backlog de los agentes diarios (mejoras / lógica)
--
-- Tabla interna donde los dos agentes diarios (mejoras-virgilio, revisor-logica)
-- guardan sus propuestas con un CÓDIGO de 4 dígitos. El usuario pasa ese código a
-- cualquier chat de Claude para retomar la propuesta (ver CLAUDE.md y
-- docs/AGENTES-DIARIOS.md).
--
-- RLS activa y SIN policies para anon: el front (anon key) no la toca. Los agentes
-- operan vía MCP (rol elevado que bypassa RLS).
-- =====================================================================

create table if not exists public.agente_propuestas (
  codigo          text primary key,
  agente          text not null,                 -- nombre del agente (cualquiera del repo)
  titulo          text not null,
  detalle         text,
  impacto         text,
  esfuerzo        text,
  ubicacion       text,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','lista','aprobada','hecha','descartada')),
  rama            text,                           -- idea/<codigo> ya desarrollada y verificada
  creado_en       timestamptz not null default now(),
  desarrollada_en timestamptz,
  enviado_en      timestamptz,                    -- cuando el curador la mando por Telegram
  curador_nota    text,
  actualizado_en  timestamptz
);
-- estados: pendiente (propuesta) -> lista (desarrollada en rama) -> hecha (mergeada a main)
--          | descartada (curador o usuario)

alter table public.agente_propuestas enable row level security;

comment on table public.agente_propuestas is
 'Backlog de los agentes diarios (mejoras / revision de logica). Cada fila tiene un codigo de 4 digitos que el usuario puede pasar a cualquier chat de Claude para retomar esa propuesta. Interna: sin acceso anon.';

create index if not exists ix_agente_propuestas_estado
  on public.agente_propuestas(estado, creado_en desc);

-- Devuelve un código de 4 dígitos libre (no repetido entre las propuestas).
create or replace function public.nuevo_codigo_propuesta() returns text
language plpgsql as $$
declare c text;
begin
  loop
    c := lpad((1000 + floor(random()*9000))::int::text, 4, '0');
    exit when not exists (select 1 from public.agente_propuestas where codigo = c);
  end loop;
  return c;
end $$;

-- Envío por Telegram (reusa el mecanismo existente):
--   select public.tg_enqueue('<msg>', '<dedup>', '<CHAT_ID_PRIVADO>', 'HTML');
--   select public.tg_outbox_flush();
