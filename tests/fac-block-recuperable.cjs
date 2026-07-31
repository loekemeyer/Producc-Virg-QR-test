/* Regresión v6.21 (Parte B) — bloqueo del tilde de Facturación cuando el faltante
   es RECUPERABLE (hay stock en "a guardar" o en góndola para completarlo):
   A) faltante recuperable + NO operadora → BLOQUEA (alert, no postea, no factura).
   B) faltante recuperable + operadora (su mail) → deja facturar CORTO + emite FCO (Telegram).
   C) faltante NO recuperable (sin stock) → confirm normal, factura por lo entregado.
   Con fetch/confirm/alert stubbeados. Sale 1 si falla. */
const path = require("path");
let chromium;
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }
catch (_e) {
  try { ({ chromium } = require("playwright")); }
  catch (_e2) { console.error("Playwright no encontrado."); process.exit(2); }
}
(async () => {
  const root = path.join(__dirname, "..");
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("file://" + path.join(root, "index.html"), { waitUntil: "domcontentloaded" });

  const r = await p.evaluate(async () => {
    const out = {};
    function J(data) { return Promise.resolve({ ok: true, status: 200, headers: { get: function () { return null; } }, json: function () { return Promise.resolve(data); } }); }
    // Aisla el tick a la lógica del bloqueo.
    facRender = function () {};
    facShowToast = function () {};
    stockSalidaFacturadoNP = async function () {};
    stockSalidaFacturado = async function () {};
    window.sbAuth = { getAccessToken: async function () { return "tok"; }, lastFailNetwork: false };
    _facTareas = new Map();
    _facLastTandas = [];

    window.__ALERTS = []; window.__POSTS = [];
    window.alert = function (m) { window.__ALERTS.push(String(m)); };
    window.fetch = function (url, opts) {
      url = String(url); const m = (opts && opts.method) || "GET";
      if (m === "POST") { let body = null; try { body = JSON.parse(opts.body); } catch (_e) {} window.__POSTS.push({ url: url, body: body }); }
      return J([]);
    };
    // helper: construye un botón con los args del tilde
    function mkBtn(np) {
      const btn = document.createElement("button");
      btn.dataset.args = JSON.stringify({ np: np, tanda: "D02A", m3: 1, rs: "Distri Norte", cod: "771", feRaw: "2026-07-24" });
      document.body.appendChild(btn);
      return btn;
    }
    const facturoNP = function (np) { return window.__POSTS.some(function (x) { return x.url.indexOf("Facturacion_NP") >= 0 && x.body && String(x.body.np) === String(np); }); };
    const emitioFCO = function (np) { return window.__POSTS.some(function (x) { return x.body && x.body.opcion === "FCO" && String(x.body.texto || "").indexOf(np) === 0; }); };

    // Faltante base: NP 98114, art 315 faltan 10.
    const setFalt = function () { _facFalt = new Map([["98114", { cajas: 10, items: [{ cod: "315", falto: 10, ped: 80 }] }]]); };

    // ---- A) recuperable (a_guardar 10) + NO operadora → BLOQUEA
    window.confirm = function () { return true; };   // aunque diga sí, no debería postear
    __identity = { type: "supervisor", email: "comexloekemeyer@gmail.com", nombre: "otro" };
    setFalt(); _facSaldosN = { "315": { a_guardar: 10, terminado: 0 } }; _facGuardadoHoy = new Set();
    window.__ALERTS = []; window.__POSTS = [];
    await window.facTickNP(mkBtn("98114"));
    out.A_bloqueado = !facturoNP("98114");
    out.A_avisa = window.__ALERTS.some(function (m) { return /NO se factura|autoriz/i.test(m); });
    out.A_sinFCO = !emitioFCO("98114");

    // ---- B) recuperable + OPERADORA → factura corto + FCO
    window.confirm = function () { return true; };
    __identity = { type: "supervisor", email: "loekemeyer.n8n@gmail.com", nombre: "operadora" };
    setFalt(); _facSaldosN = { "315": { a_guardar: 10, terminado: 0 } }; _facGuardadoHoy = new Set();
    window.__ALERTS = []; window.__POSTS = []; _facNpsHoy = new Set(); _facTickedLocal = new Set();
    await window.facTickNP(mkBtn("98114"));
    out.B_facturo = facturoNP("98114");
    out.B_emitioFCO = emitioFCO("98114");

    // ---- B2) recuperable + operadora pero cancela el confirm → NO factura
    window.confirm = function () { return false; };
    setFalt(); _facSaldosN = { "315": { a_guardar: 10, terminado: 0 } };
    window.__POSTS = []; _facNpsHoy = new Set(); _facTickedLocal = new Set();
    await window.facTickNP(mkBtn("98114"));
    out.B2_cancelaNoFactura = !facturoNP("98114");

    // ---- C) NO recuperable (sin stock) + NO operadora → confirm normal, factura
    window.confirm = function () { return true; };
    __identity = { type: "supervisor", email: "comexloekemeyer@gmail.com", nombre: "otro" };
    setFalt(); _facSaldosN = { "315": { a_guardar: 0, terminado: 0 } }; _facGuardadoHoy = new Set();
    window.__ALERTS = []; window.__POSTS = []; _facNpsHoy = new Set(); _facTickedLocal = new Set();
    await window.facTickNP(mkBtn("98114"));
    out.C_facturo = facturoNP("98114");
    out.C_sinBloqueo = !window.__ALERTS.some(function (m) { return /NO se factura/i.test(m); });
    out.C_sinFCO = !emitioFCO("98114");

    return out;
  });

  const okA = r.A_bloqueado && r.A_avisa && r.A_sinFCO;
  const okB = r.B_facturo && r.B_emitioFCO && r.B2_cancelaNoFactura;
  const okC = r.C_facturo && r.C_sinBloqueo && r.C_sinFCO;
  const pass = okA && okB && okC && errs.length === 0;
  console.log("fac-block-recuperable:", JSON.stringify(r));
  console.log("  pageerrors:", errs.length ? errs.join("|") : "none");
  console.log(" ", okA ? "A bloqueo ✓" : "A bloqueo ✗", "·", okB ? "B override ✓" : "B override ✗", "·", okC ? "C normal ✓" : "C normal ✗", "·", pass ? "OK" : "FAIL");
  await b.close();
  process.exit(pass ? 0 : 1);
})();
