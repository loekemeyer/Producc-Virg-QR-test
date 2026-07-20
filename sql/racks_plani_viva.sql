-- =====================================================================
--  racks_plani_viva.sql — RPC para la PLANIMETRÍA VIVA de racks (v5.22)
--
--  El módulo operario "Bajar de racks" ahora muestra las UBICACIONES del
--  código (chips desde Racks_Planimetria) y al confirmar descuenta de la
--  celda elegida llamando esta RPC (best-effort: si no existe, el cliente
--  falla silencioso y solo queda el ledger). Sin esto, la planimetría
--  cargada el 30/06 se desactualiza con la primera bajada y deja de servir
--  para encontrar mercadería.
--
--  ⚠ PENDIENTE de aplicar: generado con el conector caído. Lo aplica el
--  vigía (o correr acá / SQL editor). Patrón de seguridad: RPC acotada
--  SECURITY DEFINER + grant anon (como cp_completar_faltante) — solo
--  descuenta de esta tabla, con clamps.
-- =====================================================================

create or replace function racks_plani_descontar(p_sector text, p_cod text, p_inner numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_inner is null or p_inner <= 0 or p_inner > 100000 then
    return;   -- basura / abuso: no tocar nada
  end if;
  update "Racks_Planimetria"
     set master_cajas = case
           when coalesce(innercajas, 0) > 0
             then round(coalesce(master_cajas, 0) * greatest(0, innercajas - p_inner) / innercajas)
           else master_cajas
         end,
         innercajas = greatest(0, coalesce(innercajas, 0) - p_inner)
   where sector = p_sector
     and upper(replace(trim(cod_art), ' ', '')) = upper(replace(trim(p_cod), ' ', ''))
     and estado = 'ocupado';
end
$$;

revoke execute on function racks_plani_descontar(text, text, numeric) from public;
grant execute on function racks_plani_descontar(text, text, numeric) to anon, authenticated, service_role;

-- Verificación (después de aplicar):
-- select racks_plani_descontar('ZZTEST', 'NADA', 1);  -- no debe fallar ni tocar filas
-- select sector, cod_art, master_cajas, innercajas from "Racks_Planimetria" where cod_art = '437E';
