-- =====================================================================
--  productividad_operario.sql  —  fuentes SQL del módulo 📊 "Rendimiento de operarios"
--
--  ⚠ v4.68: el cálculo de productividad ya NO usa la vista semanal de abajo. Se
--    reescribió como un MOTOR evento-por-evento en el CLIENTE (index.html:
--    prodCompute / _pvOperator / prodLoad). El motor trae los eventos crudos del
--    período elegido y aplica las reglas del dueño: el "envase" AP→TAP / EP→TP es
--    la actividad (los huecos adentro = armado/picking, no ocio); ocio = jornada sin
--    nada abierto; descarta los bordes (tandas que cruzan el inicio/fin del período);
--    topes solo a tareas secundarias. Permite elegir desde/hasta. La ÚNICA pieza SQL
--    que usa hoy es la vista de m³ `vista_tanda_m3` (abajo del todo).
--  La vista `vista_productividad_semanal` queda como REFERENCIA / SQL ad-hoc (semanal,
--    unión de intervalos). No la consume la app, pero el cuadre suma/suma sigue sirviendo.
--
--  Alimenta(ba) el módulo 📊 "Rendimiento de operarios" (openProductividad /
--  prodRender en index.html). 100% Supabase: NO usa el Google Sheet. Los m³
--  salen de PPP_Pedidos_Entregados (col mt3).
--
--  Proyecto: hrxfctzncixxqmpfhskv ("Control Partes Talleristas").
--  Aplicada con apply_migration (migraciones:
--    fix_productividad_bucket_by_ts_cliente, fix_productividad_m3_consistency_valido).
--
--  Grano: UNA fila por (legajo × semana ISO), últimas 8 semanas. El cliente
--  colapsa el período con SUMA/SUMA (no promedio de ratios).
--
--  KPI rector = m³/h por ROL (armador vs picker, NUNCA cruzados):
--      m3h_arm  = 60 * Σ arm_m3  / Σ arm_eff_min
--      m3h_pick = 60 * Σ pick_m3 / Σ pick_eff_min
--  Rangos reales validados: armado ~0.45–0.65, picking ~1.0–1.45 m³/h.
--
--  ── Decisiones de ingeniería de datos (por qué la vista es así) ──────────
--  1) BUCKET POR ts_cliente (hora real de la acción), NO created_at. created_at
--     es la hora de INSERT del server: con backfill/sync (equipos offline que
--     vuelcan cientos de eventos juntos) todos caían en una sola semana y la
--     unión de intervalos se disparaba (legajo 237 S21: 415 eventos de 14
--     semanas reales → prod_eff imposible de 21650 min). Con
--     coalesce(ts_cliente, created_at) cada tanda vuelve a su semana real.
--  2) TIEMPO EFECTIVO = UNIÓN DE INTERVALOS (gaps-and-islands), no suma de
--     duraciones (los cierres se solapan y duplicarían el tiempo). Topes por
--     actividad (cap_min) para botones dejados abiertos, y filtro mismo-día +
--     60s–12h en `valido`. Garantiza prod_eff ≤ all_eff ≤ jornada_min.
--  3) CONSISTENCIA m³/h: arm_m3 / pick_m3 se suman SOLO sobre tandas con
--     duración válida (e.valido), igual que arm_eff y *_tandas_dur. Si no, una
--     tanda con botón abierto suma su m³ al numerador pero su tiempo no entra
--     al denominador → m³/h inflado (legajo 8 S19: 12.6 en vez de 0.8).
--  4) JORNADA robusta: por día = (último − primer evento), tope 960 min/día.
--     No depende de AT/FJ (ventanas a veces corruptas). El % productivo =
--     prod_eff / jornada_min. El desglose de "motivos de la ociosidad" lo arma
--     el cliente: productivo + tareas secundarias (repartidas por peso t_*,
--     estimado) + "esperas / sin registrar" (= jornada − activo). Suma = jornada.
--
--  La app lee con la key PUBLISHABLE (anon) → la vista es security_invoker=true
--  (respeta la RLS de las tablas base con el rol del que consulta). SOLO SELECT.
--  Legajos '0' y '1' (pruebas) excluidos.
-- =====================================================================

CREATE OR REPLACE VIEW public.vista_productividad_semanal
WITH (security_invoker = true) AS
WITH ev AS (
  SELECT COALESCE(legajo, '?') AS legajo, opcion,
    (COALESCE(ts_cliente, created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AS dia,
    date_trunc('week', (COALESCE(ts_cliente, created_at) AT TIME ZONE 'America/Argentina/Buenos_Aires')::date::timestamp) AS sem,
    upper(btrim(texto)) AS tanda, ts_inicio, ts_cliente,
    (ts_inicio IS NOT NULL AND ts_cliente > ts_inicio
      AND extract(epoch FROM ts_cliente - ts_inicio) >= 60
      AND extract(epoch FROM ts_cliente - ts_inicio) <= 43200
      AND (ts_inicio AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
        = (ts_cliente AT TIME ZONE 'America/Argentina/Buenos_Aires')::date) AS valido,
    CASE WHEN ts_inicio IS NOT NULL AND ts_cliente > ts_inicio
      THEN extract(epoch FROM ts_cliente - ts_inicio) / 60.0 END AS raw_min,
    -- tope de minutos por tipo de acción (botón dejado abierto no infla el tiempo)
    CASE opcion
      WHEN 'TAP' THEN 180 WHEN 'TP' THEN 120
      WHEN 'CC' THEN 60 WHEN 'CCN' THEN 60 WHEN 'CCR' THEN 60
      WHEN 'CR' THEN 30 WHEN 'CRN' THEN 30 WHEN 'MG' THEN 20 WHEN 'PC' THEN 90
      WHEN 'RT' THEN 45 WHEN 'RR' THEN 45 WHEN 'RI' THEN 30 WHEN 'EI' THEN 30
      WHEN 'Limp' THEN 30 ELSE 30 END AS cap_min
  FROM "Registros_Produccion_Virgilio"
  WHERE COALESCE(ts_cliente, created_at) > (now() - interval '56 days')
    AND COALESCE(legajo, '') <> ALL (ARRAY['0','1'])
), evc AS (                              -- eventos válidos, con fin TOPEADO (e_cap)
  SELECT legajo, opcion, dia, sem, tanda, ts_inicio, ts_cliente, valido, raw_min, cap_min,
    ts_inicio + LEAST(ts_cliente - ts_inicio, cap_min::double precision * interval '1 min') AS e_cap
  FROM ev WHERE valido
), m3 AS (                               -- m³ por tanda (reemplazo del Sheet)
  SELECT upper(btrim(tanda)) AS tanda, sum(mt3) AS m3
  FROM "PPP_Pedidos_Entregados" WHERE mt3 > 0 GROUP BY upper(btrim(tanda))
), jor AS (                              -- jornada = (último−primer evento) por día, tope 960
  SELECT legajo, sem, round(sum(span), 1) AS jornada_min, count(*) FILTER (WHERE worked) AS jornadas
  FROM (
    SELECT legajo, sem, dia,
      LEAST(extract(epoch FROM max(ts_cliente) - min(COALESCE(ts_inicio, ts_cliente))) / 60.0, 960) AS span,
      bool_or(opcion = ANY (ARRAY['TAP','TP'])) AS worked
    FROM ev GROUP BY legajo, sem, dia
  ) d GROUP BY legajo, sem
), iv AS (                               -- intervalos por SCOPE para la unión
  SELECT legajo, sem, ts_inicio AS s, e_cap AS e, 'all'::text AS scope FROM evc
  UNION ALL SELECT legajo, sem, ts_inicio, e_cap, 'prod' FROM evc WHERE opcion = ANY (ARRAY['TAP','TP'])
  UNION ALL SELECT legajo, sem, ts_inicio, e_cap, 'arm' FROM evc WHERE opcion = 'TAP'
  UNION ALL SELECT legajo, sem, ts_inicio, e_cap, 'pick' FROM evc WHERE opcion = 'TP'
), isl AS (                              -- gaps-and-islands: numera islas no solapadas
  SELECT legajo, sem, scope, s, e,
    sum(CASE WHEN rmax IS NULL OR s > rmax THEN 1 ELSE 0 END)
      OVER (PARTITION BY legajo, sem, scope ORDER BY s, e) AS grp
  FROM (
    SELECT legajo, sem, scope, s, e,
      max(e) OVER (PARTITION BY legajo, sem, scope ORDER BY s, e
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS rmax
    FROM iv
  ) y
), eff AS (                              -- minutos efectivos = Σ (fin−inicio) por isla
  SELECT legajo, sem,
    max(tot) FILTER (WHERE scope = 'arm') AS arm_eff,
    max(tot) FILTER (WHERE scope = 'pick') AS pick_eff,
    max(tot) FILTER (WHERE scope = 'prod') AS prod_eff,
    max(tot) FILTER (WHERE scope = 'all') AS all_eff
  FROM (
    SELECT legajo, sem, scope, sum(extract(epoch FROM me - ms) / 60.0) AS tot
    FROM (SELECT legajo, sem, scope, grp, min(s) AS ms, max(e) AS me FROM isl GROUP BY legajo, sem, scope, grp) mg
    GROUP BY legajo, sem, scope
  ) z GROUP BY legajo, sem
)
SELECT e.legajo,
  to_char(e.sem, 'IYYY-"S"IW') AS semana,
  e.sem AS semana_ts,
  count(*) FILTER (WHERE e.opcion = 'TAP') AS armadas,
  count(*) FILTER (WHERE e.opcion = 'TP') AS pickeadas,
  round(percentile_cont(0.5) WITHIN GROUP (ORDER BY e.raw_min::double precision)
    FILTER (WHERE e.opcion = 'TAP' AND e.valido))::integer AS min_x_armado,
  round(COALESCE(ef.arm_eff, 0), 1) AS arm_eff_min,
  round(COALESCE(ef.pick_eff, 0), 1) AS pick_eff_min,
  round(COALESCE(ef.prod_eff, 0), 1) AS prod_eff_min,
  round(COALESCE(ef.all_eff, 0), 1) AS all_eff_min,
  -- m³ SOLO sobre tandas con duración válida (consistencia con arm_eff/pick_eff)
  round(sum(m.m3) FILTER (WHERE e.opcion = 'TAP' AND e.valido AND m.m3 IS NOT NULL), 2) AS arm_m3,
  round(sum(m.m3) FILTER (WHERE e.opcion = 'TP'  AND e.valido AND m.m3 IS NOT NULL), 2) AS pick_m3,
  count(*) FILTER (WHERE e.opcion = 'TAP' AND e.valido AND m.m3 IS NOT NULL) AS arm_tandas_dur,
  count(*) FILTER (WHERE e.opcion = 'TP'  AND e.valido AND m.m3 IS NOT NULL) AS pick_tandas_dur,
  COALESCE(max(j.jornadas), 0) AS jornadas,
  round(COALESCE(max(j.jornada_min), 0), 1) AS jornada_min,
  -- desglose de tiempo (capped-sum) para explicar la ociosidad
  round(sum(LEAST(e.raw_min, e.cap_min::numeric)) FILTER (WHERE e.valido AND e.opcion = ANY (ARRAY['CC','CCN','CCR'])), 1) AS t_carga,
  round(sum(LEAST(e.raw_min, e.cap_min::numeric)) FILTER (WHERE e.valido AND e.opcion = ANY (ARRAY['CR','CRN'])), 1) AS t_control,
  round(sum(LEAST(e.raw_min, e.cap_min::numeric)) FILTER (WHERE e.valido AND e.opcion = 'MG'), 1) AS t_movim,
  round(sum(LEAST(e.raw_min, e.cap_min::numeric)) FILTER (WHERE e.valido AND e.opcion = 'PC'), 1) AS t_comida,
  round(sum(LEAST(e.raw_min, e.cap_min::numeric)) FILTER (WHERE e.valido AND e.opcion = ANY (ARRAY['RT','RR','RI','EI'])), 1) AS t_recep,
  round(sum(LEAST(e.raw_min, e.cap_min::numeric)) FILTER (WHERE e.valido AND e.opcion = 'Limp'), 1) AS t_limp,
  round(sum(LEAST(e.raw_min, e.cap_min::numeric)) FILTER (WHERE e.valido AND e.opcion <> ALL (ARRAY['TAP','TP','CC','CCN','CCR','CR','CRN','MG','PC','RT','RR','RI','EI','Limp'])), 1) AS t_otros
FROM ev e
  LEFT JOIN m3 m ON m.tanda = e.tanda
  LEFT JOIN jor j ON j.legajo = e.legajo AND j.sem = e.sem
  LEFT JOIN eff ef ON ef.legajo = e.legajo AND ef.sem = e.sem
GROUP BY e.legajo, e.sem, ef.arm_eff, ef.pick_eff, ef.prod_eff, ef.all_eff
HAVING count(*) FILTER (WHERE e.opcion = ANY (ARRAY['TAP','TP'])) > 0;

-- Chequeo de invariante (debe dar 0, 0):
--   SELECT count(*) FILTER (WHERE prod_eff_min > all_eff_min + 1)            AS prod_gt_all,
--          count(*) FILTER (WHERE all_eff_min  > jornada_min + 1 AND jornada_min > 0) AS all_gt_jor
--   FROM vista_productividad_semanal;


-- =====================================================================
--  vista_tanda_m3 (v4.68)  —  m³ por tanda, la ÚNICA pieza SQL que usa hoy el módulo.
--
--  Dos fuentes de m³ en Supabase: PPP_Pedidos_Entregados (lo realmente ENTREGADO,
--  espejo del Sheet "Pedidos Entregados", solo tanda+mt3) y PPP_Programacion_Diaria
--  (la programación, m³ por pedido/np). Una tanda recién armada puede no estar todavía
--  en Entregados (no se entregó/sincronizó) pero sí en Programación. Se toma Entregados
--  primero (real) y Programación de respaldo → cobertura de ~93% a ~96% de las tandas
--  armadas. El cliente la baja entera (tanda→m3) y arma un mapa.
-- =====================================================================
CREATE OR REPLACE VIEW public.vista_tanda_m3
WITH (security_invoker = true) AS
WITH ent AS (
  SELECT upper(btrim(tanda)) AS tanda, sum(mt3) AS m3
  FROM "PPP_Pedidos_Entregados" WHERE mt3 > 0 GROUP BY upper(btrim(tanda))
), prog AS (
  SELECT upper(btrim(tanda)) AS tanda, sum(m3) AS m3
  FROM "PPP_Programacion_Diaria" WHERE m3 > 0 GROUP BY upper(btrim(tanda))
)
SELECT COALESCE(e.tanda, p.tanda) AS tanda,
       round(COALESCE(e.m3, p.m3), 3) AS m3,
       (e.m3 IS NOT NULL) AS entregado
FROM ent e FULL JOIN prog p ON e.tanda = p.tanda
WHERE COALESCE(e.m3, p.m3) > 0;
