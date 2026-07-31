-- =====================================================================
--  racks_plani_ingreso_nacional.sql — RPC para el "Ingreso a racks" NACIONAL
--
--  A diferencia de racks_plani_ingreso (importación = stock NUEVO que llega),
--  acá la mercadería YA está en stock, en "a guardar" o "excedente", y se
--  DESPLAZA a racks. Por eso NO crea stock nuevo: hace un TRASLADO balanceado
--  (origen − , racks +) y ocupa/suma la celda del rack (misma lógica de celda
--  que racks_plani_ingreso).
--
--  Valida que haya stock suficiente en el origen (respeta el cutoff, igual que
--  vista_saldos_stock) → nunca deja el origen en negativo.
--
--  Patrón: RPC acotada SECURITY DEFINER + grant anon (como racks_plani_ingreso).
-- =====================================================================

create or replace function public.racks_plani_ingreso_nacional(
  p_sector text, p_cod text, p_master numeric, p_inner numeric,
  p_origen text, p_emp text, p_legajo text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sec    text := upper(btrim(coalesce(p_sector,'')));
  v_cod    text := upper(btrim(coalesce(p_cod,'')));
  v_codn   text := upper(regexp_replace(btrim(coalesce(p_cod,'')), '^0+(.)', '\1'));
  v_inner  numeric := coalesce(p_inner, 0);
  v_master numeric := coalesce(p_master, 0);
  v_orig   text := lower(btrim(coalesce(p_origen,'')));
  v_emp    text := coalesce(nullif(btrim(coalesce(p_emp,'')),''), 'LK');
  v_cutoff timestamptz;
  v_disp   numeric;
  r record;
begin
  if v_sec = '' or v_cod = '' then return 'error: falta sector o codigo'; end if;
  if v_inner <= 0 then return 'error: las cajas deben ser mayor a 0'; end if;
  if v_orig not in ('a_guardar','excedente') then return 'error: origen invalido'; end if;

  -- stock disponible en el ORIGEN (respeta el cutoff, igual que vista_saldos_stock)
  select valor::timestamptz into v_cutoff from "Stock_Config" where clave='cutoff_ts' limit 1;
  select coalesce(sum(m.delta),0) into v_disp
    from "Movimientos_Stock" m
   where m.deposito = v_orig
     and upper(regexp_replace(btrim(m.cod_art), '^0+(.)', '\1')) = v_codn
     and (v_cutoff is null or m.tipo='inicial' or m.ts >= v_cutoff);
  if v_disp < v_inner then return 'sin_stock:'||round(coalesce(v_disp,0)); end if;

  -- ocupar / sumar la celda del rack (igual que racks_plani_ingreso)
  select * into r from "Racks_Planimetria" where upper(btrim(sector)) = v_sec limit 1;
  if not found then
    insert into "Racks_Planimetria"(sector, cod_art, master_cajas, innercajas, estado, emp)
    values (v_sec, v_cod, v_master, v_inner, 'ocupado', v_emp);
  elsif r.estado is distinct from 'ocupado' or r.cod_art is null or btrim(coalesce(r.cod_art,'')) = '' then
    update "Racks_Planimetria"
       set cod_art=v_cod, master_cajas=v_master, innercajas=v_inner, estado='ocupado', emp=v_emp
     where id = r.id;
  elsif upper(btrim(r.cod_art)) = v_cod then
    update "Racks_Planimetria"
       set master_cajas = coalesce(master_cajas,0) + v_master,
           innercajas   = coalesce(innercajas,0) + v_inner
     where id = r.id;
  else
    return 'ocupado:' || r.cod_art;   -- el sector ya tiene OTRO código
  end if;

  -- TRASLADO de stock (NO crea stock nuevo): origen − , racks +
  insert into "Movimientos_Stock"(cod_art, deposito, delta, tipo, ref, unidad, legajo) values
    (v_cod, v_orig,  -v_inner, 'traslado', 'nacional a racks '||v_sec, 'inner', nullif(p_legajo,'')),
    (v_cod, 'racks',  v_inner, 'traslado', 'nacional desde '||v_orig||' a '||v_sec, 'inner', nullif(p_legajo,''));

  return 'ok';
end $function$;

revoke execute on function public.racks_plani_ingreso_nacional(text,text,numeric,numeric,text,text,text) from public;
grant execute on function public.racks_plani_ingreso_nacional(text,text,numeric,numeric,text,text,text) to anon, authenticated, service_role;
