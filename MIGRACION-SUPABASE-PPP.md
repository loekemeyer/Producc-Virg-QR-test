# Migración PPP: de Google Sheets a Supabase

> Estado: **listo para aplicar** (v2.80). El código de la app ya está preparado
> detrás de un flag; falta crear las tablas, agregar el hook en el Apps Script y
> activar el flag. Ver § 7 (por qué no se aplicó desde la sesión de Claude).

## 1. Qué resuelve

Hoy los datos de **programación, pedidos y m³** viven solo en Google Sheets y la
app los lee por gviz CSV. Eso impide **calcular m³ por SQL** (la limitación #1) y
ata la app a Google (hoja compartida + parseo frágil de gviz). Llevando 3 hojas a
Supabase, el monitor / picking / m³ se leen de la misma base que el resto y el m³
queda consultable por SQL.

## 2. Cómo funciona hoy la carga (la descubrimos en el código)

```
Excel (VBA: SincronizarAhora / PushAllSheets → PushSheet)
   --POST { token, sheetName, values }-->  Apps Script Web App
        doPost (Código.gs)  → dispatcher
            handleCargaPPPSync_ (Carga PPP.gs)
                clearContents() + setValues(values)   → escribe la hoja de Google
```

- El **Excel NO se toca**: solo manda el volcado de cada hoja (`values`, incluido
  el encabezado) al Web App.
- `handleCargaPPPSync_` hace **reemplazo total** de la pestaña (`clearContents` +
  `setValues`). **Ahí** enganchamos la escritura a Supabase, con los mismos
  `values` ya recibidos.

## 3. Alcance (definido por el dueño)

| Hoja Google (`sheetName`) | Tabla Supabase | Alimenta |
|---|---|---|
| PPP Excel Programacion Diaria | `PPP_Programacion_Diaria` | Monitor de tandas, m³, PDF facturación |
| PPP Excel Pedidos Entregados 2026 | `PPP_Pedidos_Entregados` | m³ histórico (fallback) |
| PPP Excel Base Datos Pedidos | `PPP_Base_Pedidos` | Lista de picking (artículos × pedido) |

Quedan **fuera**: `VolumenArticulos` y la planimetría.

## 4. Esquema

DDL en [`sql/ppp_supabase.sql`](sql/ppp_supabase.sql). Ejecutarlo en el **SQL
Editor** de Supabase (proyecto `hrxfctzncixxqmpfhskv`). ⚠ Hace **DROP + CREATE**:
correlo con las tablas vacías.

- **Reemplazo total**, no upsert: como el Apps Script hace `clearContents`+
  `setValues`, del lado Supabase borramos todo e insertamos. Por eso cada tabla
  usa **`id` autonumérico** y **no** hay clave natural ni `synced_at` (se permiten
  filas repetidas, igual que la hoja → fiel al comportamiento de la app).
- **m³ es `numeric`**. El Apps Script convierte coma→punto antes de enviar.
- RLS: `SELECT` para `anon`/`authenticated` (la app lee con la key publishable);
  la escritura va con `service_role` (bypassa RLS).

## 5. Lo que hay que tocar en el Apps Script (el paso real)

Todo está en [`apps-script/sync-ppp-supabase.gs`](apps-script/sync-ppp-supabase.gs).
Tres pasos:

1. **Pegar** ese archivo completo al final de `Carga PPP.gs` (el que tiene
   `handleCargaPPPSync_`).
2. **Una línea** dentro de `handleCargaPPPSync_`, justo después de escribir la hoja:
   ```javascript
   sheet.clearContents();
   sheet.getRange(1, 1, data.values.length, firstLen).setValues(data.values);

   // NUEVO: espejar a Supabase (best-effort, no rompe el sync del Sheet)
   try { pushPPPToSupabase_(data.sheetName, data.values); }
   catch (e) { console.error('pushPPPToSupabase_ ' + data.sheetName + ': ' + e); }
   ```
3. **Dos propiedades** del script (Configuración → Propiedades del script):
   ```
   SUPABASE_VIRGILIO_URL          = https://hrxfctzncixxqmpfhskv.supabase.co
   SUPABASE_VIRGILIO_SERVICE_KEY  = <service_role key del proyecto Virgilio>
   ```
   La `service_role` está en Supabase → *Project Settings → API → service_role*.
   Es **secreta**: va solo en Script Properties, nunca en el cliente ni en el repo.

> ⚠ **Por qué props nuevas:** el proyecto Apps Script ya tiene `SUPABASE_URL` /
> `SUPABASE_SERVICE_KEY`, pero apuntan a **otro** proyecto Supabase (la web,
> `kwkclwhmoygunqmlegrg`), no al de Producción Virgilio (`hrxfctzncixxqmpfhskv`).
> Por eso usamos `SUPABASE_VIRGILIO_*` y no reutilizamos las existentes.

El mapeo de columnas (en el .gs) replica EXACTO el de la app: Programación y Base
por **posición**, Entregados por **header** (`tanda` + `mt3`, excluye "Mt3 FC").

## 6. Lado app (ya en el código, v2.80)

`index.html` elige la fuente con el flag **`PPP_SOURCE`** (cerca de los
`SUPABASE_*_ENDPOINT`):

| valor | qué hace |
|---|---|
| `"sheets"` | Google Sheets, como siempre. **Default** → mergear v2.80 no cambia nada. |
| `"auto"` | intenta Supabase y **cae a Sheets** si está vacío/falla (transición). |
| `"supabase"` | solo Supabase (corta la dependencia de Google). |

`fetchMonitorSheet`, `fetchHistoricSheet` y `fetchPickingBase` quedaron como
*dispatcher* + `…FromSheets` + `…FromSupabase` (mismo Map de salida; m³ leído
numérico). Helper `supaFetchAll` pagina PostgREST (`Range` + `count=exact`).

## 7. Rollout

1. Correr `sql/ppp_supabase.sql` (crea las tablas).  ✅ *(ya hecho)*
2. Apps Script: pegar el .gs + la línea + las 2 props (§ 5). Tocar **guardar** en el
   Excel (o usar el botón Sincronizar) para que dispare una carga. Verificar con § 8.
3. En `index.html` poner `PPP_SOURCE = "auto"`, subir a `main`. La app usa Supabase y
   cae a Sheets sola si falta algo (sin downtime). Mirar el monitor unos días.
4. Validado → `PPP_SOURCE = "supabase"`. (Se puede dejar la escritura al Sheet como
   respaldo; no molesta.)

> Nota: el reemplazo total deja una ventana de ~segundos con la tabla vacía entre el
> DELETE y el INSERT. Por eso conviene rodar en `"auto"` (cae a Sheets) y que la
> sincronización no corra en pleno pico de picking. Si en el futuro molesta, se
> puede pasar a upsert + borrado por lote.

## 8. Verificación (m³ por SQL — antes imposible)

```sql
-- m³ por tanda (programación del día)
select upper(tanda) tanda, round(sum(m3)::numeric, 3) m3
from "PPP_Programacion_Diaria" where coalesce(tanda,'') <> ''
group by upper(tanda) order by 1;

-- m³ histórico por tanda (pedidos entregados)
select upper(tanda) tanda, round(sum(mt3)::numeric, 3) m3
from "PPP_Pedidos_Entregados" group by upper(tanda) order by 1;

-- artículos de un pedido (picking)
select articulo, cajas from "PPP_Base_Pedidos" where pedido = '97754' order by 1;
```

## 9. Por qué no se aplicó desde la sesión de Claude

Desde el entorno remoto de Claude Code el egress de red no tiene en allowlist
`hrxfctzncixxqmpfhskv.supabase.co` ni `docs.google.com`, y el MCP de Supabase de
esa sesión apunta a otra cuenta (`kwkclwhmoygunqmlegrg`). Por eso esto se entrega
como **SQL + código listos para aplicar**, no ejecutado.
