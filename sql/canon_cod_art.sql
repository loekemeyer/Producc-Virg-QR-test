-- canon_cod_art.sql — Capa 1 del arreglo de códigos duplicados en el stock.
--
-- Problema: el mismo artículo entraba a Movimientos_Stock con distinto relleno de ceros
-- (0027 / 27 / 027, 66 / 066), porque el stock event-sourced no canonicaliza el cod_art al
-- escribir. Eso parte el saldo y ensucia la solapa Stocks (que agrupa por cod_art crudo).
-- El caso disparador: la carga inicial manual del 27/7 metió artículos terminados con el
-- código mal escrito (y al depósito insumos).
--
-- Fix: trigger BEFORE INSERT que canonicaliza el cod_art, venga de donde venga (pegado
-- manual, app, cron, TWA). Fuente del canónico = OC_Maximos (lista curada, 1 por clave
-- normalizada; ahí el Colador es 027). Misma lógica que codCanon() del front (index.html).
--
-- ⚠ EXCLUYE los tipos que reconcilia el cron de pipeline (picking/separado/facturado):
--    tienen un índice único parcial mov_stock_pipeline_dedup sobre
--    (upper(trim(ref)), upper(trim(cod_art)), deposito, tipo). Canonicalizar su cod_art acá
--    interferiría con esa dedup. Esos tipos se cubren aparte (Capa 1b, junto al cron).
--
-- (Aplicado como migración `canon_cod_art_trigger`; este archivo es la copia versionada.)

create or replace function public.fn_canon_cod_art()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
  c text;
begin
  if NEW.cod_art is null then return NEW; end if;
  if NEW.tipo in ('picking','separado','facturado') then return NEW; end if;   -- no tocar: dedup del cron
  k := regexp_replace(upper(btrim(NEW.cod_art)), '^0+(?=.)', '');               -- clave sin ceros a la izq
  if k = '' then return NEW; end if;
  -- 1) canónico curado desde OC_Maximos (misma clave normalizada)
  select o.cod into c
    from public."OC_Maximos" o
   where o.activo
     and regexp_replace(upper(btrim(o.cod)), '^0+(?=.)', '') = k
   limit 1;
  if c is not null then
    NEW.cod_art := c;
  -- 2) fallback SOLO numéricos: sin ceros + relleno a mínimo 3 (nunca trunca)
  elsif NEW.cod_art ~ '^[0-9]+$' then
    NEW.cod_art := case when length(k) >= 3 then k else lpad(k, 3, '0') end;
  end if;
  -- alfanuméricos (PP, FLEJE·…, ALAMBRE, 46B) quedan intactos
  return NEW;
end;
$$;

drop trigger if exists trg_canon_cod_art on public."Movimientos_Stock";
create trigger trg_canon_cod_art
  before insert on public."Movimientos_Stock"
  for each row execute function public.fn_canon_cod_art();

-- Endurecimiento (auditoría): la función es de tipo trigger y NO es invocable como RPC,
-- pero el grant PUBLIC EXECUTE por defecto dispara los advisors 0028/0029. Se revoca para
-- dejarlos en verde; el trigger sigue funcionando (corre con privilegios del owner).
-- Aplicado como migración `canon_cod_art_revoke_execute`.
revoke execute on function public.fn_canon_cod_art() from public, anon, authenticated;
