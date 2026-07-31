-- seguridad_grants_facturacion.sql — endurecimiento de grants del ciclo facturación/entregas
-- (hallazgo del auditor-supabase al revisar las vistas PPP; par del seguridad_grants_stock.sql).
--
-- Problema: anon tenía escritura amplia (policies qual=true + grants default, y TRUNCATE que
-- SALTEA la RLS) sobre Facturacion_NP, Facturacion_Cierres y Entregas_Virgilio → con la anon
-- key (pública en el JS) se podía modificar/borrar facturación y entregas, o vaciar las tablas.
--
-- Verificado contra el código antes de revocar:
--   · Facturacion_NP: TODAS las escrituras (tick facTickNP POST on_conflict=np, revert DELETE
--     cierre_id=is.null, PATCH cierre_id del cierre) usan facAuthWriteHeaders → authenticated.
--     Anon solo LEE (monitor, FC s/Salida, historial).
--   · Facturacion_Cierres: ídem (el cierre escribe con facAuthWriteHeaders). Anon solo LEE.
--   · Entregas_Virgilio: el armado del OPERARIO inserta con la anon key (_compSaveEntregas /
--     _compFlushEntregas) → anon MANTIENE INSERT+SELECT. No existe PATCH/DELETE en el repo.
--
-- (Aplicado como migración `revoke_anon_facturacion_entregas`; este archivo es la copia.)

revoke insert, update, delete, truncate, references on public."Facturacion_NP" from anon;
revoke truncate, references on public."Facturacion_NP" from authenticated;
revoke insert, update, delete, truncate, references on public."Facturacion_Cierres" from anon;
revoke truncate, references on public."Facturacion_Cierres" from authenticated;
revoke update, delete, truncate, references on public."Entregas_Virgilio" from anon;
revoke truncate, references on public."Entregas_Virgilio" from authenticated;
