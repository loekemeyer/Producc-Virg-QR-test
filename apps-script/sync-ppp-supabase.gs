/* =====================================================================
 *  sync-ppp-supabase.gs  —  espeja las 3 hojas PPP en Supabase (Producción
 *  Virgilio) cada vez que el Apps Script las escribe.
 *
 *  CÓMO INSTALARLO (3 pasos):
 *
 *  1) Pegá TODO este archivo en el proyecto de Apps Script (p. ej. al final de
 *     "Carga PPP.gs", el archivo que ya tiene handleCargaPPPSync_).
 *
 *  2) En handleCargaPPPSync_, justo DESPUÉS de escribir el Sheet:
 *
 *         sheet.clearContents();
 *         sheet.getRange(1, 1, data.values.length, firstLen).setValues(data.values);
 *
 *     agregá esta línea (best-effort: si Supabase falla, NO rompe el sync del Sheet):
 *
 *         try { pushPPPToSupabase_(data.sheetName, data.values); }
 *         catch (e) { console.error('pushPPPToSupabase_ ' + data.sheetName + ': ' + e); }
 *
 *  3) En Configuración del proyecto → Propiedades del script, agregá DOS:
 *         SUPABASE_VIRGILIO_URL          = https://hrxfctzncixxqmpfhskv.supabase.co
 *         SUPABASE_VIRGILIO_SERVICE_KEY  = <service_role key del proyecto Virgilio>
 *     (la service_role está en Supabase → Project Settings → API → "service_role".
 *      Es SECRETA: va sólo acá, nunca en el cliente ni en el repo.)
 *     ⚠ OJO: las props SUPABASE_URL / SUPABASE_SERVICE_KEY que ya existen apuntan
 *      a OTRO proyecto (la web, kwkclwhmoygunqmlegrg). Por eso usamos props nuevas.
 *
 *  Modelo: REEMPLAZO TOTAL por tabla (DELETE all + INSERT), igual que el
 *  clearContents+setValues del Sheet. Mapea columnas con la MISMA lógica que la
 *  app (index.html): Programación y Base por posición, Entregados por header.
 * ===================================================================== */

var PPP_SUPABASE_MAP = {
  'PPP Excel Programacion Diaria':     'PPP_Programacion_Diaria',
  'PPP Excel Pedidos Entregados 2026': 'PPP_Pedidos_Entregados',
  'PPP Excel Base Datos Pedidos':      'PPP_Base_Pedidos'
};

function pushPPPToSupabase_(sheetName, values) {
  var table = PPP_SUPABASE_MAP[sheetName];
  if (!table) return;                         // hoja no espejada (no debería pasar)
  var rows;
  if (sheetName === 'PPP Excel Programacion Diaria')          rows = _pppMapProgramacion_(values);
  else if (sheetName === 'PPP Excel Pedidos Entregados 2026') rows = _pppMapEntregados_(values);
  else                                                        rows = _pppMapBasePedidos_(values);
  if (!rows.length) return;                   // nada parseable → no toca la tabla
  _pppSupaReplaceAll_(table, rows);
}

/* ---- credenciales del proyecto Virgilio (NO las del tenant LK/CH de la web) ---- */
function _pppSupaCreds_() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty('SUPABASE_VIRGILIO_URL') || '').replace(/\/$/, '');
  var key = props.getProperty('SUPABASE_VIRGILIO_SERVICE_KEY') || '';
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_VIRGILIO_URL / SUPABASE_VIRGILIO_SERVICE_KEY en Script Properties');
  }
  return { url: url, key: key };
}

/* ---- reemplazo total: borra todo e inserta en lotes de 500 ---- */
function _pppSupaReplaceAll_(table, rows) {
  var creds = _pppSupaCreds_();
  var base = { apikey: creds.key, Authorization: 'Bearer ' + creds.key };
  var ep = creds.url + '/rest/v1/' + encodeURIComponent(table);

  // 1) borrar TODO (PostgREST exige un filtro; id>=0 matchea todas las filas)
  var del = UrlFetchApp.fetch(ep + '?id=gte.0', {
    method: 'delete', headers: base, muteHttpExceptions: true
  });
  var dc = del.getResponseCode();
  if (dc >= 300) throw new Error('Supabase DELETE ' + table + ' HTTP ' + dc + ': ' + del.getContentText().substring(0, 200));

  // 2) insertar en lotes
  for (var i = 0; i < rows.length; i += 500) {
    var lote = rows.slice(i, i + 500);
    var resp = UrlFetchApp.fetch(ep, {
      method: 'post', contentType: 'application/json',
      headers: Object.assign({ Prefer: 'return=minimal' }, base),
      payload: JSON.stringify(lote), muteHttpExceptions: true
    });
    var code = resp.getResponseCode();
    if (code >= 300) throw new Error('Supabase INSERT ' + table + ' HTTP ' + code + ': ' + resp.getContentText().substring(0, 200));
  }
  console.log('Supabase replace ' + table + ': ' + rows.length + ' filas');
}

/* ---- helpers de valor ---- */
function _pppNum_(v) {                         // número con coma o punto -> Number|null
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  var s = String(v).trim();
  if (!s) return null;
  s = s.indexOf(',') >= 0 ? s.replace(/\./g, '').replace(',', '.') : s;
  var n = Number(s);
  return isNaN(n) ? null : n;
}
function _pppStr_(v) { return v === null || v === undefined ? '' : String(v).trim(); }

/* ---- Programación Diaria: por POSICIÓN (igual que fetchMonitorSheet).
        Fila = pedido sólo si col C (N° NP, índice 2) tiene algún dígito. ---- */
function _pppMapProgramacion_(values) {
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i]; if (!r) continue;
    var np = _pppStr_(r[2]);
    if (!/\d/.test(np)) continue;              // saltea títulos/encabezados/totales
    out.push({
      np: np, tanda: _pppStr_(r[0]), tipo: _pppStr_(r[1]), fecha_recep: _pppStr_(r[3]),
      cod: _pppStr_(r[4]), razon_social: _pppStr_(r[5]), m3: _pppNum_(r[6]), v: _pppStr_(r[7]),
      direccion: _pppStr_(r[8]), barrio: _pppStr_(r[9]), op: _pppStr_(r[10]),
      fecha_entrega: _pppStr_(r[11]), fecha_fc: _pppStr_(r[12]), zona: _pppStr_(r[13]),
      observaciones: _pppStr_(r[14])
    });
  }
  return out;
}

/* ---- Pedidos Entregados: por HEADER (igual que fetchHistoricSheet).
        Header en la fila 0; necesita "tanda" y "mt3"/"m3" (excluye "fc"). ---- */
function _pppMapEntregados_(values) {
  if (!values.length) return [];
  var header = values[0].map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); });
  var cTanda = header.indexOf('tanda');
  var cMt3 = -1;
  for (var c = 0; c < header.length; c++) {
    if ((header[c] === 'mt3' || header[c] === 'm3') && header[c].indexOf('fc') < 0) { cMt3 = c; break; }
  }
  if (cTanda < 0 || cMt3 < 0) {
    throw new Error('Entregados: faltan columnas tanda/mt3 (headers: ' + header.join('|') + ')');
  }
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i]; if (!r) continue;
    var tanda = _pppStr_(r[cTanda]);
    if (!tanda) continue;
    out.push({ tanda: tanda, mt3: _pppNum_(r[cMt3]) });
  }
  return out;
}

/* ---- Base Datos Pedidos: por POSICIÓN (igual que fetchPickingBase):
        Pedido=A(0), Artículo=C(2), Cajas=F(5). Fila válida si Pedido empieza
        con dígito (saltea el header "Pedido"). ---- */
function _pppMapBasePedidos_(values) {
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i]; if (!r) continue;
    var ped = _pppStr_(r[0]).replace(/\.0+$/, '');     // "97754.0" -> "97754"
    if (!/^\d/.test(ped)) continue;
    var art = _pppStr_(r[2]);
    if (!art) continue;
    out.push({ pedido: ped, articulo: art, cajas: _pppNum_(r[5]) });
  }
  return out;
}
