-- seguridad_grants_stock.sql — endurecimiento de grants (hallazgo del auditor).
--
-- Problema: por el grant default de Supabase, anon/authenticated tenían TODOS los privilegios
-- sobre Movimientos_Stock y OC_Maximos. DELETE/UPDATE los tapa la RLS, PERO **TRUNCATE NO
-- respeta RLS** → con la anon key (pública en el JS del cliente) alguien podía vaciar la tabla
-- central de stock. Movimientos_Stock además no tiene policy de DELETE/UPDATE, así que la app
-- nunca los usa por estos roles: revocarlos es seguro.
--
-- Se MANTIENE lo que la app sí usa: anon INSERT+SELECT en stock (stockMove), anon SELECT en
-- OC_Maximos (lectura), y los grants de authenticated en OC_Maximos (editor de índices con
-- sesión de supervisor). (Aplicado como migración `revoke_anon_peligrosos_stock_ocmax`.)

revoke truncate, delete, update, references on public."Movimientos_Stock" from anon, authenticated;
revoke truncate, delete, update, insert, references on public."OC_Maximos" from anon;
