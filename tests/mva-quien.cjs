/* Regresión v6.66/v6.67 del pop-up de movimientos por artículo:
   - v6.66: chip 👤 con SIGLAS + LEGAJO del que hizo cada movimiento (en `recepcion`,
     del que recibió). legajo propio → gris/exacto; recepción vieja sin legajo →
     deducido por la sesión de RT que contiene el ts (ámbar + "~"); sin sesión → nada.
   - v6.67 "+": cada recepción trae un toggle que despliega la ENTREGA completa
     (día, proveedor/tallerista, y los códigos con cuántas cajas de cada uno) desde
     Control_Modo_OP; fallback a _stk.movs si no hay fila. El código de la fila abierta
     se resalta.
   - v6.67 "0 con historial": las celdas de depósito de la tabla son clickeables aunque
     el saldo sea 0 si el artículo tuvo movimientos ahí (marcadas stk-hist0). */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) { try { ({ chromium } = require("playwright")); } catch (_e2) { console.error("Playwright no encontrado."); process.exit(2); } }
(async () => {
  const root = path.join(__dirname, "..");
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(root, "index.html"), { waitUntil: "domcontentloaded" });
  const r = await p.evaluate(() => {
    const T = (s) => new Date(s).getTime();
    _empleadosNombres = new Map([["104", "Ariel Gomez"], ["237", "Pedro Suarez"], ["122", "Luis Paz"]]);
    _stkRtSes = [
      { leg: "104", ini: T("2026-07-06T15:14:00Z"), fin: T("2026-07-06T16:07:00Z") },
      { leg: "237", ini: T("2026-07-06T15:23:00Z"), fin: T("2026-07-06T15:43:00Z") },
      { leg: "122", ini: T("2026-07-08T09:00:00Z"), fin: Infinity }
    ];
    const chip = (mv) => _stkQuienChip(mv);
    // ---- v6.66: quién ----
    const a = chip({ tipo: "guardado", legajo: "237", ts: "2026-07-08T17:01:00Z" });
    const exacto = a.indexOf("PS") > 0 && a.indexOf("· 237") > 0 && a.indexOf("aprox") < 0 && a.indexOf("~") < 0;
    const bq = chip({ tipo: "recepcion", legajo: null, ts: "2026-07-06T15:57:00Z" });
    const deducido = bq.indexOf("aprox") > 0 && bq.indexOf("AG") > 0 && bq.indexOf("· 104") > 0 && bq.indexOf("~") > 0;
    const c = chip({ tipo: "recepcion", legajo: null, ts: "2026-07-06T15:30:00Z" });
    const superpuesta = c.indexOf("· 237") > 0 && c.indexOf("· 104") < 0;
    const sinDato = chip({ tipo: "recepcion", legajo: null, ts: "2026-07-06T09:00:00Z" }) === "";
    const abierta = chip({ tipo: "recepcion", legajo: null, ts: "2026-07-08T18:30:00Z" }).indexOf("· 122") > 0;
    const noInventa = chip({ tipo: "picking", legajo: null, ts: "2026-07-06T15:57:00Z" }) === "";

    // ---- v6.67: "+" entrega completa ----
    _stk = { movs: [
      { id: 1, cod_art: "824", deposito: "a_guardar", delta: 14, tipo: "recepcion", ref: "0245", legajo: null, ts: "2026-07-27T15:35:00" },
      { id: 2, cod_art: "825", deposito: "a_guardar", delta: 25, tipo: "recepcion", ref: "0245", legajo: null, ts: "2026-07-27T15:35:00" }
    ], cutoff: null };
    _stkPop = { kind: "movsArt", cod: "824", codN: _stkNormCod("824"), dep: "a_guardar", titulo: "A guardar", desde: "", hasta: "", npByTanda: {} };
    // el chip 👤 aparece en la fila
    const enTabla = _stkMovsBlock().indexOf("mva-qui") > 0;
    // hay un toggle "+" en la recepción, y NO en un movimiento que no es recepción
    const tienePlus = _stkMovsBlock().indexOf("mva-rto-tg") > 0;
    // abrir la entrega (sin fetch: seedear rtoData como si Control_Modo_OP respondió)
    _stkPop.rtoData = { "0245": { loading: false, rows: [
      { nombre: "Lopez Jose", tipo: "prov_at", fecha: "2026-07-27", detalle: "824 → 14 · 825 → 25", cantidad_total: 39, created_at: "2026-07-27T15:35:50-03:00" }
    ] } };
    _stkPop.rtoOpen = { "1": true };
    const html = _stkMovsBlock();
    const abreDet = html.indexOf("mva-detrow") > 0 && html.indexOf("mva-rto") > 0;
    const traeProv = html.indexOf("Lopez Jose") > 0 && html.indexOf("Proveedor") > 0;
    const traeCods = html.indexOf(">824 ") > 0 && html.indexOf(">825 ") > 0 && html.indexOf(">14<") > 0 && html.indexOf(">25<") > 0;
    const resaltaActual = html.indexOf("mva-rto-it on") > 0;   // 824 = el artículo abierto
    // fallback sin fila de Control_Modo_OP → arma desde _stk.movs (sin proveedor)
    _stkPop.rtoData = { "0245": { loading: false, rows: [] } };
    const hf = _stkRtoDetail(_stk.movs[0]);
    const fallback = hf.indexOf("no registrado") > 0 && hf.indexOf(">824 ") > 0 && hf.indexOf(">825 ") > 0;

    // ---- v6.67: celdas de depósito en 0 clickeables si TUVO movimientos (stk-hist0) ----
    _stk = { cutoff: null, asOf: null, tab: "stocks", filtro: "", openArt: null, factors: {}, dem: {}, cap: [], gConf: [], movs: [
      { cod_art: "026", deposito: "terminado", delta: 334, tipo: "inicial", ts: "2026-07-01T10:00:00" },
      { cod_art: "026", deposito: "a_facturar", delta: 8, tipo: "separado", ts: "2026-07-10T10:00:00" },
      { cod_art: "026", deposito: "a_facturar", delta: -8, tipo: "facturado", ts: "2026-07-11T10:00:00" },
      { cod_art: "026", deposito: "a_guardar", delta: 20, tipo: "recepcion", ref: "0300", ts: "2026-07-05T10:00:00" },
      { cod_art: "026", deposito: "a_guardar", delta: -20, tipo: "guardado", legajo: "104", ts: "2026-07-06T10:00:00" }
    ] };
    if (!document.getElementById("stkBody")) { const d = document.createElement("div"); d.id = "stkBody"; document.body.appendChild(d); }
    let hist0 = false;
    try {
      stkRender();
      const cells = Array.from(document.querySelectorAll("#stkBody td.stk-hist0")).map((td) => td.textContent.trim());
      hist0 = cells.length === 2 && cells.every((t) => t === "0");   // a_facturar y a_guardar en 0 pero con historial
    } catch (_e) { hist0 = false; }

    return { exacto, deducido, superpuesta, sinDato, abierta, noInventa, enTabla, tienePlus, abreDet, traeProv, traeCods, resaltaActual, fallback, hist0 };
  });
  const pass = Object.keys(r).every((k) => r[k] === true) && errs.length === 0;
  console.log("mva-quien:", JSON.stringify(r), "· pageerrors:", errs.length ? errs.join("|") : "none", "·", pass ? "✓ OK" : "✗ FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
